const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { getDashboardAnalytics } = require('../services/analyticsService');
const { getTelegramGroupUrl } = require('../services/telegramAlertService');

const router = express.Router();

router.use(authenticate, requireScreen('dashboard'));

router.get('/dashboard', (req, res) => {
  const analytics = getDashboardAnalytics();
  if (req.user.role === 'finance') {
    analytics.telegram_group_url = getTelegramGroupUrl();
  }
  return res.json(analytics);
});

module.exports = router;
