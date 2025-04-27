import axios from 'axios';
import logger from '../config/logger.js';

export const notifyStockChange = async ({ sku, stock, location, botToken, chatId }) => {
  const text = `🛎️ *Stock actualizado*\n• SKU: ${sku}\n• Location: ${location}\n• Nuevo stock: ${stock}`;
  logger.info('TelegramService: preparando notificación', {
    location: 'TelegramService.notifyStockChange',
    sku,
    stock,
    location
  });

  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      }
    );
    logger.info('TelegramService: notificación enviada', {
      location: 'TelegramService.notifyStockChange',
      telegramResponse: {
        status: res.status,
        ok: res.data.ok,
        resultId: res.data.result?.message_id
      }
    });
  } catch (err) {
    logger.error('TelegramService: error enviando notificación', {
      location: 'TelegramService.notifyStockChange',
      error: err.message,
      details: err.response?.data
    });
  }
};
