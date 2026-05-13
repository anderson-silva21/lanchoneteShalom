const express = require('express');
const fs = require('fs');
const path = require('path');
const { dbPath } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const backupDir = path.resolve(__dirname, '../../database/backups');

router.use(authenticate);

router.get('/', requireRole('admin', 'manager'), (req, res) => {
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

router.post('/', requireRole('admin', 'manager'), (req, res) => {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `lanchonete-${stamp}.sqlite`;
  const target = path.join(backupDir, file);
  fs.copyFileSync(dbPath, target);

  return res.status(201).json({
    file,
    path: target,
    created_at: new Date().toISOString()
  });
});

module.exports = router;
