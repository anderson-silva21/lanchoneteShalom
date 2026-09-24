const test = require('node:test');
const assert = require('node:assert/strict');
const { importBackup } = require('../src/services/backupService');

test('importacao rejeita arquivo vazio ou sem extensao sqlite', () => {
  assert.throws(() => importBackup(Buffer.alloc(0), 'backup.sqlite'), /arquivo SQLite valido/i);
  assert.throws(() => importBackup(Buffer.from('invalido'), 'backup.txt'), /extensao \.sqlite/i);
});
