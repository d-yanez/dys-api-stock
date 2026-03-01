import StockRepository from '../../domain/repositories/StockRepository.js';
import { StockItemModel } from '../models/StockItem.js';
import logger from '../config/logger.js';

export default class StockMongoRepository extends StockRepository {
  async findBySku(sku) {
    logger.info('Repo: iniciando findBySku', {
      location: 'StockMongoRepository.findBySku',
      sku
    });
    const result = await StockItemModel.find({ sku }).lean();
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
    const result = await StockItemModel.find({ sku: { $in: skus } }).lean();
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

    const updated = await StockItemModel.findOneAndUpdate(
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

  async addStockByItemId({ stockItemId, qty, now }) {
    logger.info('Repo: iniciando addStockByItemId', {
      location: 'StockMongoRepository.addStockByItemId',
      stockItemId,
      qty
    });

    const previous = await StockItemModel.findOneAndUpdate(
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

    const previous = await StockItemModel.findOneAndUpdate(
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
