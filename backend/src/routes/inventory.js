const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const movementSchema = z.object({
  product_id: z.coerce.number(),
  type: z.enum(['purchase', 'adjustment', 'waste']),
  quantity: z.coerce.number(),
  notes: z.string().optional().nullable()
});

router.use(authenticate);

router.get('/movements', (req, res) => {
  const movements = db.prepare(`
    SELECT m.*, p.name AS product_name, p.internal_code, p.unit, u.name AS created_by_name
    FROM inventory_movements m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN users u ON u.id = m.created_by
    ORDER BY m.created_at DESC
    LIMIT 300
  `).all();
  return res.json(movements);
});

router.post('/movements', requireRole('admin', 'manager'), (req, res) => {
  const payload = movementSchema.parse(req.body);
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(payload.product_id);
  if (!product) return res.status(404).json({ message: 'Produto nao encontrado.' });

  const signedQuantity = payload.type === 'waste' ? -Math.abs(payload.quantity) : payload.quantity;
  const nextStock = Math.max(0, Number((product.stock_quantity + signedQuantity).toFixed(3)));

  const transaction = db.transaction(() => {
    db.prepare('UPDATE products SET stock_quantity = ? WHERE id = ?').run(nextStock, product.id);
    const result = db.prepare(`
      INSERT INTO inventory_movements
        (product_id, type, quantity_change, quantity_before, quantity_after, reference_type, notes, created_by)
      VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)
    `).run(product.id, payload.type, signedQuantity, product.stock_quantity, nextStock, payload.notes || null, req.user.id);

    return result.lastInsertRowid;
  });

  const id = transaction();
  const movement = db.prepare(`
    SELECT m.*, p.name AS product_name
    FROM inventory_movements m
    JOIN products p ON p.id = m.product_id
    WHERE m.id = ?
  `).get(id);

  return res.status(201).json(movement);
});

module.exports = router;
