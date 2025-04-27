import { getStockBySku, getBatchStock, updateStock } from '../../useCases/stockUseCases.js';
import StockMongoRepository from '../repositories/StockMongoRepository.js';
import { notifyStockChange } from '../services/TelegramService.js';
import logger from '../config/logger.js';

const repo = new StockMongoRepository();

export default class StockController {
  static getBySku = async (req, res) => {
    try {
      const data = await getStockBySku(repo)(req.params.sku);
      res.json(data);
    } catch (err) {
      logger.error('getBySku error', { err });
      res.status(500).json({ error: 'Error interno' });
    }
  };

  static getBatch = async (req, res) => {
    try {
      const data = await getBatchStock(repo)(req.query.skus);
      res.json(data);
    } catch (err) {
      logger.error('getBatch error', { err });
      res.status(500).json({ error: 'Error interno' });
    }
  };

  static update = async (req, res) => {
    try {
      const { sku, stock, location } = req.body;
      const updated = await updateStock(repo)({ sku, stock, location });
      await notifyStockChange({
        sku, stock, location,
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID
      });
      res.json(updated);
    } catch (err) {
      logger.error('update error', { err });
      res.status(500).json({ error: 'Error interno' });
    }
  };
}
