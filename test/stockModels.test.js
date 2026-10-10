import test from 'node:test';
import assert from 'node:assert/strict';
import { StockUpdateEventModel } from '../src/infrastructure/models/StockUpdateEvent.js';
import { StockSourceCursorModel } from '../src/infrastructure/models/StockSourceCursor.js';

const uniqueIndex = (model) => model.schema.indexes().find(([, options]) => options.unique);

test('stock update receipts uniquely identify a source event', () => {
  assert.deepEqual(uniqueIndex(StockUpdateEventModel), [
    { source: 1, eventKey: 1 },
    { unique: true, background: true }
  ]);
});

test('stock source cursors are unique per source, SKU, and location', () => {
  assert.deepEqual(uniqueIndex(StockSourceCursorModel), [
    { source: 1, sku: 1, location: 1 },
    { unique: true, background: true }
  ]);
});
