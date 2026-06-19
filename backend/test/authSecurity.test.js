const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const express = require('express');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-auth-security-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');
process.env.JWT_SECRET = 'auth-security-test-secret';
process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES = '15';
process.env.LOGIN_RATE_LIMIT_MAX_PER_IP = '100';
process.env.LOGIN_RATE_LIMIT_MAX_PER_USER = '100';
process.env.LOGIN_LOCK_FAILED_ATTEMPTS = '3';
process.env.LOGIN_LOCK_MINUTES = '10';

const { db, initDatabase } = require('../src/db');
const authRoutes = require('../src/routes/auth');
const errorHandler = require('../src/middleware/errorHandler');
const { resetLoginSecurityMemory } = require('../src/services/loginSecurityService');

initDatabase();

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.id = `auth-test-${Date.now()}`;
  next();
});
app.use('/api/auth', authRoutes);
app.use(errorHandler);

const server = app.listen(0, '127.0.0.1');
let baseUrl = '';

function resetDatabase() {
  db.exec(`
    DELETE FROM audit_logs;
    DELETE FROM users;
  `);

  db.prepare(`
    INSERT INTO users (name, username, email, password_hash, role, active, password_must_change)
    VALUES ('Admin Teste', 'admin', 'admin@example.com', ?, 'admin', 1, 0)
  `).run(bcrypt.hashSync('admin123', 4));
}

async function postLogin(username, password) {
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const body = await response.json().catch(() => ({}));
  return { response, body };
}

test.before(async () => {
  if (server.listening) {
    baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
    return;
  }

  await new Promise((resolve) => {
    server.once('listening', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
      resolve();
    });
  });
});

test.beforeEach(() => {
  process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES = '15';
  process.env.LOGIN_RATE_LIMIT_MAX_PER_IP = '100';
  process.env.LOGIN_RATE_LIMIT_MAX_PER_USER = '100';
  process.env.LOGIN_LOCK_FAILED_ATTEMPTS = '3';
  process.env.LOGIN_LOCK_MINUTES = '10';
  resetLoginSecurityMemory();
  resetDatabase();
});

test.after(() => {
  server.close();
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('falhas de login sao auditadas e bloqueiam usuario temporariamente', async () => {
  assert.equal((await postLogin('admin', 'senha-errada')).response.status, 401);
  assert.equal((await postLogin('admin', 'senha-errada')).response.status, 401);

  const locked = await postLogin('admin', 'senha-errada');
  assert.equal(locked.response.status, 423);
  assert.match(locked.body.message, /bloqueado temporariamente/);

  const user = db.prepare('SELECT login_failed_attempts, login_locked_until FROM users WHERE username = ?').get('admin');
  assert.equal(user.login_failed_attempts, 3);
  assert.ok(user.login_locked_until);

  const failedAuditCount = db.prepare(`
    SELECT COUNT(*) AS total
    FROM audit_logs
    WHERE action = 'auth.login.failed'
  `).get().total;
  assert.equal(failedAuditCount, 3);

  const stillLocked = await postLogin('admin', 'admin123');
  assert.equal(stillLocked.response.status, 423);

  const lockedAuditCount = db.prepare(`
    SELECT COUNT(*) AS total
    FROM audit_logs
    WHERE action = 'auth.login.locked'
  `).get().total;
  assert.equal(lockedAuditCount, 1);
});

test('login bem-sucedido limpa contador de falhas', async () => {
  db.prepare(`
    UPDATE users
    SET login_failed_attempts = 2,
        login_locked_until = NULL
    WHERE username = 'admin'
  `).run();

  const result = await postLogin('admin', 'admin123');
  assert.equal(result.response.status, 200);
  assert.ok(result.body.token);

  const user = db.prepare('SELECT login_failed_attempts, login_locked_until FROM users WHERE username = ?').get('admin');
  assert.equal(user.login_failed_attempts, 0);
  assert.equal(user.login_locked_until, null);
});

test('bloqueio expirado reinicia contador antes de nova tentativa', async () => {
  db.prepare(`
    UPDATE users
    SET login_failed_attempts = 3,
        login_locked_until = ?
    WHERE username = 'admin'
  `).run(new Date(Date.now() - 60_000).toISOString());

  const result = await postLogin('admin', 'senha-errada');
  assert.equal(result.response.status, 401);

  const user = db.prepare('SELECT login_failed_attempts, login_locked_until FROM users WHERE username = ?').get('admin');
  assert.equal(user.login_failed_attempts, 1);
  assert.equal(user.login_locked_until, null);
});

test('rate limit de login bloqueia excesso de tentativas por usuario', async () => {
  process.env.LOGIN_RATE_LIMIT_MAX_PER_USER = '2';
  process.env.LOGIN_LOCK_FAILED_ATTEMPTS = '99';
  resetLoginSecurityMemory();

  assert.equal((await postLogin('desconhecido', 'senha')).response.status, 401);
  assert.equal((await postLogin('desconhecido', 'senha')).response.status, 401);

  const limited = await postLogin('desconhecido', 'senha');
  assert.equal(limited.response.status, 429);
  assert.match(limited.body.message, /Muitas tentativas/);
  assert.ok(Number(limited.response.headers.get('retry-after')) > 0);

  const rateLimitAuditCount = db.prepare(`
    SELECT COUNT(*) AS total
    FROM audit_logs
    WHERE action = 'auth.login.rate_limited'
  `).get().total;
  assert.equal(rateLimitAuditCount, 1);
});
