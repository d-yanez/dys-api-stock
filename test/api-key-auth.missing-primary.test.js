import test, { mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const SECONDARY_KEY = 'secondary-only-test-value-444';

const fakeLogger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

mock.module('../src/infrastructure/config/logger.js', {
  defaultExport: fakeLogger
});

mock.module('../src/infrastructure/config/index.js', {
  namedExports: { API_KEY: undefined }
});

const { default: apiKeyAuth, resolveAcceptedApiKeys } = await import(
  '../src/infrastructure/middleware/apiKeyAuth.js'
);

function runMiddleware(apiKey) {
  const headers = apiKey === undefined ? {} : { 'x-api-key': apiKey };
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
  let nextCalls = 0;
  apiKeyAuth(
    {
      header: name => headers[name?.toLowerCase()],
      ip: '127.0.0.1',
      originalUrl: '/api/stock/1'
    },
    response,
    () => {
      nextCalls += 1;
    }
  );
  return { response, nextCalls };
}

const originalSecondaryKey = process.env.API_KEY_SECONDARY;

beforeEach(() => {
  delete process.env.API_KEY_SECONDARY;
});

afterEach(() => {
  if (originalSecondaryKey === undefined) {
    delete process.env.API_KEY_SECONDARY;
  } else {
    process.env.API_KEY_SECONDARY = originalSecondaryKey;
  }
});

test('fails closed when no API key is configured', () => {
  const { response, nextCalls } = runMiddleware('any-presented-key-value');

  assert.equal(nextCalls, 0);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'API key invalid' });
});

test('fails closed when the primary key is missing even if a secondary key is configured', () => {
  process.env.API_KEY_SECONDARY = SECONDARY_KEY;

  const secondaryResult = runMiddleware(SECONDARY_KEY);
  assert.equal(secondaryResult.nextCalls, 0);
  assert.equal(secondaryResult.response.statusCode, 403);
  assert.deepEqual(secondaryResult.response.body, { error: 'API key invalid' });

  const unknownResult = runMiddleware('any-presented-key-value');
  assert.equal(unknownResult.nextCalls, 0);
  assert.equal(unknownResult.response.statusCode, 403);
  assert.deepEqual(unknownResult.response.body, { error: 'API key invalid' });
});

test('fails closed when the primary key is blank even if a secondary key is configured', () => {
  assert.deepEqual(
    resolveAcceptedApiKeys({ primaryKey: '   ', secondaryKey: SECONDARY_KEY }),
    []
  );
});
