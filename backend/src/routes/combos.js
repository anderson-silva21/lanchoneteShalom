const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', (req, res) => {
  const combos = db.prepare('SELECT * FROM combos WHERE active = 1 ORDER BY name').all();
  const getItems = db.prepare(`
    SELECT ci.quantity, p.id, p.name, p.unit, p.stock_quantity, p.cost_price
    FROM combo_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.combo_id = ?
    ORDER BY p.name
  `);

  return res.json(combos.map((combo) => ({
    ...combo,
    items: getItems.all(combo.id)
  })));
});

module.exports = router;
