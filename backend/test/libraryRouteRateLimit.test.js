const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-library-ratelimit-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');
process.env.LIBRARY_RATE_LIMIT_WINDOW_MINUTES = '1';
process.env.LIBRARY_RATE_LIMIT_MAX_REQUESTS = '2';

const errorHandler = require('../src/middleware/errorHandler');
const { signUser } = require('../src/middleware/auth');
const libraryRoutes = require('../src/routes/library');
const { db, initDatabase } = require('../src/db');

function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve) => {
    if (server.listening) return resolve(server);
    return server.once('listening', () => resolve(server));
  });
}

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('rota da Livraria aplica rate limit antes do handler e nao afeta rotas fora do router', async () => {
  initDatabase();
  const token = signUser(db.prepare("SELECT * FROM users WHERE username = 'admin'").get());
  const app = express();
  app.use(express.json());
  app.use('/api/library', libraryRoutes);
  app.get('/api/unrelated', (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const server = await listen(app);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const headers = { Authorization: `Bearer ${token}` };

    assert.equal((await fetch(`${baseUrl}/api/library/dashboard`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/library/dashboard`, { headers })).status, 200);

    const limited = await fetch(`${baseUrl}/api/library/dashboard`, { headers });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.has('retry-after'), true);
    assert.match((await limited.json()).message, /Muitas requisicoes/);

    assert.equal((await fetch(`${baseUrl}/api/unrelated`)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
