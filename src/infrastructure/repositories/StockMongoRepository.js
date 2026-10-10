import mongoose from 'mongoose';
import StockRepository from '../../domain/repositories/StockRepository.js';
import { StockItemModel } from '../models/StockItem.js';
import { StockUpdateEventModel } from '../models/StockUpdateEvent.js';
import { StockSourceCursorModel } from '../models/StockSourceCursor.js';
import logger from '../config/logger.js';

const MAX_TRANSACTION_ATTEMPTS = 3;
const CONFLICT_CODE = 'STOCK_EVENT_CONFLICT';

const conflict = () => {
  const error = new Error('El evento entra en conflicto con un evento almacenado');
  error.code = CONFLICT_CODE;
  return error;
};

export const isRetryableTransactionError = (error) => {
  if (error?.hasErrorLabel?.('UnknownTransactionCommitResult')) {
    return false;
  }

  return Boolean(
    error?.code === 11000 ||
    error?.code === 112 ||
    error?.hasErrorLabel?.('TransientTransactionError')
  );
};

const storedResult = (response) => ({ response, shouldNotify: false });

export default class StockMongoRepository extends StockRepository {
  constructor({
    mongoose: mongooseClient = mongoose,
    StockItemModel: stockItemModel = StockItemModel,
    StockUpdateEventModel: stockUpdateEventModel = StockUpdateEventModel,
    StockSourceCursorModel: stockSourceCursorModel = StockSourceCursorModel
  } = {}) {
    super();
    this.mongoose = mongooseClient;
    this.StockItemModel = stockItemModel;
    this.StockUpdateEventModel = stockUpdateEventModel;
    this.StockSourceCursorModel = stockSourceCursorModel;
  }

  async findBySku(sku) {
    logger.info('Repo: iniciando findBySku', {
      location: 'StockMongoRepository.findBySku',
      sku
    });
    const result = await this.StockItemModel.find({ sku }).lean();
    logger.info('Repo: resultado findBySku', {
      location: 'StockMongoRepository.findBySku',
      sku,
      count: result.length
    });
    return result;
  }

  async findBySkus(skus) {
    logger.info('Repo: iniciando findBySkus', {
      location: 'StockMongoRepository.findBySkus',
      skus
    });
    const result = await this.StockItemModel.find({ sku: { $in: skus } }).lean();
    logger.info('Repo: resultado findBySkus', {
      location: 'StockMongoRepository.findBySkus',
      skus,
      count: result.length
    });
    return result;
  }

  async upsertStock({ sku, stock, location, stockItemId }) {
    logger.info('Repo: iniciando upsertStock', {
      location: 'StockMongoRepository.upsertStock',
      sku,
      stock,
      location,
      stockItemId
    });

    const setPayload = {
      stock,
      lastUpdate: new Date()
    };

    if (stockItemId !== undefined) {
      setPayload.stockItemId = stockItemId;
    }

    const updated = await this.StockItemModel.findOneAndUpdate(
      { sku, location },
      { $set: setPayload },
      { upsert: true, new: true }
    ).lean();
    logger.info('Repo: upsertStock completado', {
      location: 'StockMongoRepository.upsertStock',
      sku,
      stock,
      location,
      stockItemId,
      updatedId: updated._id
    });
    return updated;
  }

  async processStockUpdateEvent(event) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt++) {
      const session = await this.mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await this.#processStockUpdateEventInTransaction(event, session);
        });
        return result;
      } catch (error) {
        lastError = error;
        // withTransaction owns commit retries. If it still reports an unknown commit
        // result, fail closed: Telegram is outside MongoDB and has no idempotency
        // contract, so neither notifying nor suppressing a replay is known to be safe.
        if (!isRetryableTransactionError(error) || attempt === MAX_TRANSACTION_ATTEMPTS) {
          throw error;
        }
      } finally {
        await session.endSession();
      }
    }

    throw lastError;
  }

  async #processStockUpdateEventInTransaction(event, session) {
    const receipt = await this.StockUpdateEventModel.findOne({
      source: event.source,
      eventKey: event.eventKey
    }).session(session).lean();

    if (receipt) {
      if (receipt.payloadHash !== event.payloadHash || receipt.revision !== event.revision) {
        throw conflict();
      }
      return storedResult(receipt.response);
    }

    const cursorScope = {
      source: event.source,
      sku: event.sku,
      location: event.location
    };
    const cursor = await this.StockSourceCursorModel.findOne(cursorScope).session(session).lean();

    if (cursor && event.revision === cursor.revision) {
      if (cursor.eventKey !== event.eventKey || cursor.payloadHash !== event.payloadHash) {
        throw conflict();
      }
      await this.#storeReceipt(event, cursor.response, session);
      return storedResult(cursor.response);
    }

    if (cursor && event.revision < cursor.revision) {
      const current = await this.StockItemModel.findOne({
        sku: event.sku,
        location: event.location
      }).session(session).lean();
      const response = { ...current, eventStatus: 'noop_stale' };
      await this.#storeReceipt(event, response, session);
      return storedResult(response);
    }

    const setPayload = {
      stock: event.stock,
      lastUpdate: new Date()
    };
    if (event.stockItemId !== undefined) {
      setPayload.stockItemId = event.stockItemId;
    }

    const updated = await this.StockItemModel.findOneAndUpdate(
      { sku: event.sku, location: event.location },
      { $set: setPayload },
      { upsert: true, new: true, session }
    ).lean();
    const response = { ...updated, eventStatus: 'applied' };
    const cursorRecord = {
      ...cursorScope,
      revision: event.revision,
      eventKey: event.eventKey,
      payloadHash: event.payloadHash,
      response
    };

    if (cursor) {
      await this.StockSourceCursorModel.updateOne(
        { ...cursorScope, revision: cursor.revision },
        { $set: cursorRecord },
        { session }
      );
    } else {
      await this.StockSourceCursorModel.create([cursorRecord], { session });
    }
    await this.#storeReceipt(event, response, session);

    return { response, shouldNotify: true };
  }

  async #storeReceipt(event, response, session) {
    await this.StockUpdateEventModel.create([{
      source: event.source,
      eventKey: event.eventKey,
      revision: event.revision,
      sku: event.sku,
      location: event.location,
      payloadHash: event.payloadHash,
      response
    }], { session });
  }

  async addStockByItemId({ stockItemId, qty, now }) {
    logger.info('Repo: iniciando addStockByItemId', {
      location: 'StockMongoRepository.addStockByItemId',
      stockItemId,
      qty
    });

    const previous = await this.StockItemModel.findOneAndUpdate(
      { stockItemId },
      {
        $inc: { stock: qty },
        $set: { lastUpdate: now }
      },
      { new: false }
    ).lean();

    logger.info('Repo: resultado addStockByItemId', {
      location: 'StockMongoRepository.addStockByItemId',
      stockItemId,
      found: Boolean(previous)
    });

    return previous;
  }

  async subStockByItemId({ stockItemId, qty, now }) {
    logger.info('Repo: iniciando subStockByItemId', {
      location: 'StockMongoRepository.subStockByItemId',
      stockItemId,
      qty
    });

    const previous = await this.StockItemModel.findOneAndUpdate(
      { stockItemId },
      [
        {
          $set: {
            stock: { $max: [0, { $subtract: ['$stock', qty] }] },
            lastUpdate: now
          }
        }
      ],
      { new: false }
    ).lean();

    logger.info('Repo: resultado subStockByItemId', {
      location: 'StockMongoRepository.subStockByItemId',
      stockItemId,
      found: Boolean(previous)
    });

    return previous;
  }
}
