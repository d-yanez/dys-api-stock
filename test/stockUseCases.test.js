import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addStockTransaction,
  subStockTransaction,
  updateStock,
  updateStockV2
} from '../src/useCases/stockUseCases.js';

test('legacy update remains a direct non-transactional upsert', async () => {
  const calls = [];
  const repository = {
    async upsertStock(input) {
      calls.push(input);
      return { ...input, _id: 'legacy' };
    }
  };

  const result = await updateStock(repository)({
    sku: 12,
    stock: 4,
    location: ' west ',
    stockItemId: ' item-1 '
  });

  assert.deepEqual(calls, [{ sku: 12, stock: 4, location: ' west ', stockItemId: ' item-1 ' }]);
  assert.equal(result._id, 'legacy');
});

test('V2 canonicalizes identity and semantic payload before repository processing', async () => {
  let received;
  const repository = {
    async processStockUpdateEvent(input) {
      received = input;
      return { response: { sku: input.sku, eventStatus: 'applied' }, shouldNotify: true };
    }
  };

  const result = await updateStockV2(repository)({
    eventKey: ' event-10 ',
    revision: 10,
    sku: '0012',
    stock: 4,
    location: ' west ',
    stockItemId: ' item-1 '
  });

  assert.equal(received.source, 'sheets');
  assert.equal(received.eventKey, 'event-10');
  assert.equal(received.revision, 10);
  assert.equal(received.sku, 12);
  assert.equal(received.location, 'WEST');
  assert.equal(received.stockItemId, 'item-1');
  assert.match(received.payloadHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(result, {
    response: { sku: 12, eventStatus: 'applied' },
    shouldNotify: true
  });
});

test('V2 payload hash is stable for semantically equivalent payloads', async () => {
  const hashes = [];
  const repository = {
    async processStockUpdateEvent(input) {
      hashes.push(input.payloadHash);
      return { response: {}, shouldNotify: false };
    }
  };
  const run = updateStockV2(repository);

  await run({ eventKey: 'a', revision: 1, sku: '12', stock: 4, location: 'west', stockItemId: ' x ' });
  await run({ eventKey: 'b', revision: 2, sku: 12, stock: 4, location: ' WEST ', stockItemId: 'x' });

  assert.equal(hashes[0], hashes[1]);
});

test('/trx add behavior still reports the previous and resulting stock', async () => {
  const repository = {
    async addStockByItemId({ stockItemId, qty, now }) {
      assert.equal(stockItemId, 'item-1');
      assert.equal(qty, 3);
      assert.ok(now instanceof Date);
      return { stockItemId, sku: 12, location: 'WEST', stock: 4 };
    }
  };

  const result = await addStockTransaction(repository)({ stockItemId: 'item-1', qty: 3 });

  assert.equal(result.previousStock, 4);
  assert.equal(result.appliedQty, 3);
  assert.equal(result.newStock, 7);
  assert.equal(result.movement, 'add');
});

test('/trx subtraction remains floor-at-zero and reports the applied quantity', async () => {
  const repository = {
    async subStockByItemId() {
      return { stockItemId: 'item-1', sku: 12, location: 'WEST', stock: 2 };
    }
  };

  const result = await subStockTransaction(repository)({ stockItemId: 'item-1', qty: 5 });

  assert.equal(result.previousStock, 2);
  assert.equal(result.requestedQty, 5);
  assert.equal(result.appliedQty, 2);
  assert.equal(result.newStock, 0);
  assert.equal(result.movement, 'sub');
});

test('/trx behavior still returns null when the stock item does not exist', async () => {
  const repository = {
    async addStockByItemId() {
      return null;
    }
  };

  assert.equal(await addStockTransaction(repository)({ stockItemId: 'missing', qty: 1 }), null);
});
