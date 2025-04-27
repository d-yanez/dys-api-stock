import logger from '../infrastructure/config/logger.js';

export const getStockBySku = (repository) => async (sku) => {
  logger.info('UseCase: getStockBySku entrada', {
    location: 'getStockBySku',
    sku
  });
  const data = await repository.findBySku(Number(sku));
  logger.info('UseCase: getStockBySku salida', {
    location: 'getStockBySku',
    sku,
    records: data.length
  });
  return data;
};

export const getBatchStock = (repository) => async (skusParam) => {
  const skus = skusParam.split(',').map(s => Number(s.trim()));
  logger.info('UseCase: getBatchStock entrada', {
    location: 'getBatchStock',
    skus
  });
  const data = await repository.findBySkus(skus);
  logger.info('UseCase: getBatchStock salida', {
    location: 'getBatchStock',
    skus,
    records: data.length
  });
  return data;
};

export const updateStock = (repository) => async ({ sku, stock, location }) => {
  logger.info('UseCase: updateStock entrada', {
    location: 'updateStock',
    sku,
    stock,
    location
  });
  const updated = await repository.upsertStock({ sku, stock, location });
  logger.info('UseCase: updateStock salida', {
    location: 'updateStock',
    sku,
    stock,
    location,
    updatedId: updated._id
  });
  return updated;
};
