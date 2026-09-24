const express = require('express');
const path = require('path');
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { createBackup, importBackup, listBackups, resolveBackupFile, restoreBackup } = require('../services/backupService');
const { recordAudit } = require('../services/auditService');

const router = express.Router();

router.use(authenticate, requireScreen('settings'));

const restoreSchema = z.object({
  confirmation: z.string().trim()
});

router.get('/', (req, res) => {
  return res.json(listBackups());
});

router.get('/:file/download', (req, res, next) => {
  try {
    const file = resolveBackupFile(req.params.file);
    return res.download(file, path.basename(file));
  } catch (error) {
    return next(error);
  }
});

router.post('/import', express.raw({ type: 'application/octet-stream', limit: '250mb' }), (req, res, next) => {
  try {
    const backup = importBackup(req.body, req.get('x-backup-filename'));
    recordAudit({
      req,
      action: 'backup.import',
      entityType: 'backup',
      entityId: backup.file,
      summary: `Backup importado: ${backup.file}`,
      metadata: { file: backup.file, size: backup.size }
    });
    return res.status(201).json(backup);
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const backup = await createBackup();
    recordAudit({
      req,
      action: 'backup.create',
      entityType: 'backup',
      entityId: backup.file,
      summary: `Backup criado: ${backup.file}`,
      metadata: { file: backup.file, size: backup.size }
    });
    return res.status(201).json(backup);
  } catch (error) {
    return next(error);
  }
});

router.post('/:file/restore', async (req, res, next) => {
  try {
    const payload = restoreSchema.parse(req.body);
    if (payload.confirmation !== 'RESTAURAR') {
      return res.status(400).json({ message: 'Digite RESTAURAR para confirmar a restauracao.' });
    }

    recordAudit({
      req,
      action: 'backup.restore.request',
      entityType: 'backup',
      entityId: req.params.file,
      summary: `Restauracao solicitada: ${req.params.file}`
    });

    const result = await restoreBackup(req.params.file);
    res.json({
      ...result,
      message: 'Backup restaurado. O backend sera reiniciado para carregar o banco restaurado.'
    });

    setTimeout(() => {
      process.exit(0);
    }, 500).unref?.();
    return undefined;
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
