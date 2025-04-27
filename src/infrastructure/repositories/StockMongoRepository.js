import StockRepository from '../../domain/repositories/StockRepository.js';
import { StockItemModel } from '../models/StockItem.js';
import logger from '../config/logger.js';

export default class StockMongoRepository extends StockRepository {
  async findBySku(sku) {
    logger.info('Repo: iniciando findBySku', {
      location: 'StockMongoRepository.findBySku',
      sku
    });
    const result = await StockItemModel.find({ sku }).lean();
    logger.info('Repo: resultado findBySku', {
      location: 'StockMongoRepository.findBySku',
      sku,
      count: result.length
    });
    return result;
  }

  async findBySkus(skus) {
    logger.info('Repo: iniciando findBySkus', {
      location: 'StockMongoRepository.findBySkus',
      skus
    });
    const result = await StockItemModel.find({ sku: { $in: skus } }).lean();
    logger.info('Repo: resultado findBySkus', {
      location: 'StockMongoRepository.findBySkus',
      skus,
      count: result.length
    });
    return result;
  }

  async upsertStock({ sku, stock, location }) {
    logger.info('Repo: iniciando upsertStock', {
      location: 'StockMongoRepository.upsertStock',
      sku,
      stock,
      location
    });
    const updated = await StockItemModel.findOneAndUpdate(
      { sku, location },
      { $set: { stock, lastUpdate: new Date() } },
      { upsert: true, new: true }
    ).lean();
    logger.info('Repo: upsertStock completado', {
      location: 'StockMongoRepository.upsertStock',
      sku,
      stock,
      location,
      updatedId: updated._id
    });
    return updated;
  }
}
