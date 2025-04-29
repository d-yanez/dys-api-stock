import express from 'express';
import logger from './infrastructure/config/logger.js';
import { connectDB } from './infrastructure/config/database.js';
import { MONGODB_URI, PORT } from './infrastructure/config/index.js';

import apiKeyAuth from './infrastructure/middleware/apiKeyAuth.js';
import stockRoutes from './infrastructure/routes/stockRoutes.js';

const app = express();

// Middlewares
app.use(express.json());
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, { location: 'middleware.request' });
  next();
});

// Conexión a MongoDB
connectDB(MONGODB_URI);

// Validación de API Key para todas las rutas /api
app.use('/api', apiKeyAuth, stockRoutes);

// Inicio del servidor
app.listen(Number(PORT), () => {
  logger.info(`Servidor arrancado en puerto ${PORT}`, { location: 'app.listen' });
});
