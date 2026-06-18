const fs = require('fs');
const path = require('path');
const { db, dbPath } = require('../db');

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

function listBackups() {
  ensureBackupDir();
  return fs.readdirSync(backupDir)
    .filter((file) => file.endsWith('.sqlite'))
    .map(statBackup)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function createBackup({ automatic = false } = {}) {
  ensureBackupDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = automatic ? 'lanchonete-auto' : 'lanchonete';
  const file = `${prefix}-${stamp}.sqlite`;
  const target = path.join(backupDir, file);

  await db.backup(target);
  const stat = fs.statSync(target);

  return {
    file,
    path: target,
    size: stat.size,
    created_at: new Date().toISOString()
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

module.exports = {
  backupDir,
  createBackup,
  listBackups,
  pruneOldBackups,
  runAutomaticBackup,
  startAutomaticBackupScheduler
};
