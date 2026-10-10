import test from 'node:test';
import assert from 'node:assert/strict';

const uri = process.env.MONGODB_URI;
const allowedDatabase = process.env.MONGODB_DB_NAME === 'inventoryErpDB_p1_validation';
const skipReason = !uri
  ? 'MONGODB_URI is not set; replica-set integration is opt-in'
  : (!allowedDatabase ? 'MONGODB_DB_NAME must exactly equal inventoryErpDB_p1_validation' : false);

test('replica-set transaction enforces idempotency and monotonic revision ordering', { skip: skipReason }, async () => {
  const { default: mongoose } = await import('mongoose');
  const { default: StockMongoRepository } = await import('../src/infrastructure/repositories/StockMongoRepository.js');
  const { StockItemModel } = await import('../src/infrastructure/models/StockItem.js');
  const { StockUpdateEventModel } = await import('../src/infrastructure/models/StockUpdateEvent.js');
  const { StockSourceCursorModel } = await import('../src/infrastructure/models/StockSourceCursor.js');
  const { updateStockV2 } = await import('../src/useCases/stockUseCases.js');
  const runId = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`;
  const sku = Number(`${Date.now()}`.slice(-8));
  const location = `P1-${runId}`.toUpperCase();
  const eventPrefix = `p1-${runId}`;

  await mongoose.connect(uri, { dbName: 'inventoryErpDB_p1_validation' });
  try {
    await Promise.all([
      StockUpdateEventModel.init(),
      StockSourceCursorModel.init(),
      StockItemModel.init()
    ]);
    const update = updateStockV2(new StockMongoRepository());
    const base = { sku, location };

    const concurrent = await Promise.all([
      update({ ...base, stock: 10, eventKey: `${eventPrefix}-10`, revision: 10 }),
      update({ ...base, stock: 11, eventKey: `${eventPrefix}-11`, revision: 11 })
    ]);
    assert.equal(concurrent.filter(result => result.shouldNotify).length >= 1, true);

    const stored = await StockItemModel.findOne({ sku, location }).lean();
    const cursor = await StockSourceCursorModel.findOne({ source: 'sheets', sku, location }).lean();
    assert.equal(stored.stock, 11);
    assert.equal(cursor.revision, 11);

    const replay = await update({ ...base, stock: 11, eventKey: `${eventPrefix}-11`, revision: 11 });
    const revision11 = concurrent[1];
    assert.deepEqual(replay.response, revision11.response);
    assert.equal(replay.shouldNotify, false);

    await assert.rejects(
      update({ ...base, stock: 99, eventKey: `${eventPrefix}-11`, revision: 11 }),
      error => error.code === 'STOCK_EVENT_CONFLICT'
    );

    const stale = await update({ ...base, stock: 9, eventKey: `${eventPrefix}-9`, revision: 9 });
    assert.equal(stale.response.eventStatus, 'noop_stale');
    assert.equal(stale.response.stock, 11);
  } finally {
    await Promise.all([
      StockItemModel.deleteMany({ sku, location }),
      StockUpdateEventModel.deleteMany({ source: 'sheets', eventKey: { $regex: `^${eventPrefix}` } }),
      StockSourceCursorModel.deleteMany({ source: 'sheets', sku, location })
    ]);
    await mongoose.disconnect();
  }
});
