import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateHandler } from '../src/infrastructure/controllers/StockController.js';

const responseDouble = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

const request = ({ body = {}, headers = {} } = {}) => ({
  body,
  get(name) {
    const key = Object.keys(headers).find(candidate => candidate.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : headers[key];
  }
});

const validBody = { sku: 123, stock: 7, location: ' north ', stockItemId: ' item-7 ' };

test('legacy update uses upsert and sends exactly one notification', async () => {
  const calls = { upsert: 0, event: 0, notify: 0 };
  const handler = createUpdateHandler({
    repository: {
      async upsertStock(input) { calls.upsert++; return { _id: 'x', ...input }; },
      async processStockUpdateEvent() { calls.event++; }
    },
    notify: async () => { calls.notify++; }
  });
  const res = responseDouble();

  await handler(request({ body: validBody }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, { upsert: 1, event: 0, notify: 1 });
  assert.equal(res.body.location, 'north');
});

test('exactly one V2 header returns 400 without mutation', async () => {
  let called = false;
  const handler = createUpdateHandler({
    repository: { async upsertStock() { called = true; } },
    notify: async () => { called = true; }
  });

  for (const headers of [
    { 'Idempotency-Key': 'event' },
    { 'X-Event-Revision': '1' }
  ]) {
    const res = responseDouble();
    await handler(request({ body: validBody, headers }), res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(called, false);
});

test('V2 rejects invalid idempotency keys and non-canonical revisions', async () => {
  const handler = createUpdateHandler({ repository: {}, notify: async () => {} });
  const invalidKeys = ['', ' '.repeat(3), 'x'.repeat(201)];
  for (const eventKey of invalidKeys) {
    const res = responseDouble();
    await handler(request({ body: validBody, headers: {
      'Idempotency-Key': eventKey,
      'X-Event-Revision': '1'
    } }), res);
    assert.equal(res.statusCode, 400);
  }

  for (const revision of ['0', '-1', '+1', '01', '1.0', '1e2', '9007199254740992', ' 1 ']) {
    const res = responseDouble();
    await handler(request({ body: validBody, headers: {
      'Idempotency-Key': 'event',
      'X-Event-Revision': revision
    } }), res);
    assert.equal(res.statusCode, 400, revision);
  }
});

test('V2 only notifies newly applied updates after processing', async () => {
  const order = [];
  const repository = {
    async processStockUpdateEvent() {
      order.push('commit');
      return { response: { sku: 123, stock: 7, location: 'NORTH', eventStatus: 'applied' }, shouldNotify: true };
    }
  };
  const handler = createUpdateHandler({ repository, notify: async () => { order.push('notify'); } });
  const res = responseDouble();

  await handler(request({ body: validBody, headers: {
    'Idempotency-Key': ' event-1 ',
    'X-Event-Revision': '1'
  } }), res);

  assert.deepEqual(order, ['commit', 'notify']);
  assert.equal(res.body.eventStatus, 'applied');
});

test('V2 returns the committed response when its notification fails', async () => {
  const committed = { sku: 123, stock: 7, location: 'NORTH', eventStatus: 'applied' };
  const handler = createUpdateHandler({
    repository: {
      async processStockUpdateEvent() {
        return { response: committed, shouldNotify: true };
      }
    },
    notify: async () => { throw new Error('Telegram unavailable'); }
  });
  const res = responseDouble();

  await handler(request({ body: validBody, headers: {
    'Idempotency-Key': 'event-1',
    'X-Event-Revision': '1'
  } }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, committed);
});

test('legacy notification failure still returns 500', async () => {
  const handler = createUpdateHandler({
    repository: {
      async upsertStock(input) { return { _id: 'x', ...input }; }
    },
    notify: async () => { throw new Error('Telegram unavailable'); }
  });
  const res = responseDouble();

  await handler(request({ body: validBody }), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Error interno' });
});

test('V2 replay/no-op does not notify and conflict maps to 409', async () => {
  let notifications = 0;
  const replayHandler = createUpdateHandler({
    repository: {
      async processStockUpdateEvent() {
        return { response: { exact: 'stored', eventStatus: 'idempotent' }, shouldNotify: false };
      }
    },
    notify: async () => { notifications++; }
  });
  const headers = { 'Idempotency-Key': 'event-1', 'X-Event-Revision': '1' };
  const replayRes = responseDouble();
  await replayHandler(request({ body: validBody, headers }), replayRes);
  assert.deepEqual(replayRes.body, { exact: 'stored', eventStatus: 'idempotent' });
  assert.equal(notifications, 0);

  const conflictHandler = createUpdateHandler({
    repository: { async processStockUpdateEvent() { const error = new Error('conflict'); error.code = 'STOCK_EVENT_CONFLICT'; throw error; } },
    notify: async () => { notifications++; }
  });
  const conflictRes = responseDouble();
  await conflictHandler(request({ body: validBody, headers }), conflictRes);
  assert.equal(conflictRes.statusCode, 409);
  assert.equal(notifications, 0);
});
