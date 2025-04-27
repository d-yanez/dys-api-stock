import { Router } from 'express';
import StockController from '../controllers/StockController.js';

const router = Router();
router.get('/stock/:sku', StockController.getBySku);
router.get('/batch/sku',  StockController.getBatch);
router.post('/sku',       StockController.update);

export default router;
