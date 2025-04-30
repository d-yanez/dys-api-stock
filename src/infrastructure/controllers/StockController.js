// src/infrastructure/controllers/StockController.js

import { getStockBySku, getBatchStock, updateStock } from '../../useCases/stockUseCases.js';
import StockMongoRepository from '../repositories/StockMongoRepository.js';
import { notifyStockChange } from '../services/TelegramService.js';
import logger from '../config/logger.js';

const repo = new StockMongoRepository();

export default class StockController {
  /**
   * GET /api/stock/:sku
   */
  static getBySku = async (req, res) => {
    const { sku } = req.params;
    logger.info('Request GET /api/stock/:sku', { sku });

    try {
      const data = await getStockBySku(repo)(sku);
      const response = data.map(item => ({
        sku: item.sku,
        location: item.location,
        stock: item.stock
      }));

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
      const response = data.map(item => ({
        sku: item.sku,
        location: item.location,
        stock: item.stock
      }));

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
}
