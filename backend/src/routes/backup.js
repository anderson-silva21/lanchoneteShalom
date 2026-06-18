const express = require('express');
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { createBackup, listBackups, restoreBackup } = require('../services/backupService');
const { recordAudit } = require('../services/auditService');

const router = express.Router();

router.use(authenticate, requireScreen('settings'));

const restoreSchema = z.object({
  confirmation: z.string().trim()
});

router.get('/', (req, res) => {
  return res.json(listBackups());
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
