const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRateLimiter, resetRateLimitMemory } = require('../src/middleware/rateLimit');

function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve) => {
    if (server.listening) return resolve(server);
    return server.once('listening', () => resolve(server));
  });
}

test.afterEach(() => {
  resetRateLimitMemory();
});

test('rate limiter permite requisicoes normais e retorna 429 ao exceder limite', async () => {
  const app = express();
  app.get('/limited', createRateLimiter({
    keyPrefix: 'test:limited',
    windowMs: 60_000,
    maxRequests: 2
  }), (req, res) => res.json({ ok: true }));
  app.get('/unrelated', (req, res) => res.json({ ok: true }));
  const server = await listen(app);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${baseUrl}/limited`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/limited`)).status, 200);

    const limited = await fetch(`${baseUrl}/limited`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.has('retry-after'), true);
    assert.equal((await limited.json()).retry_after_seconds > 0, true);

    assert.equal((await fetch(`${baseUrl}/unrelated`)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
