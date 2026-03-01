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

// Movimientos de inventario por stockItemId
router.post('/stock/trx/add', StockController.trxAdd);
router.post('/stock/trx/sub', StockController.trxSub);

export default router;
