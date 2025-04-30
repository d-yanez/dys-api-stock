// src/infrastructure/config/logger.js

import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    // Este printf recoge *todas* las propiedades de info y las serializa
    winston.format.printf(info => {
      const { timestamp, level, message, ...metadata } = info;
      let msg = `${timestamp} [${level}] ${message}`;
      if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
      }
      return msg;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

export default logger;
