import test, { mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const PRIMARY_KEY = 'primary-test-value-111';
const SECONDARY_KEY = 'secondary-test-value-222';

const logEntries = [];

const fakeLogger = {
  info: (...args) => logEntries.push(['info', ...args]),
  warn: (...args) => logEntries.push(['warn', ...args]),
  error: (...args) => logEntries.push(['error', ...args])
};

mock.module('../src/infrastructure/config/logger.js', {
  defaultExport: fakeLogger
});

mock.module('../src/infrastructure/config/index.js', {
  namedExports: { API_KEY: PRIMARY_KEY }
});

const {
  default: apiKeyAuth,
  resolveAcceptedApiKeys,
  credentialsMatch
} = await import('../src/infrastructure/middleware/apiKeyAuth.js');

function createRequest({ apiKey, ip = '127.0.0.1', path = '/api/stock/1' } = {}) {
  const headers = apiKey === undefined ? {} : { 'x-api-key': apiKey };
  return {
    header: name => headers[name?.toLowerCase()],
    ip,
    originalUrl: path
  };
}

function createResponse() {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(payload) {
      response.body = payload;
      return response;
    }
  };
  return response;
}

function runMiddleware(request) {
  const response = createResponse();
  let nextCalls = 0;
  apiKeyAuth(request, response, () => {
    nextCalls += 1;
  });
  return { response, nextCalls };
}

const originalSecondaryKey = process.env.API_KEY_SECONDARY;

beforeEach(() => {
  logEntries.length = 0;
  process.env.API_KEY_SECONDARY = SECONDARY_KEY;
});

afterEach(() => {
  if (originalSecondaryKey === undefined) {
    delete process.env.API_KEY_SECONDARY;
  } else {
    process.env.API_KEY_SECONDARY = originalSecondaryKey;
  }
});

test('accepts the configured secondary key', () => {
  const { response, nextCalls } = runMiddleware(createRequest({ apiKey: SECONDARY_KEY }));

  assert.equal(nextCalls, 1);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, undefined);
  assert.equal(logEntries.length, 0);
});

test('keeps accepting the primary key', () => {
  const { response, nextCalls } = runMiddleware(createRequest({ apiKey: PRIMARY_KEY }));

  assert.equal(nextCalls, 1);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, undefined);
  assert.equal(logEntries.length, 0);
});

test('rejects an unknown key with 403 and does not continue', () => {
  const { response, nextCalls } = runMiddleware(createRequest({ apiKey: 'unknown-key-value' }));

  assert.equal(nextCalls, 0);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'API key invalid' });
  assert.equal(logEntries.length, 1);
  assert.equal(logEntries[0][0], 'warn');
  assert.equal(logEntries[0][1], 'API key invalid');
});

test('rejects a missing key with 401 and does not continue', () => {
  const { response, nextCalls } = runMiddleware(createRequest());

  assert.equal(nextCalls, 0);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'API key missing' });
  assert.equal(logEntries.length, 1);
  assert.equal(logEntries[0][0], 'warn');
  assert.equal(logEntries[0][1], 'API key missing');
});

test('never logs the presented credential material', () => {
  const presentedKey = 'presented-invalid-credential-value-333';

  runMiddleware(createRequest({ apiKey: presentedKey }));

  const serializedLogs = JSON.stringify(logEntries);
  assert.ok(
    !serializedLogs.includes(presentedKey),
    'log output must not contain the presented API key'
  );
  assert.equal(logEntries.length, 1);
  assert.equal(logEntries[0][0], 'warn');
  assert.equal(logEntries[0][1], 'API key invalid');
  assert.deepEqual(Object.keys(logEntries[0][2]).sort(), ['ip', 'location', 'path']);
});

test('never logs the presented credential material once the secondary key is retired', () => {
  delete process.env.API_KEY_SECONDARY;

  runMiddleware(createRequest({ apiKey: SECONDARY_KEY }));

  const serializedLogs = JSON.stringify(logEntries);
  assert.ok(
    !serializedLogs.includes(SECONDARY_KEY),
    'log output must not contain a previously valid API key'
  );
  assert.equal(logEntries.length, 1);
  assert.equal(logEntries[0][1], 'API key invalid');
});

test('fails closed for the secondary key when it is not configured', () => {
  delete process.env.API_KEY_SECONDARY;

  const { response, nextCalls } = runMiddleware(createRequest({ apiKey: SECONDARY_KEY }));

  assert.equal(nextCalls, 0);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'API key invalid' });
});

test('keeps accepting the primary key when no secondary key is configured', () => {
  delete process.env.API_KEY_SECONDARY;

  const { response, nextCalls } = runMiddleware(createRequest({ apiKey: PRIMARY_KEY }));

  assert.equal(nextCalls, 1);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, undefined);
});

test('resolveAcceptedApiKeys fails closed for missing configuration', () => {
  assert.deepEqual(resolveAcceptedApiKeys({ primaryKey: undefined, secondaryKey: undefined }), []);
  assert.deepEqual(resolveAcceptedApiKeys({ primaryKey: '', secondaryKey: '   ' }), []);
  assert.deepEqual(resolveAcceptedApiKeys({ primaryKey: null, secondaryKey: null }), []);
});

test('resolveAcceptedApiKeys keeps configured keys in primary-then-secondary order', () => {
  assert.deepEqual(
    resolveAcceptedApiKeys({ primaryKey: 'first', secondaryKey: 'second' }),
    ['first', 'second']
  );
  assert.deepEqual(resolveAcceptedApiKeys({ primaryKey: 'first', secondaryKey: undefined }), [
    'first'
  ]);
});

test('resolveAcceptedApiKeys ignores the secondary key when the primary is not configured', () => {
  assert.deepEqual(
    resolveAcceptedApiKeys({ primaryKey: undefined, secondaryKey: 'second' }),
    []
  );
  assert.deepEqual(resolveAcceptedApiKeys({ primaryKey: '   ', secondaryKey: 'second' }), []);
});

test('credentialsMatch accepts an identical presented key', () => {
  assert.equal(credentialsMatch(PRIMARY_KEY, PRIMARY_KEY), true);
  assert.equal(credentialsMatch(SECONDARY_KEY, SECONDARY_KEY), true);
});

test('credentialsMatch rejects keys whose length differs', () => {
  assert.equal(credentialsMatch(PRIMARY_KEY.slice(0, -1), PRIMARY_KEY), false);
  assert.equal(credentialsMatch(`${PRIMARY_KEY}x`, PRIMARY_KEY), false);
  assert.equal(credentialsMatch('', PRIMARY_KEY), false);
});

test('credentialsMatch rejects multi-byte keys without throwing', () => {
  const multiByteKey = '\u00e9'.repeat(PRIMARY_KEY.length);
  assert.equal(multiByteKey.length, PRIMARY_KEY.length);
  assert.notEqual(
    Buffer.byteLength(multiByteKey, 'utf8'),
    Buffer.byteLength(PRIMARY_KEY, 'utf8')
  );

  assert.equal(credentialsMatch(multiByteKey, PRIMARY_KEY), false);
});

test('credentialsMatch fails closed for non-string input', () => {
  assert.equal(credentialsMatch(undefined, PRIMARY_KEY), false);
  assert.equal(credentialsMatch(null, PRIMARY_KEY), false);
  assert.equal(credentialsMatch(PRIMARY_KEY, undefined), false);
});

test('rejects a truncated key that shares the primary prefix', () => {
  const truncatedKey = PRIMARY_KEY.slice(0, -1);

  const { response, nextCalls } = runMiddleware(createRequest({ apiKey: truncatedKey }));

  assert.equal(nextCalls, 0);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'API key invalid' });
  assert.ok(!JSON.stringify(logEntries).includes(truncatedKey));
});

test('rejects an extended key that shares the primary prefix', () => {
  const extendedKey = `${PRIMARY_KEY}x`;

  const { response, nextCalls } = runMiddleware(createRequest({ apiKey: extendedKey }));

  assert.equal(nextCalls, 0);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'API key invalid' });
  assert.ok(!JSON.stringify(logEntries).includes(extendedKey));
});

test('rejects an equal-length multi-byte key with 403 instead of failing', () => {
  const multiByteKey = '\u00e9'.repeat(PRIMARY_KEY.length);

  const { response, nextCalls } = runMiddleware(createRequest({ apiKey: multiByteKey }));

  assert.equal(nextCalls, 0);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'API key invalid' });
  assert.ok(!JSON.stringify(logEntries).includes(multiByteKey));
});
