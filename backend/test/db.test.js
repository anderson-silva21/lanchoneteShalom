const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-db-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');

const { db, initDatabase } = require('../src/db');

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('migracao permite criar usuario com perfil financeiro', () => {
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier')),
      active INTEGER NOT NULL DEFAULT 1,
      password_must_change INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users (name, username, email, password_hash, role)
    VALUES ('Admin', 'admin', 'admin@example.com', 'hash', 'admin');
  `);

  initDatabase();

  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  assert.match(table.sql, /'finance'/);

  const id = db.prepare(`
    INSERT INTO users (name, username, email, password_hash, role)
    VALUES ('Financeiro', 'financeiro', 'financeiro@example.com', 'hash', 'finance')
  `).run().lastInsertRowid;

  const user = db.prepare('SELECT username, role FROM users WHERE id = ?').get(id);
  assert.deepEqual(user, { username: 'financeiro', role: 'finance' });
});
