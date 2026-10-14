const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const express = require('express');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shalom-roles-migration-'));
process.env.DB_PATH = path.join(tempDir, 'legacy.sqlite');
process.env.JWT_SECRET = 'roles-migration-test-secret';
const legacy = new Database(process.env.DB_PATH);
legacy.exec(fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8'));
const profiles = ['admin', 'manager', 'cashier', 'finance', 'library'];
for (const [index, role] of profiles.entries()) {
  legacy.prepare('INSERT INTO users (id, name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)')
    .run(31 + index, role, role, `${role}@test.local`, bcrypt.hashSync('Preservada123!', 4), role);
}
legacy.prepare("INSERT INTO sales (total, payment_method, sold_by) VALUES (10, 'pix', 33)").run();
legacy.close();

const { db, initDatabase } = require('../src/db');
initDatabase();
const app = express();
app.use(express.json());
app.use('/api/auth', require('../src/routes/auth'));
app.use('/api/users', require('../src/routes/users'));
app.use('/api/sales', require('../src/routes/sales'));
app.use(require('../src/middleware/errorHandler'));
let server;
let baseUrl;
test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  if (db.open) db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('migracao preserva IDs, senhas e acessos antigos; reinicio conserva a edicao sem reatribuir o legado', async () => {
  let adminToken;
  for (const [index, role] of profiles.entries()) {
    const response = await fetch(`${baseUrl}/auth/login`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: role, password: 'Preservada123!' }) });
    assert.equal(response.status, 200);
    const login = await response.json();
    assert.equal(login.user.id, 31 + index);
    assert.deepEqual(login.user.roles, [role]);
    if (role === 'admin') adminToken = login.token;
  }
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` };
  const sales = await (await fetch(`${baseUrl}/sales`, { headers })).json();
  assert.equal(sales[0].sold_by, 33);
  const changed = await fetch(`${baseUrl}/users/33/roles`, { method: 'PATCH', headers,
    body: JSON.stringify({ roles: ['library', 'finance'] }) });
  assert.equal(changed.status, 200);
  db.close();
  // A fresh process opens the same file and serves the real authentication API.
  const output = execFileSync(process.execPath, ['-e', `
    const express = require('express');
    const { db, initDatabase } = require('./src/db');
    initDatabase(); initDatabase();
    const app = express(); app.use(express.json());
    app.use('/api/auth', require('./src/routes/auth'));
    const server = app.listen(0, '127.0.0.1', async () => {
      try {
        const result = await fetch('http://127.0.0.1:' + server.address().port + '/api/auth/login', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'cashier', password: 'Preservada123!' })
        });
        console.log(JSON.stringify(await result.json()));
      } finally { server.close(); db.close(); }
    });
  `], { cwd: path.join(__dirname, '..'), env: process.env, encoding: 'utf8', timeout: 15000 });
  const restarted = JSON.parse(output.trim().split(/\r?\n/).at(-1));
  assert.equal(restarted.user.id, 33);
  assert.deepEqual(restarted.user.roles, ['finance', 'library']);
});
