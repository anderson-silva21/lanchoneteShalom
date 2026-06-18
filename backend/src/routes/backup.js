const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { createBackup, listBackups } = require('../services/backupService');

const router = express.Router();

router.use(authenticate, requireScreen('settings'));

router.get('/', (req, res) => {
  return res.json(listBackups());
});

router.post('/', async (req, res, next) => {
  try {
    const backup = await createBackup();
    return res.status(201).json(backup);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
