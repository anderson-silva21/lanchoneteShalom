const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getJwtSecret,
  isCorsOriginAllowed,
  parseCorsOrigins,
  parseTrustProxy
} = require('../src/config/security');

test('JWT_SECRET e obrigatorio e forte em producao', () => {
  assert.equal(getJwtSecret({ env: {}, nodeEnv: 'development' }), 'dev-secret-change-me');

  assert.throws(
    () => getJwtSecret({ env: {}, nodeEnv: 'production' }),
    /JWT_SECRET e obrigatorio/
  );

  assert.throws(
    () => getJwtSecret({ env: { JWT_SECRET: 'troque-este-segredo' }, nodeEnv: 'production' }),
    /JWT_SECRET de producao deve ser forte/
  );

  assert.equal(
    getJwtSecret({ env: { JWT_SECRET: 'segredo-producao-com-mais-de-32-caracteres' }, nodeEnv: 'production' }),
    'segredo-producao-com-mais-de-32-caracteres'
  );
});

test('CORS nao usa origens default em producao', () => {
  assert.equal(isCorsOriginAllowed('http://localhost:5173', { configuredOrigins: [], nodeEnv: 'production' }), false);
  assert.equal(isCorsOriginAllowed('https://containing-hydrogen-involves-quilt.trycloudflare.com', { configuredOrigins: [], nodeEnv: 'development' }), false);

  const configuredOrigins = parseCorsOrigins('https://app.exemplo.com, http://localhost:5173');
  assert.equal(isCorsOriginAllowed('https://app.exemplo.com', { configuredOrigins, nodeEnv: 'production' }), true);
  assert.equal(isCorsOriginAllowed('https://outro.exemplo.com', { configuredOrigins, nodeEnv: 'production' }), false);
});

test('TRUST_PROXY e opt-in explicito', () => {
  assert.equal(parseTrustProxy(''), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('2'), 2);
  assert.deepEqual(parseTrustProxy('loopback,uniquelocal'), ['loopback', 'uniquelocal']);
});
