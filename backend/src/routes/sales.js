const express = require('express');
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { db } = require('../db');
const { createSale, getSaleById } = require('../services/salesService');

const router = express.Router();

const saleSchema = z.object({
  payment_method: z.string().optional(),
  notes: z.string().optional().nullable(),
  items: z.array(z.object({
    product_id: z.coerce.number().optional(),
    productId: z.coerce.number().optional(),
    combo_id: z.coerce.number().optional(),
    comboId: z.coerce.number().optional(),
    quantity: z.coerce.number().positive().default(1)
  })).min(1)
});

router.use(authenticate);

router.get('/', (req, res) => {
  const { start = '', end = '', limit = 100 } = req.query;
  const where = [];
  const params = [];

  if (start) {
    where.push('date(s.created_at) >= date(?)');
    params.push(start);
  }

  if (end) {
    where.push('date(s.created_at) <= date(?)');
    params.push(end);
  }

  params.push(Number(limit));
  const sales = db.prepare(`
    SELECT s.*, u.name AS sold_by_name
    FROM sales s
    LEFT JOIN users u ON u.id = s.sold_by
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY s.created_at DESC
    LIMIT ?
  `).all(params);

  return res.json(sales);
});

router.get('/:id', (req, res) => {
  const sale = getSaleById(req.params.id);
  if (!sale) return res.status(404).json({ message: 'Venda nao encontrada.' });
  return res.json(sale);
});

router.post('/', (req, res, next) => {
  try {
    const sale = createSale(saleSchema.parse(req.body), req.user);
    return res.status(201).json(sale);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
