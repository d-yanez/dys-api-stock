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

const buildTransactionResponse = ({ previous, movement, requestedQty, now }) => {
  const previousStock = Number(previous.stock ?? 0);
  const appliedQty = movement === 'sub'
    ? Math.min(previousStock, requestedQty)
    : requestedQty;
  const newStock = movement === 'sub'
    ? Math.max(0, previousStock - requestedQty)
    : previousStock + requestedQty;

  return {
    stockItemId: previous.stockItemId,
    sku: previous.sku,
    location: previous.location,
    previousStock,
    movement,
    requestedQty,
    appliedQty,
    newStock,
    lastUpdate: now.toISOString()
  };
};

export const addStockTransaction = (repository) => async ({ stockItemId, qty }) => {
  logger.info('UseCase: addStockTransaction entrada', {
    location: 'addStockTransaction',
    stockItemId,
    qty
  });

  // TODO: implementar idempotencyKey para deduplicar retries de clientes.
  const now = new Date();
  const previous = await repository.addStockByItemId({ stockItemId, qty, now });

  if (!previous) {
    logger.warn('UseCase: addStockTransaction stockItemId no encontrado', {
      location: 'addStockTransaction',
      stockItemId
    });
    return null;
  }

  const response = buildTransactionResponse({
    previous,
    movement: 'add',
    requestedQty: qty,
    now
  });

  logger.info('UseCase: addStockTransaction salida', {
    location: 'addStockTransaction',
    stockItemId,
    qty,
    previousStock: response.previousStock,
    newStock: response.newStock
  });

  return response;
};

export const subStockTransaction = (repository) => async ({ stockItemId, qty }) => {
  logger.info('UseCase: subStockTransaction entrada', {
    location: 'subStockTransaction',
    stockItemId,
    qty
  });

  // TODO: implementar idempotencyKey para deduplicar retries de clientes.
  const now = new Date();
  const previous = await repository.subStockByItemId({ stockItemId, qty, now });

  if (!previous) {
    logger.warn('UseCase: subStockTransaction stockItemId no encontrado', {
      location: 'subStockTransaction',
      stockItemId
    });
    return null;
  }

  const response = buildTransactionResponse({
    previous,
    movement: 'sub',
    requestedQty: qty,
    now
  });

  logger.info('UseCase: subStockTransaction salida', {
    location: 'subStockTransaction',
    stockItemId,
    qty,
    previousStock: response.previousStock,
    newStock: response.newStock,
    appliedQty: response.appliedQty
  });

  return response;
};
