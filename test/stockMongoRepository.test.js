import test from 'node:test';
import assert from 'node:assert/strict';
import StockMongoRepository, {
  isRetryableTransactionError
} from '../src/infrastructure/repositories/StockMongoRepository.js';

const event = Object.freeze({
  source: 'sheets',
  eventKey: 'event-11',
  revision: 11,
  sku: 12,
  stock: 7,
  location: 'WEST',
  payloadHash: 'hash-11'
});

const query = (value) => ({
  session() {
    return this;
  },
  async lean() {
    return typeof value === 'function' ? value() : value;
  }
});

const sessionFactory = (runWithTransaction) => {
  const sessions = [];
  return {
    sessions,
    mongoose: {
      async startSession() {
        const session = {
          async withTransaction(work) {
            return runWithTransaction(work, sessions.length);
          },
          async endSession() {}
        };
        sessions.push(session);
        return session;
      }
    }
  };
};

const modelsWith = ({ receipt = null, cursor = null } = {}) => ({
  StockUpdateEventModel: {
    findOne: () => query(receipt),
    async create() {}
  },
  StockSourceCursorModel: {
    findOne: () => query(cursor),
    async create() {},
    async updateOne() {}
  },
  StockItemModel: {
    findOne: () => query({ sku: event.sku, stock: 7, location: event.location }),
    findOneAndUpdate: () => query({ sku: event.sku, stock: event.stock, location: event.location })
  }
});

const repositoryWith = (mongoose, models) => new StockMongoRepository({ mongoose, ...models });

test('unsupported transactions propagate without a non-transactional fallback', async () => {
  const unsupported = new Error('Transaction numbers are only allowed on a replica set member');
  let writes = 0;
  const { mongoose, sessions } = sessionFactory(async () => {
    throw unsupported;
  });
  const models = modelsWith();
  models.StockItemModel.findOneAndUpdate = () => {
    writes += 1;
    return query({});
  };

  await assert.rejects(repositoryWith(mongoose, models).processStockUpdateEvent(event), unsupported);
  assert.equal(sessions.length, 1);
  assert.equal(writes, 0);
});

test('a reused event key with the same payload but a different revision is a conflict', async () => {
  const { mongoose } = sessionFactory(work => work());
  const models = modelsWith({
    receipt: {
      revision: event.revision - 1,
      payloadHash: event.payloadHash,
      response: { eventStatus: 'applied' }
    }
  });

  await assert.rejects(
    repositoryWith(mongoose, models).processStockUpdateEvent(event),
    error => error.code === 'STOCK_EVENT_CONFLICT'
  );
});

test('equal revision with a different event key is a conflict', async () => {
  const { mongoose } = sessionFactory(work => work());
  const models = modelsWith({
    cursor: {
      revision: event.revision,
      eventKey: 'another-event',
      payloadHash: event.payloadHash,
      response: { eventStatus: 'applied' }
    }
  });

  await assert.rejects(
    repositoryWith(mongoose, models).processStockUpdateEvent(event),
    error => error.code === 'STOCK_EVENT_CONFLICT'
  );
});

test('unknown commit result fails closed and is not retried as a whole transaction', async () => {
  // Telegram is outside MongoDB and has no idempotency contract. If withTransaction
  // cannot resolve its own commit retry, replaying here could suppress a notification.
  const uncertain = Object.assign(new Error('commit outcome is unknown'), {
    hasErrorLabel: label => label === 'UnknownTransactionCommitResult'
  });
  let transactionRuns = 0;
  const { mongoose, sessions } = sessionFactory(async work => {
    transactionRuns += 1;
    await work();
    throw uncertain;
  });

  await assert.rejects(
    repositoryWith(mongoose, modelsWith()).processStockUpdateEvent(event),
    uncertain
  );
  assert.equal(transactionRuns, 1);
  assert.equal(sessions.length, 1);
  assert.equal(isRetryableTransactionError(uncertain), false);
  assert.equal(isRetryableTransactionError({
    code: 112,
    hasErrorLabel: () => true
  }), false);
});

test('a duplicate receipt write is bounded-retried and reclassified as a replay', async () => {
  const storedResponse = { sku: event.sku, stock: event.stock, eventStatus: 'applied' };
  let attempt = 0;
  let receiptWrites = 0;
  let stockWrites = 0;
  const { mongoose, sessions } = sessionFactory(async work => {
    attempt += 1;
    return work();
  });
  const models = modelsWith();
  models.StockUpdateEventModel.findOne = () => query(
    attempt === 1 ? null : {
      revision: event.revision,
      payloadHash: event.payloadHash,
      response: storedResponse
    }
  );
  models.StockUpdateEventModel.create = async () => {
    receiptWrites += 1;
    throw Object.assign(new Error('duplicate key'), { code: 11000 });
  };
  models.StockItemModel.findOneAndUpdate = () => {
    stockWrites += 1;
    return query(storedResponse);
  };

  const result = await repositoryWith(mongoose, models).processStockUpdateEvent(event);

  assert.deepEqual(result, { response: storedResponse, shouldNotify: false });
  assert.equal(sessions.length, 2);
  assert.equal(receiptWrites, 1);
  assert.equal(stockWrites, 1);
});

test('transient pre-commit conflicts stop after the bounded retry limit', async () => {
  const transient = Object.assign(new Error('write conflict'), {
    hasErrorLabel: label => label === 'TransientTransactionError'
  });
  let transactionRuns = 0;
  const { mongoose, sessions } = sessionFactory(async () => {
    transactionRuns += 1;
    throw transient;
  });

  await assert.rejects(
    repositoryWith(mongoose, modelsWith()).processStockUpdateEvent(event),
    transient
  );
  assert.equal(transactionRuns, 3);
  assert.equal(sessions.length, 3);
  assert.equal(isRetryableTransactionError(transient), true);
});
