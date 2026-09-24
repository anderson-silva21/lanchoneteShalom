const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-backup-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');

const { db, initDatabase } = require('../src/db');
const { importBackup } = require('../src/services/backupService');

initDatabase();

test('importacao rejeita arquivo vazio ou sem extensao sqlite', async () => {
  await assert.rejects(importBackup(Buffer.alloc(0), 'backup.sqlite'), /arquivo SQLite valido/i);
  await assert.rejects(importBackup(Buffer.from('invalido'), 'backup.txt'), /extensao \.sqlite/i);
});

test('importacao valida o SQLite antes de persistir o backup', async () => {
  const backup = await importBackup(db.serialize(), 'backup.sqlite');

  assert.match(backup.file, /^lanchonete-importado-/);
  assert.equal(backup.size > 0, true);
  assert.equal(fs.existsSync(path.join(tempDir, 'backups', backup.file)), true);
});
