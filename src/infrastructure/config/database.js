import mongoose from 'mongoose';
import logger from './logger.js';

export const connectDB = async (uri) => {
  try {
    await mongoose.connect(uri);
    logger.info('MongoDB conectado', { location: 'database.connectDB' });
  } catch (err) {
    logger.error('Error conectando a MongoDB', { location: 'database.connectDB', error: err });
    process.exit(1);
  }
};
