const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { db } = require('../db');
const { createSale } = require('../services/salesService');

const router = express.Router();
const checkoutLimit = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false });
const saleSchema = z.object({
  customer_name: z.string().trim().min(2).max(120),
  customer_contact: z.string().trim().max(24).optional().default(''),
  items: z.array(z.object({ product_id: z.coerce.number().int().positive(), quantity: z.coerce.number().int().positive().max(50) })).min(1).max(40)
});

router.get('/products', (_req, res) => {
  const products = db.prepare(`
    SELECT id, name, category, sale_price, stock_quantity, unit, image_url
    FROM products WHERE active = 1 AND visible_in_pos = 1 AND sale_price > 0 AND stock_quantity > 0
    ORDER BY category COLLATE NOCASE, name COLLATE NOCASE
  `).all();
  res.set('Cache-Control', 'no-store');
  return res.json(products);
});

router.post('/sales', checkoutLimit, (req, res, next) => {
  try {
    const payload = saleSchema.parse(req.body);
    const sale = createSale({
      customer_name: payload.customer_name,
      notes: payload.customer_contact ? `Telefone informado: ${payload.customer_contact}` : null,
      payment_method: 'pagamento_pendente',
      items: payload.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity }))
    }, null);
    return res.status(201).json({ sale: { id: sale.id, total: sale.total, customer_name: sale.customer_name } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
