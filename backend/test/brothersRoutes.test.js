const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const express = require('express');
const { randomBytes } = require('node:crypto');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shalom-brothers-'));
process.env.DB_PATH = path.join(tempDir, 'brothers.sqlite');
process.env.JWT_SECRET = randomBytes(32).toString('hex');

const { db, initDatabase } = require('../src/db');
initDatabase();
const { publicUser, signUser } = require('../src/middleware/auth');
const app = express();
app.use(express.json());
app.use('/api/brothers', require('../src/routes/brothers'));
app.use('/api/users', require('../src/routes/users'));
app.use(require('../src/middleware/errorHandler'));
let server;
let baseUrl;
let adminToken;
let coordinatorToken;
let coordinatorId;
let brotherId;
let followupId;

test.before(async () => {
  const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();
  adminToken = signUser(publicUser(admin));
  const inserted = db.prepare(`
    INSERT INTO users (name, username, email, password_hash, role)
    VALUES (?, ?, ?, ?, 'cashier')
  `).run('Coordenador', 'coordenador', 'coordenador@lanchonete.local', bcrypt.hashSync(randomBytes(16).toString('hex'), 4));
  coordinatorId = Number(inserted.lastInsertRowid);
  coordinatorToken = signUser(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(coordinatorId)));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db.open) db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function request(pathname, token, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      authorization: `Bearer ${token}`,
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return { response, body: await response.json().catch(() => null) };
}

test('permissoes explicitas separam cadastro de acompanhamentos e a listagem omite dados pessoais', async () => {
  const adminList = await request('/brothers', adminToken);
  assert.equal(adminList.response.status, 403, `Admin nao recebe acesso automatico ao cadastro: ${JSON.stringify(adminList.body)}`);

  const grant = await request(`/users/${coordinatorId}/brother-permissions`, adminToken, {
    method: 'PATCH', body: { permissions: ['brothers:read', 'brothers:create', 'brothers:followups:create'] }
  });
  assert.equal(grant.response.status, 200);

  const created = await request('/brothers', coordinatorToken, {
    method: 'POST', body: {
      full_name: 'Irmã de Teste', birth_date: '1990-04-12', phone: '11999999999',
      email: 'irma.teste@example.test', address_street: 'Rua Teste', address_number: '10'
    }
  });
  assert.equal(created.response.status, 201);
  brotherId = created.body.id;
  assert.equal((await request(`/brothers/${brotherId}/followups`, adminToken)).response.status, 403,
    'Admin nao recebe acesso automatico aos acompanhamentos');

  const followup = await request(`/brothers/${brotherId}/followups`, coordinatorToken, {
    method: 'POST', body: { occurred_on: '2026-11-26', category: 'pastoral', notes: 'Conteudo confidencial', status: 'completed' }
  });
  assert.equal(followup.response.status, 201);
  followupId = followup.body.id;
  assert.equal((await request(`/brothers/${brotherId}/followups`, coordinatorToken)).response.status, 403,
    'Permissao para registrar nao concede consulta aos acompanhamentos');

  const listing = await request('/brothers?q=Teste', coordinatorToken);
  assert.equal(listing.response.status, 200);
  assert.equal(listing.body.items[0].full_name, 'Irmã de Teste');
  assert.equal(Object.hasOwn(listing.body.items[0], 'phone'), false);
  assert.equal(Object.hasOwn(listing.body.items[0], 'groups'), false);
  assert.equal(JSON.stringify(listing.body).includes('Conteudo confidencial'), false);

  const followupReadGrant = await request(`/users/${coordinatorId}/brother-permissions`, adminToken, {
    method: 'PATCH', body: { permissions: ['brothers:read', 'brothers:create', 'brothers:followups:create', 'brothers:followups:read'] }
  });
  assert.equal(followupReadGrant.response.status, 200);
  const authorizedFollowups = await request(`/brothers/${brotherId}/followups`, coordinatorToken);
  assert.equal(authorizedFollowups.response.status, 200);
  assert.equal(authorizedFollowups.body[0].notes, 'Conteudo confidencial');
});

test('grupos e servicos preservam periodos, filtros e historico de situacao cadastral', async () => {
  const grant = await request(`/users/${coordinatorId}/brother-permissions`, adminToken, {
    method: 'PATCH', body: { permissions: ['brothers:read', 'brothers:create', 'brothers:update', 'brothers:groups:manage', 'brothers:ministries:manage', 'brothers:followups:read', 'brothers:followups:create', 'brothers:followups:update'] }
  });
  assert.equal(grant.response.status, 200);

  const group = await request('/brothers/groups', coordinatorToken, {
    method: 'POST', body: { name: 'Grupo de Teste', description: 'Grupo temporario', responsible_brother_id: brotherId, active: true }
  });
  assert.equal(group.response.status, 201);
  const secondBrother = await request('/brothers', coordinatorToken, {
    method: 'POST', body: { full_name: 'Outro Irmao de Teste' }
  });
  assert.equal(secondBrother.response.status, 201);
  const reassignedGroup = await request(`/brothers/groups/${group.body.id}`, coordinatorToken, {
    method: 'PATCH', body: { name: 'Grupo de Teste', description: 'Grupo temporario', responsible_brother_id: secondBrother.body.id, active: true }
  });
  assert.equal(reassignedGroup.response.status, 200);
  const ministry = await request('/brothers/ministries', coordinatorToken, {
    method: 'POST', body: { name: 'Ministerio de Teste', responsible_brother_id: brotherId, active: true }
  });
  assert.equal(ministry.response.status, 201);

  const groupMembership = await request(`/brothers/${brotherId}/groups`, coordinatorToken, {
    method: 'POST', body: { group_id: group.body.id, started_on: '2025-02-01' }
  });
  assert.equal(groupMembership.response.status, 201);
  const ministryMembership = await request(`/brothers/${brotherId}/ministries`, coordinatorToken, {
    method: 'POST', body: { ministry_id: ministry.body.id, function_title: 'Acolhida', started_on: '2025-03-01' }
  });
  assert.equal(ministryMembership.response.status, 201);

  const filtered = await request(`/brothers?group_id=${group.body.id}&ministry_id=${ministry.body.id}`, coordinatorToken);
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.body.items[0].id, brotherId);
  const duplicate = await request('/brothers', coordinatorToken, {
    method: 'POST', body: { full_name: 'Irmã de Teste', birth_date: '1990-04-12' }
  });
  assert.equal(duplicate.response.status, 409);

  await request(`/brothers/${brotherId}/groups/${groupMembership.body.id}/end`, coordinatorToken, {
    method: 'PATCH', body: { ended_on: '2026-06-01' }
  });
  await request(`/brothers/${brotherId}/ministries/${ministryMembership.body.id}/end`, coordinatorToken, {
    method: 'PATCH', body: { ended_on: '2026-07-01' }
  });
  const updated = await request(`/brothers/${brotherId}`, coordinatorToken, {
    method: 'PATCH', body: { status: 'inactive', community_status: 'Em pausa' }
  });
  assert.equal(updated.response.status, 200);
  assert.deepEqual(updated.body.groups.map((item) => item.ended_on), ['2026-06-01']);
  assert.deepEqual(updated.body.ministries.map((item) => item.function_title), ['Acolhida']);
  assert.ok(updated.body.history.some((item) => item.event_type === 'registration_status.changed'));
  assert.ok(updated.body.history.some((item) => item.event_type === 'group.left'));
  assert.ok(updated.body.history.some((item) => item.event_type === 'group.responsibility.started'));
  assert.ok(updated.body.history.some((item) => item.event_type === 'group.responsibility.ended'));
  assert.ok(updated.body.history.some((item) => item.event_type === 'ministry.left'));

  const revisedFollowup = await request(`/brothers/${brotherId}/followups/${followupId}`, coordinatorToken, {
    method: 'PATCH', body: { occurred_on: '2026-11-26', category: 'pastoral', notes: 'Nota revisada', next_on: '2026-12-05', status: 'scheduled' }
  });
  assert.equal(revisedFollowup.response.status, 200);
  assert.equal((await request(`/brothers/${brotherId}/followups`, coordinatorToken)).body[0].notes, 'Nota revisada');
});
