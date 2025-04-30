// src/infrastructure/services/TelegramService.js

import axios from 'axios';
import logger from '../config/logger.js';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../config/index.js';

/**
 * Envía una notificación a Telegram con la información de actualización de stock.
 *
 * @param {Object} params
 * @param {number} params.sku
 * @param {number} params.stock
 * @param {string} params.location
 */
export const notifyStockChange = async ({ sku, stock, location }) => {
  const text = `🛎️ *Stock actualizado*\n• SKU: ${sku}\n• Location: ${location}\n• Nuevo stock: ${stock}`;

  logger.info('TelegramService: preparando notificación', {
    location: 'TelegramService.notifyStockChange',
    sku,
    stock,
    location
  });

  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown'
      }
    );

    logger.info('TelegramService: notificación enviada', {
      location: 'TelegramService.notifyStockChange',
      telegramResponse: {
        status: res.status,
        ok: res.data.ok,
        messageId: res.data.result?.message_id
      }
    });
  } catch (err) {
    const details = err.response?.data || err.message;
    logger.error('TelegramService: error enviando notificación', {
      location: 'TelegramService.notifyStockChange',
      error: err.message,
      details
    });
    // Si quieres que el error detenga el flujo, descomenta la siguiente línea:
    // throw err;
  }
};
