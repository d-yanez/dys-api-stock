// src/infrastructure/controllers/StockController.js

import {
  getStockBySku,
  getBatchStock,
  updateStock,
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
  static update = async (req, res) => {
    const validation = validateUpdateBody(req.body);
    logger.info('Request POST /api/stock', { body: req.body });

    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    try {
      const updated = await updateStock(repo)({
        sku: validation.sku,
        stock: validation.stock,
        location: validation.location,
        stockItemId: validation.stockItemId
      });
      await notifyStockChange({
        sku: validation.sku,
        stock: validation.stock,
        location: validation.location
      });

      logger.info('Success POST /api/stock', {
        sku: validation.sku,
        stock: validation.stock,
        location: validation.location,
        stockItemId: validation.stockItemId
      });
      return res.json(updated);
    } catch (err) {
      logger.error('Error POST /api/stock', {
        sku: validation.sku,
        stock: validation.stock,
        location: validation.location,
        stockItemId: validation.stockItemId,
        error: err.message
      });
      return res.status(500).json({ error: 'Error interno' });
    }
  };

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
