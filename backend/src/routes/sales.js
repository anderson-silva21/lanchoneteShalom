const express = require('express');
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { db } = require('../db');
const { createEvent } = require('../services/eventsService');
const { createSale, getSaleById } = require('../services/salesService');

const router = express.Router();

const saleSchema = z.object({
  payment_method: z.string().optional(),
  customer_name: z.string().trim().optional().nullable(),
  notes: z.string().optional().nullable(),
  event_id: z.coerce.number().int().positive().optional().nullable(),
  items: z.array(z.object({
    product_id: z.coerce.number().optional(),
    productId: z.coerce.number().optional(),
    combo_id: z.coerce.number().optional(),
    comboId: z.coerce.number().optional(),
    quantity: z.coerce.number().positive().default(1)
  })).min(1)
});

const eventSchema = z.object({
  name: z.string().trim().min(2),
  event_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().optional().nullable()
});

router.use(authenticate, requireScreen('sales'));

router.get('/events', (req, res) => {
  const events = db.prepare(`
    SELECT id, name, event_date
    FROM events
    WHERE date(event_date) >= date('now', 'localtime', 'start of year')
    ORDER BY date(event_date) DESC, name ASC
  `).all();

  return res.json(events);
});

router.post('/events', requireScreen('dashboard'), (req, res, next) => {
  try {
    const event = createEvent(eventSchema.parse(req.body));
    return res.status(201).json(event);
  } catch (error) {
    return next(error);
  }
});

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
    SELECT s.*, u.name AS sold_by_name, e.name AS event_name, e.event_date
    FROM sales s
    LEFT JOIN users u ON u.id = s.sold_by
    LEFT JOIN events e ON e.id = s.event_id
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
