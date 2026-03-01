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
    const { sku, stock, location } = req.body;
    logger.info('Request POST /api/stock', { sku, stock, location });

    try {
      const updated = await updateStock(repo)({ sku, stock, location });
      await notifyStockChange({ sku, stock, location });

      logger.info('Success POST /api/stock', { sku, stock, location });
      return res.json(updated);
    } catch (err) {
      logger.error('Error POST /api/stock', { sku, stock, location, error: err.message });
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
