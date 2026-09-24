const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { db, dbPath } = require('../db');
const { brazilTimestamp } = require('../utils/time');

const backupDir = path.join(path.dirname(dbPath), 'backups');
let schedulerTimer = null;
let firstRunTimer = null;
let backupInProgress = false;

function ensureBackupDir() {
  fs.mkdirSync(backupDir, { recursive: true });
}

function normalizeBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function statBackup(file) {
  const fullPath = path.join(backupDir, file);
  const stat = fs.statSync(fullPath);
  return {
    file,
    size: stat.size,
    created_at: stat.birthtime
  };
}

function resolveBackupFile(file) {
  const root = path.resolve(backupDir);
  const target = path.resolve(root, path.basename(String(file || '')));
  if (!target.startsWith(`${root}${path.sep}`) || !target.endsWith('.sqlite')) {
    const error = new Error('Arquivo de backup invalido.');
    error.status = 400;
    throw error;
  }
  if (!fs.existsSync(target)) {
    const error = new Error('Backup nao encontrado.');
    error.status = 404;
    throw error;
  }
  return target;
}

function validateBackupFile(file) {
  const target = resolveBackupFile(file);
  let backupDb;
  try {
    backupDb = new Database(target, { readonly: true, fileMustExist: true });
    const integrity = backupDb.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      const error = new Error(`Backup invalido: ${integrity}`);
      error.status = 400;
      throw error;
    }

    const hasUsers = backupDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
    if (!hasUsers) {
      const error = new Error('Backup invalido: tabela de usuarios ausente.');
      error.status = 400;
      throw error;
    }
  } finally {
    backupDb?.close();
  }

  return target;
}

async function importBackup(buffer, originalName = 'backup.sqlite') {
  ensureBackupDir();
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error('Selecione um arquivo SQLite valido.');
    error.status = 400;
    throw error;
  }
  const safeName = path.basename(String(originalName || 'backup.sqlite'));
  if (!safeName.toLowerCase().endsWith('.sqlite')) {
    const error = new Error('O arquivo deve usar a extensao .sqlite.');
    error.status = 400;
    throw error;
  }
  if (buffer.length < 100 || buffer.subarray(0, 16).toString('binary') !== 'SQLite format 3\0') {
    const error = new Error('O arquivo enviado nao possui um cabecalho SQLite valido.');
    error.status = 400;
    throw error;
  }

  const stamp = `${brazilTimestamp().replace(/[: ]/g, '-')}-${String(new Date().getMilliseconds()).padStart(3, '0')}`;
  const targetName = `lanchonete-importado-${stamp}.sqlite`;
  const target = path.join(backupDir, targetName);
  // The destination is server-generated inside backupDir; validateBackupFile checks SQLite integrity before use.
  fs.writeFileSync(target, buffer, { flag: 'wx' }); // lgtm[js/http-to-file-access]
  try {
    validateBackupFile(targetName);
    return statBackup(targetName);
  } catch (error) {
    fs.rmSync(target, { force: true });
    throw error;
  }
}

function listBackups() {
  ensureBackupDir();
  return fs.readdirSync(backupDir)
    .filter((file) => file.endsWith('.sqlite'))
    .map(statBackup)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function createBackup({ automatic = false, label = '' } = {}) {
  ensureBackupDir();
  const stamp = `${brazilTimestamp().replace(/[: ]/g, '-')}-${String(new Date().getMilliseconds()).padStart(3, '0')}`;
  const prefix = label ? `lanchonete-${label}` : automatic ? 'lanchonete-auto' : 'lanchonete';
  const file = `${prefix}-${stamp}.sqlite`;
  const target = path.join(backupDir, file);

  await db.backup(target);
  const stat = fs.statSync(target);

  return {
    file,
    path: target,
    size: stat.size,
    created_at: brazilTimestamp()
  };
}

async function restoreBackup(file) {
  const source = validateBackupFile(file);
  const safetyBackup = await createBackup({ label: 'pre-restore' });

  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();

  fs.copyFileSync(source, dbPath);
  fs.rmSync(`${dbPath}-wal`, { force: true });
  fs.rmSync(`${dbPath}-shm`, { force: true });

  return {
    restored_file: path.basename(source),
    safety_backup: safetyBackup.file,
    restart_required: true
  };
}

function pruneOldBackups(retentionCount) {
  const retention = positiveInteger(retentionCount, 14);
  const backups = listBackups()
    .filter((backup) => /^lanchonete(?:-auto)?-\d{4}-\d{2}-\d{2}T/.test(backup.file));

  const root = path.resolve(backupDir);
  const deleted = [];

  backups.slice(retention).forEach((backup) => {
    const target = path.resolve(root, backup.file);
    if (!target.startsWith(`${root}${path.sep}`)) return;
    fs.rmSync(target, { force: true });
    deleted.push(backup.file);
  });

  return deleted;
}

async function runAutomaticBackup() {
  if (backupInProgress) return null;
  backupInProgress = true;

  try {
    const backup = await createBackup({ automatic: true });
    const deleted = pruneOldBackups(process.env.AUTO_BACKUP_RETENTION);
    console.log(`Backup automatico criado: ${backup.file}${deleted.length ? `; removidos ${deleted.length} antigos` : ''}`);
    return { backup, deleted };
  } finally {
    backupInProgress = false;
  }
}

function startAutomaticBackupScheduler() {
  if (schedulerTimer) return schedulerTimer;

  const enabled = normalizeBoolean(process.env.AUTO_BACKUP_ENABLED, true);
  if (!enabled) {
    console.log('Backup automatico desativado por AUTO_BACKUP_ENABLED=false.');
    return null;
  }

  const intervalHours = positiveNumber(process.env.AUTO_BACKUP_INTERVAL_HOURS, 24);
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const firstRunMs = Math.min(intervalMs, 30 * 1000);

  const run = () => {
    runAutomaticBackup().catch((error) => {
      console.error(`Falha no backup automatico: ${error.message}`);
    });
  };

  firstRunTimer = setTimeout(run, firstRunMs);
  schedulerTimer = setInterval(run, intervalMs);
  firstRunTimer.unref?.();
  schedulerTimer.unref?.();
  console.log(`Backup automatico ativo a cada ${intervalHours}h; retencao de ${positiveInteger(process.env.AUTO_BACKUP_RETENTION, 14)} arquivos.`);
  return schedulerTimer;
}

function getBackupStatus() {
  const backups = listBackups();
  return {
    directory: backupDir,
    total: backups.length,
    last_backup: backups[0] || null,
    automatic_enabled: normalizeBoolean(process.env.AUTO_BACKUP_ENABLED, true),
    automatic_interval_hours: positiveNumber(process.env.AUTO_BACKUP_INTERVAL_HOURS, 24),
    automatic_retention: positiveInteger(process.env.AUTO_BACKUP_RETENTION, 14)
  };
}

module.exports = {
  backupDir,
  createBackup,
  getBackupStatus,
  importBackup,
  listBackups,
  pruneOldBackups,
  resolveBackupFile,
  restoreBackup,
  runAutomaticBackup,
  startAutomaticBackupScheduler
};
