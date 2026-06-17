const express = require('express');
const { z } = require('zod');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { clearOperationalData, compactDatabase, getOperationalCounts, isInitialLoadEnabled, setInitialLoadEnabled } = require('../db');
const { getTelegramAlertStatus, sendTelegramAlertDigest } = require('../services/telegramAlertService');

const router = express.Router();

const resetSchema = z.object({
  confirmation: z.string().trim()
});

const initialLoadSchema = z.object({
  enabled: z.coerce.boolean()
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

router.use(authenticate);

router.get('/setup-status', requireRole('admin', 'manager'), (req, res) => {
  return res.json(getSetupStatus());
});

router.patch('/initial-load', requireScreen('settings'), (req, res) => {
  const payload = initialLoadSchema.parse(req.body);
  setInitialLoadEnabled(payload.enabled);
  return res.json(getSetupStatus());
});

router.get('/telegram-alerts', requireScreen('settings'), (req, res) => {
  return res.json(getTelegramAlertStatus());
});

router.post('/telegram-alerts/test', requireScreen('settings'), async (req, res, next) => {
  try {
    const result = await sendTelegramAlertDigest({ force: true });
    return res.json({
      ...result,
      status: getTelegramAlertStatus()
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/reset-operational-data', requireScreen('settings'), (req, res) => {
  const payload = resetSchema.parse(req.body);
  if (payload.confirmation !== 'APAGAR') {
    return res.status(400).json({ message: 'Digite APAGAR para confirmar a limpeza da base.' });
  }

  const before = getOperationalCounts();
  const after = clearOperationalData({ resetCategories: true });
  compactDatabase();

  return res.json({
    message: 'Dados operacionais apagados.',
    before,
    after,
    status: getSetupStatus()
  });
});

module.exports = router;
