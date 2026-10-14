const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');

const cashierPassword = randomBytes(24).toString('hex');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shalom-roles-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
const { db, initDatabase } = require('../src/db');
const { signUser, authenticate } = require('../src/middleware/auth');
const { requireScreen } = require('../src/middleware/accessControl');
initDatabase();
db.prepare("UPDATE users SET password_hash = ? WHERE username = 'caixa'").run(bcrypt.hashSync(cashierPassword, 4));
const app = express();
app.use(express.json());
app.use('/api/users', require('../src/routes/users'));
app.use('/api/auth', require('../src/routes/auth'));
app.use('/api/library', require('../src/routes/library'));
app.use('/api/system', require('../src/routes/system'));
for (const screen of ['sales', 'library', 'payments', 'settings']) {
  app.get(`/api/probe/${screen}`, authenticate, requireScreen(screen), (req, res) => res.json(req.user));
}
app.use(require('../src/middleware/errorHandler'));
let server;
let baseUrl;
let adminToken;
test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  adminToken = signUser(db.prepare("SELECT * FROM users WHERE username = 'admin'").get());
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
async function request(url, { token = adminToken, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

test('admin cria Caixa + Livraria e os perfis persistem na listagem', async () => {
  const created = await request('/users', { method: 'POST', body: {
    name: 'Caixa Livraria', username: 'caixalivraria', roles: ['cashier', 'library']
  } });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.user.roles, ['cashier', 'library']);
  assert.equal(created.body.user.password_must_change, true);
  assert.ok(created.body.temporary_password);
  const listed = await request('/users');
  assert.deepEqual(listed.body.find((user) => user.id === created.body.user.id).roles, ['cashier', 'library']);
});

test('um JWT usa a uniao dos perfis atuais e perde acessos revogados sem novo login', async () => {
  const login = await request('/auth/login', { method: 'POST', body: { username: 'caixa', password: cashierPassword } });
  const token = login.body.token;
  const id = login.body.user.id;
  assert.deepEqual(login.body.user.roles, ['cashier']);
  assert.equal((await request('/probe/library', { token })).status, 403);
  assert.equal((await request(`/users/${id}/roles`, { method: 'PATCH', body: { roles: ['cashier', 'library'] } })).status, 200);
  assert.equal((await request('/probe/sales', { token })).status, 200);
  assert.equal((await request('/probe/library', { token })).status, 200);
  assert.equal((await request('/probe/payments', { token })).status, 403);
  assert.deepEqual((await request('/auth/me', { token })).body.user.roles, ['cashier', 'library']);
  await request(`/users/${id}/roles`, { method: 'PATCH', body: { roles: ['library'] } });
  assert.equal((await request('/probe/sales', { token })).status, 403);
  assert.equal((await request('/probe/library', { token })).status, 200);
});

test('validacao rejeita perfis ausentes, invalidos, vazios, duplicados e contratos ambiguos', async () => {
  for (const fields of [{}, { roles: [] }, { roles: ['root'] }, { roles: ['cashier', 'cashier'] }, { roles: 'admin' }, { role: 'cashier', roles: ['admin'] }]) {
    assert.equal((await request('/users', { method: 'POST', body: { name: 'Invalido', username: 'invalido', ...fields } })).status, 400);
  }
  const cashier = (await request('/users')).body.find((user) => user.username === 'caixa');
  for (const roles of [[], ['root'], ['cashier', 'cashier'], null]) {
    assert.equal((await request(`/users/${cashier.id}/roles`, { method: 'PATCH', body: { roles } })).status, 400);
  }
  assert.equal((await request('/users/99999/roles', { method: 'PATCH', body: { roles: ['library'] } })).status, 404);
});

test('ultimo administrador ativo nao pode perder o perfil, inclusive com outro admin inativo', async () => {
  const admin = (await request('/users')).body.find((user) => user.username === 'admin');
  db.prepare("INSERT INTO users (name, username, email, password_hash, role, active) VALUES ('Inativo', 'inativo', 'inativo@test', 'x', 'admin', 0)").run();
  assert.equal((await request(`/users/${admin.id}/roles`, { method: 'PATCH', body: { roles: ['library'] } })).status, 400);
  assert.equal((await request('/probe/settings')).status, 200);
});

test('usuarios comuns nao criam contas nem editam perfis proprios ou alheios', async () => {
  const login = await request('/auth/login', { method: 'POST', body: { username: 'caixa', password: cashierPassword } });
  for (const id of [login.body.user.id, 1]) {
    assert.equal((await request(`/users/${id}/roles`, { token: login.body.token, method: 'PATCH', body: { roles: ['admin'] } })).status, 403);
  }
  assert.equal((await request('/users', { token: login.body.token, method: 'POST', body: { name: 'Admin', username: 'elevado', roles: ['admin'] } })).status, 403);
  const staleClaims = require('jsonwebtoken').sign({ id: login.body.user.id, role: 'admin', roles: ['admin'] }, process.env.JWT_SECRET);
  assert.equal((await request('/probe/settings', { token: staleClaims })).status, 403);
});

test('criacao legada, troca obrigatoria de senha, auditoria e persistencia mantem os fluxos', async () => {
  const created = await request('/users', { method: 'POST', body: { name: 'Legado', username: 'legado', role: 'cashier' } });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.user.roles, ['cashier']);
  const login = await request('/auth/login', { method: 'POST', body: { username: 'legado', password: created.body.temporary_password } });
  assert.equal((await request('/probe/sales', { token: login.body.token })).status, 403);
  const changed = await request('/auth/change-password', { token: login.body.token, method: 'POST', body: {
    current_password: created.body.temporary_password, new_password: randomBytes(24).toString('hex')
  } });
  assert.equal(changed.status, 200);
  await request(`/users/${created.body.user.id}/roles`, { method: 'PATCH', body: { roles: ['library', 'cashier'] } });
  initDatabase();
  assert.deepEqual((await request('/auth/me', { token: login.body.token })).body.user.roles, ['cashier', 'library']);
  const audit = await request('/system/audit-logs?action=user.roles.update');
  const event = audit.body.find((entry) => entry.entity_id === String(created.body.user.id));
  assert.equal(event.username, 'admin');
  assert.deepEqual(event.metadata.previous_roles, ['cashier']);
  assert.deepEqual(event.metadata.new_roles, ['cashier', 'library']);
  assert.equal((await request(`/users/${created.body.user.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await request('/auth/me', { token: login.body.token })).status, 401);
});

test('Financeiro + Livraria conserva o acesso operacional e financeiro sem administrar vendedores', async () => {
  const seller = await request('/library/sellers', { method: 'POST', body: { display_name: 'Vendedor Teste', whatsapp_phone: '5511999999999' } });
  assert.equal(seller.status, 201);
  const cashier = (await request('/users')).body.find((user) => user.username === 'caixa');
  const login = await request('/auth/login', { method: 'POST', body: { username: 'caixa', password: cashierPassword } });
  const token = login.body.token;
  await request(`/users/${cashier.id}/roles`, { method: 'PATCH', body: { roles: ['finance', 'library'] } });
  const sellers = await request('/library/sellers', { token });
  assert.equal(sellers.body.find((entry) => entry.id === seller.body.id).whatsapp_phone, '5511999999999');
  assert.equal((await request('/library/categories', { token, method: 'POST', body: { name: 'Categoria Teste' } })).status, 201);
  assert.equal((await request('/library/installment-plans', { token })).status, 200);
  assert.equal((await request('/library/sellers', { token, method: 'POST', body: { display_name: 'Negado', whatsapp_phone: '5511888888888' } })).status, 403);
  await request(`/users/${cashier.id}/roles`, { method: 'PATCH', body: { roles: ['finance'] } });
  assert.equal((await request('/library/categories', { token, method: 'POST', body: { name: 'Negada' } })).status, 403);
  assert.equal((await request('/library/sellers', { token })).body.find((entry) => entry.id === seller.body.id).whatsapp_phone, undefined);
});

test('falha de auditoria cancela a alteracao de perfis', async () => {
  const cashier = (await request('/users')).body.find((user) => user.username === 'caixa');
  await request(`/users/${cashier.id}/roles`, { method: 'PATCH', body: { roles: ['finance'] } });
  db.exec("CREATE TRIGGER test_audit_failure BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
  try {
    const result = await request(`/users/${cashier.id}/roles`, { method: 'PATCH', body: { roles: ['cashier'] } });
    assert.equal(result.status, 400);
    const after = (await request('/users')).body.find((user) => user.id === cashier.id);
    assert.deepEqual(after.roles, ['finance']);
  } finally {
    db.exec('DROP TRIGGER test_audit_failure');
  }
});
