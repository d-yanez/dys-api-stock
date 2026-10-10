// src/infrastructure/controllers/StockController.js

import {
  getStockBySku,
  getBatchStock,
  updateStock,
  updateStockV2,
  addStockTransaction,
  subStockTransaction
} from '../../useCases/stockUseCases.js';
import StockMongoRepository from '../repositories/StockMongoRepository.js';
import { notifyStockChange } from '../services/TelegramService.js';
import logger from '../config/logger.js';

const repo = new StockMongoRepository();
const stockResponseMapper = (item) => ({
  stockItemId: item.stockItemId,
  sku: item.sku,
  location: item.location,
  stock: item.stock
});

const validateMovementBody = (body) => {
  const stockItemId = typeof body.stockItemId === 'string' ? body.stockItemId.trim() : '';
  const qty = Number(body.stock);

  if (!stockItemId) {
    return { valid: false, error: 'stockItemId es requerido' };
  }

  if (!Number.isInteger(qty) || qty <= 0) {
    return { valid: false, error: 'stock debe ser un entero mayor a 0' };
  }

  return { valid: true, stockItemId, qty };
};

const validateUpdateBody = (body) => {
  const sku = Number(body.sku);
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const stock = Number(body.stock);
  let stockItemId;

  if (!Number.isFinite(sku)) {
    return { valid: false, error: 'sku debe ser number requerido' };
  }

  if (!location) {
    return { valid: false, error: 'location debe ser string requerido' };
  }

  if (!Number.isInteger(stock) || stock < 0) {
    return { valid: false, error: 'stock debe ser integer >= 0 requerido' };
  }

  if (body.stockItemId !== undefined) {
    if (typeof body.stockItemId !== 'string') {
      return { valid: false, error: 'stockItemId debe ser string opcional' };
    }

    stockItemId = body.stockItemId.trim();
    if (!stockItemId) {
      return { valid: false, error: 'stockItemId no debe ser vacío' };
    }
  }

  return { valid: true, sku, location, stock, stockItemId };
};

const validateEventHeaders = (req) => {
  const rawEventKey = req.get('Idempotency-Key');
  const rawRevision = req.get('X-Event-Revision');
  const hasEventKey = rawEventKey !== undefined;
  const hasRevision = rawRevision !== undefined;

  if (hasEventKey !== hasRevision) {
    return { valid: false, error: 'Idempotency-Key y X-Event-Revision deben enviarse juntos' };
  }
  if (!hasEventKey) {
    return { valid: true, v2: false };
  }
  if (typeof rawEventKey !== 'string') {
    return { valid: false, error: 'Idempotency-Key inválido' };
  }

  const eventKey = rawEventKey.trim();
  if (!eventKey || eventKey.length > 200) {
    return { valid: false, error: 'Idempotency-Key debe tener entre 1 y 200 caracteres' };
  }
  if (typeof rawRevision !== 'string' || !/^[1-9]\d*$/.test(rawRevision)) {
    return { valid: false, error: 'X-Event-Revision debe ser un entero positivo canónico' };
  }

  const revision = Number(rawRevision);
  if (!Number.isSafeInteger(revision) || String(revision) !== rawRevision) {
    return { valid: false, error: 'X-Event-Revision debe ser un entero positivo seguro' };
  }

  return { valid: true, v2: true, eventKey, revision };
};

export const createUpdateHandler = ({ repository, notify }) => async (req, res) => {
  const bodyValidation = validateUpdateBody(req.body);
  const eventValidation = validateEventHeaders(req);
  logger.info('Request POST /api/stock', { body: req.body });

  if (!bodyValidation.valid) {
    return res.status(400).json({ error: bodyValidation.error });
  }
  if (!eventValidation.valid) {
    return res.status(400).json({ error: eventValidation.error });
  }

  try {
    if (!eventValidation.v2) {
      const updated = await updateStock(repository)({
        sku: bodyValidation.sku,
        stock: bodyValidation.stock,
        location: bodyValidation.location,
        stockItemId: bodyValidation.stockItemId
      });
      await notify({
        sku: bodyValidation.sku,
        stock: bodyValidation.stock,
        location: bodyValidation.location
      });
      return res.json(updated);
    }

    const result = await updateStockV2(repository)({
      eventKey: eventValidation.eventKey,
      revision: eventValidation.revision,
      sku: bodyValidation.sku,
      stock: bodyValidation.stock,
      location: bodyValidation.location,
      stockItemId: bodyValidation.stockItemId
    });

    if (result.shouldNotify) {
      try {
        await notify({
          sku: bodyValidation.sku,
          stock: bodyValidation.stock,
          location: bodyValidation.location.trim().toUpperCase()
        });
      } catch (err) {
        logger.error('Error notificando actualización V2 de stock ya confirmada', {
          sku: bodyValidation.sku,
          stock: bodyValidation.stock,
          location: bodyValidation.location,
          stockItemId: bodyValidation.stockItemId,
          error: err.message
        });
      }
    }
    return res.status(200).json(result.response);
  } catch (err) {
    logger.error('Error POST /api/stock', {
      sku: bodyValidation.sku,
      stock: bodyValidation.stock,
      location: bodyValidation.location,
      stockItemId: bodyValidation.stockItemId,
      error: err.message
    });
    if (err.code === 'STOCK_EVENT_CONFLICT') {
      return res.status(409).json({ error: 'Evento en conflicto' });
    }
    return res.status(500).json({ error: 'Error interno' });
  }
};

export default class StockController {
  /**
   * GET /api/stock/:sku
   */
  static getBySku = async (req, res) => {
    const { sku } = req.params;
    logger.info('Request GET /api/stock/:sku', { sku });

    try {
      const data = await getStockBySku(repo)(sku);
      const response = data.map(stockResponseMapper);

      logger.info('Success GET /api/stock/:sku', { sku, count: response.length });
      return res.json(response);
    } catch (err) {
      logger.error('Error GET /api/stock/:sku', { sku, error: err.message });
      return res.status(500).json({ error: 'Error interno' });
    }
  };

  /**
   * GET /api/batch/sku?skus=...
   */
  static getBatch = async (req, res) => {
    const { skus } = req.query;
    logger.info('Request GET /api/batch/sku', { skus });

    try {
      const data = await getBatchStock(repo)(skus);
      const response = data.map(stockResponseMapper);

      logger.info('Success GET /api/batch/sku', { skus, count: response.length });
      return res.json(response);
    } catch (err) {
      logger.error('Error GET /api/batch/sku', { skus, error: err.message });
      return res.status(500).json({ error: 'Error interno' });
    }
  };

  /**
   * POST /api/stock
   */
  static update = createUpdateHandler({ repository: repo, notify: notifyStockChange });

  /**
   * POST /api/stock/trx/add
   */
  static trxAdd = async (req, res) => {
    const validation = validateMovementBody(req.body);
    logger.info('Request POST /api/stock/trx/add', { body: req.body });

    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    try {
      const result = await addStockTransaction(repo)({
        stockItemId: validation.stockItemId,
        qty: validation.qty
      });

      if (!result) {
        return res.status(404).json({ error: 'stockItemId no existe' });
      }

      logger.info('Success POST /api/stock/trx/add', {
        stockItemId: result.stockItemId,
        previousStock: result.previousStock,
        newStock: result.newStock
      });
      return res.status(200).json(result);
    } catch (err) {
      logger.error('Error POST /api/stock/trx/add', {
        stockItemId: validation.stockItemId,
        stock: validation.qty,
        error: err.message
      });
      return res.status(500).json({ error: 'Error interno' });
    }
  };

  /**
   * POST /api/stock/trx/sub
   */
  static trxSub = async (req, res) => {
    const validation = validateMovementBody(req.body);
    logger.info('Request POST /api/stock/trx/sub', { body: req.body });

    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    try {
      const result = await subStockTransaction(repo)({
        stockItemId: validation.stockItemId,
        qty: validation.qty
      });

      if (!result) {
        return res.status(404).json({ error: 'stockItemId no existe' });
      }

      logger.info('Success POST /api/stock/trx/sub', {
        stockItemId: result.stockItemId,
        previousStock: result.previousStock,
        newStock: result.newStock,
        appliedQty: result.appliedQty
      });
      return res.status(200).json(result);
    } catch (err) {
      logger.error('Error POST /api/stock/trx/sub', {
        stockItemId: validation.stockItemId,
        stock: validation.qty,
        error: err.message
      });
      return res.status(500).json({ error: 'Error interno' });
    }
  };
}
