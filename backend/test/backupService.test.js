const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-backup-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');

const { db, initDatabase } = require('../src/db');
const { createBackup, importBackup } = require('../src/services/backupService');

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

test('backup SQLite inclui a copia recuperavel das imagens de produtos', async () => {
  const content = Buffer.from('webp-normalizado');
  db.prepare('INSERT INTO product_image_files (filename, content) VALUES (?, ?)')
    .run('11111111-1111-4111-8111-111111111111.webp', content);

  const backup = await createBackup({ label: 'images-test' });
  const backupDb = new Database(backup.path, { readonly: true });
  try {
    const stored = backupDb.prepare('SELECT content FROM product_image_files WHERE filename = ?')
      .get('11111111-1111-4111-8111-111111111111.webp');
    assert.deepEqual(stored.content, content);
  } finally {
    backupDb.close();
  }
});
