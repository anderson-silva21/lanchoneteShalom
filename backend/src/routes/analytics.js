const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getDashboardAnalytics } = require('../services/analyticsService');

const router = express.Router();

router.use(authenticate);

router.get('/dashboard', (req, res) => {
  return res.json(getDashboardAnalytics());
});

module.exports = router;
