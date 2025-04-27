// src/infrastructure/controllers/StockController.js

import { getStockBySku, getBatchStock, updateStock } from '../../useCases/stockUseCases.js';
import StockMongoRepository from '../repositories/StockMongoRepository.js';
import { notifyStockChange } from '../services/TelegramService.js';
import logger from '../config/logger.js';

const repo = new StockMongoRepository();

export default class StockController {
  /**
   * GET /api/stock/:sku
   * Devuelve todos los registros con solo { sku, location, stock }
   */
  static getBySku = async (req, res) => {
    const { sku } = req.params;
    logger.info('Controller: GET /stock/:sku recibido', {
      location: 'StockController.getBySku',
      sku
    });

    try {
      const data = await getStockBySku(repo)(sku);

      // Transformación a formato compacto para todos los registros
      const response = data.map(item => ({
        sku: item.sku,
        location: item.location,
        stock: item.stock
      }));

      logger.info('Controller: GET /stock/:sku respuesta compacta', {
        location: 'StockController.getBySku',
        total: response.length
      });

      return res.json(response);
    } catch (err) {
      logger.error('Controller: GET /stock/:sku error', {
        location: 'StockController.getBySku',
        error: err.message
      });
      return res.status(500).json({ error: 'Error interno' });
    }
  };

  /**
   * GET /api/batch/sku?skus=111,222,333
   * Devuelve todos los registros con solo { sku, location, stock }
   */
  static getBatch = async (req, res) => {
    const { skus } = req.query;
    logger.info('Controller: GET /batch/sku recibido', {
      location: 'StockController.getBatch',
      skus
    });

    try {
      const data = await getBatchStock(repo)(skus);

      // Transformación a formato compacto para todos los registros
      const response = data.map(item => ({
        sku: item.sku,
        location: item.location,
        stock: item.stock
      }));

      logger.info('Controller: GET /batch/sku respuesta compacta', {
        location: 'StockController.getBatch',
        total: response.length
      });

      return res.json(response);
    } catch (err) {
      logger.error('Controller: GET /batch/sku error', {
        location: 'StockController.getBatch',
        error: err.message
      });
      return res.status(500).json({ error: 'Error interno' });
    }
  };

  /**
   * POST /api/sku
   * Crea o actualiza el stock y envía notificación a Telegram
   */
  static update = async (req, res) => {
    const { sku, stock, location } = req.body;
    logger.info('Controller: POST /sku recibido', {
      location: 'StockController.update',
      body: req.body
    });

    try {
      const updated = await updateStock(repo)({ sku, stock, location });

      await notifyStockChange({ sku, stock, location });

      logger.info('Controller: POST /sku éxito', {
        location: 'StockController.update',
        updated
      });

      return res.json(updated);
    } catch (err) {
      logger.error('Controller: POST /sku error', {
        location: 'StockController.update',
        error: err.message
      });
      return res.status(500).json({ error: 'Error interno' });
    }
  };
}
