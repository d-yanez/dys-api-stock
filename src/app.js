import express from 'express';
import logger from './infrastructure/config/logger.js';
import { connectDB } from './infrastructure/config/database.js';
import stockRoutes from './infrastructure/routes/stockRoutes.js';
import { MONGODB_URI, PORT } from './infrastructure/config/index.js';

const app = express();

app.use(express.json());
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, { location: 'middleware.request' });
  next();
});

// Conexión a MongoDB
connectDB(MONGODB_URI);

// Rutas del API
app.use('/api', stockRoutes);

// Arranque del servidor
app.listen(Number(PORT), () => {
  logger.info(`Servidor arrancado en puerto ${PORT}`, { location: 'app.listen' });
});
