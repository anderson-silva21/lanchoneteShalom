const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { getPowerBiDataset } = require('../services/analyticsService');

const router = express.Router();

router.use(authenticate, requireScreen('settings'));

router.get('/dataset', (req, res) => {
  return res.json(getPowerBiDataset());
});

router.post('/push', async (req, res, next) => {
  try {
    const pushUrl = process.env.POWER_BI_PUSH_URL;
    if (!pushUrl) {
      return res.status(400).json({
        message: 'Configure POWER_BI_PUSH_URL no backend para ativar o envio ao Power BI.'
      });
    }

    const response = await fetch(pushUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getPowerBiDataset())
    });

    if (!response.ok) {
      const error = new Error(`Power BI respondeu com status ${response.status}.`);
      error.status = 502;
      throw error;
    }

    return res.json({ ok: true, pushed_at: new Date().toISOString() });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
