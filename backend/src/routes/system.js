const express = require('express');
const fs = require('fs');
const { z } = require('zod');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { clearOperationalData, compactDatabase, db, dbPath, getOperationalCounts, isInitialLoadEnabled, setInitialLoadEnabled } = require('../db');
const { createBackup, getBackupStatus } = require('../services/backupService');
const { listAuditLogs, recordAudit } = require('../services/auditService');
const { getTelegramAlertStatus, sendTelegramAlertDigest, startTelegramAlertScheduler, updateTelegramAlertSettings } = require('../services/telegramAlertService');
const { brazilTimestamp } = require('../utils/time');
const packageJson = require('../../package.json');

const router = express.Router();

const resetSchema = z.object({
  confirmation: z.string().trim()
});

const initialLoadSchema = z.object({
  enabled: z.coerce.boolean()
});

const telegramSettingsSchema = z.object({
  enabled: z.coerce.boolean().optional(),
  chat_id: z.string().trim().optional(),
  group_url: z.string().trim().optional(),
  interval_minutes: z.coerce.number().int().min(5).max(1440).optional(),
  max_items: z.coerce.number().int().min(3).max(30).optional(),
  ignored_missing_expiration_categories: z.string().trim().optional()
});

function getSetupStatus() {
  const counts = getOperationalCounts();
  return {
    counts,
    setup_enabled: isInitialLoadEnabled(),
    is_empty: counts.products === 0
      && counts.stock_batches === 0
      && counts.sales === 0
      && counts.inventory_movements === 0
      && counts.combos === 0
      && counts.events === 0
  };
}

function fileSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function getSystemHealth() {
  const dbIntegrity = db.pragma('integrity_check', { simple: true });
  const walCheckpoint = db.pragma('wal_checkpoint(PASSIVE)')?.[0] || {};
  const backupStatus = getBackupStatus();
  const auditCount = db.prepare('SELECT COUNT(*) AS total FROM audit_logs').get().total;

  return {
    ok: dbIntegrity === 'ok',
    version: packageJson.version,
    node: process.version,
    pid: process.pid,
    uptime_seconds: Math.round(process.uptime()),
    started_at: brazilTimestamp(new Date(Date.now() - process.uptime() * 1000)),
    now: brazilTimestamp(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    env: process.env.NODE_ENV || 'development',
    database: {
      path: dbPath,
      size: fileSize(dbPath),
      wal_size: fileSize(`${dbPath}-wal`),
      shm_size: fileSize(`${dbPath}-shm`),
      journal_mode: db.pragma('journal_mode', { simple: true }),
      integrity: dbIntegrity,
      wal_checkpoint: walCheckpoint
    },
    backup: backupStatus,
    telegram: getTelegramAlertStatus(),
    setup: getSetupStatus(),
    audit: {
      total: auditCount
    }
  };
}

router.use(authenticate);

router.get('/setup-status', requireRole('admin', 'manager', 'finance'), (req, res) => {
  return res.json(getSetupStatus());
});

router.patch('/initial-load', requireScreen('settings'), (req, res) => {
  const payload = initialLoadSchema.parse(req.body);
  setInitialLoadEnabled(payload.enabled);
  recordAudit({
    req,
    action: 'system.initial_load.update',
    entityType: 'system',
    summary: payload.enabled ? 'Carga inicial habilitada' : 'Carga inicial desabilitada',
    metadata: { enabled: payload.enabled }
  });
  return res.json(getSetupStatus());
});

router.get('/health', requireScreen('settings'), (req, res) => {
  return res.json(getSystemHealth());
});

router.get('/audit-logs', requireScreen('settings'), (req, res) => {
  return res.json(listAuditLogs(req.query));
});

router.get('/telegram-alerts', requireScreen('settings'), (req, res) => {
  return res.json(getTelegramAlertStatus());
});

router.patch('/telegram-alerts', requireScreen('settings'), (req, res) => {
  const payload = telegramSettingsSchema.parse(req.body);
  const status = updateTelegramAlertSettings(payload);
  startTelegramAlertScheduler({ restart: true });
  recordAudit({
    req,
    action: 'system.telegram.update',
    entityType: 'telegram',
    summary: 'Configuracao dos alertas Telegram atualizada',
    metadata: {
      ...payload,
      chat_id: payload.chat_id ? '***' : undefined
    }
  });
  return res.json(status);
});

router.post('/telegram-alerts/test', requireScreen('settings'), async (req, res, next) => {
  try {
    const result = await sendTelegramAlertDigest({ force: true });
    recordAudit({
      req,
      action: 'system.telegram.test',
      entityType: 'telegram',
      summary: result.sent ? 'Teste Telegram enviado' : 'Teste Telegram sem alertas enviados',
      metadata: result
    });
    return res.json({
      ...result,
      status: getTelegramAlertStatus()
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/reset-operational-data', requireScreen('settings'), async (req, res, next) => {
  const payload = resetSchema.parse(req.body);
  if (payload.confirmation !== 'APAGAR') {
    return res.status(400).json({ message: 'Digite APAGAR para confirmar a limpeza da base.' });
  }

  try {
    const safetyBackup = await createBackup({ label: 'pre-reset' });
    const before = getOperationalCounts();
    const after = clearOperationalData({ resetCategories: true });
    compactDatabase();
    recordAudit({
      req,
      action: 'system.reset_operational_data',
      entityType: 'system',
      summary: 'Dados operacionais apagados',
      metadata: { before, after, safety_backup: safetyBackup.file }
    });

    return res.json({
      message: 'Dados operacionais apagados.',
      safety_backup: safetyBackup.file,
      before,
      after,
      status: getSetupStatus()
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
