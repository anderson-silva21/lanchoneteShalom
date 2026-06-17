const express = require('express');
const { z } = require('zod');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { clearOperationalData, compactDatabase, getOperationalCounts } = require('../db');

const router = express.Router();

const resetSchema = z.object({
  confirmation: z.string().trim()
});

function getSetupStatus() {
  const counts = getOperationalCounts();
  return {
    counts,
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
