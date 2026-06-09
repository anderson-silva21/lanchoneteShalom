const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { getDashboardAnalytics } = require('../services/analyticsService');

const router = express.Router();

router.use(authenticate, requireScreen('dashboard'));

router.get('/dashboard', (req, res) => {
  return res.json(getDashboardAnalytics());
});

module.exports = router;
