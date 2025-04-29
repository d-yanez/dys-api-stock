import logger from '../config/logger.js';
import { API_KEY } from '../config/index.js';

export default function apiKeyAuth(req, res, next) {
  const incomingKey = req.header('x-api-key');
  if (!incomingKey) {
    logger.warn('API key missing', {
      location: 'apiKeyAuth',
      ip: req.ip,
      path: req.originalUrl
    });
    return res.status(401).json({ error: 'API key missing' });
  }

  if (incomingKey !== API_KEY) {
    logger.warn('API key invalid', {
      location: 'apiKeyAuth',
      provided: incomingKey,
      ip: req.ip,
      path: req.originalUrl
    });
    return res.status(403).json({ error: 'API key invalid' });
  }

  next();
}
