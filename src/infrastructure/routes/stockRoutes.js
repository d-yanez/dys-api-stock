// src/infrastructure/routes/stockRoutes.js

import { Router } from 'express';
import StockController from '../controllers/StockController.js';

const router = Router();

// Consulta de un único SKU
router.get('/stock/:sku', StockController.getBySku);

// Consulta batch de SKUs
router.get('/batch/sku', StockController.getBatch);

// Creación / actualización de stock
router.post('/stock', StockController.update);

export default router;
