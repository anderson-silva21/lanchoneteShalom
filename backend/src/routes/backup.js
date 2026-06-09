const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, dbPath } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');

const router = express.Router();
const backupDir = path.join(path.dirname(dbPath), 'backups');

router.use(authenticate, requireScreen('settings'));

router.get('/', (req, res) => {
  fs.mkdirSync(backupDir, { recursive: true });
  const backups = fs.readdirSync(backupDir)
    .filter((file) => file.endsWith('.sqlite'))
    .map((file) => {
      const fullPath = path.join(backupDir, file);
      const stat = fs.statSync(fullPath);
      return {
        file,
        size: stat.size,
        created_at: stat.birthtime
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return res.json(backups);
});

router.post('/', async (req, res) => {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `lanchonete-${stamp}.sqlite`;
  const target = path.join(backupDir, file);
  await db.backup(target);
  const stat = fs.statSync(target);

  return res.status(201).json({
    file,
    path: target,
    size: stat.size,
    created_at: new Date().toISOString()
  });
});

module.exports = router;
