const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const productSchema = z.object({
  name: z.string().min(2),
  category: z.string().min(2),
  cost_price: z.coerce.number().nonnegative(),
  sale_price: z.coerce.number().nonnegative(),
  stock_quantity: z.coerce.number().nonnegative(),
  min_stock: z.coerce.number().nonnegative(),
  supplier: z.string().optional().nullable(),
  internal_code: z.string().min(2),
  unit: z.string().min(1),
  active: z.coerce.number().optional()
});

router.use(authenticate);

router.get('/', (req, res) => {
  const { q = '', category = '', status = '' } = req.query;
  const params = [];
  const where = ['active = 1'];

  if (q) {
    where.push('(name LIKE ? OR internal_code LIKE ? OR supplier LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (category) {
    where.push('category = ?');
    params.push(category);
  }

  if (status === 'low') where.push('stock_quantity <= min_stock');
  if (status === 'critical') where.push('stock_quantity <= min_stock * 0.5');

  const products = db.prepare(`
    SELECT *,
      CASE
        WHEN stock_quantity <= min_stock * 0.5 THEN 'critical'
        WHEN stock_quantity <= min_stock THEN 'warning'
        ELSE 'normal'
      END AS stock_status
    FROM products
    WHERE ${where.join(' AND ')}
    ORDER BY category, name
  `).all(params);

  return res.json(products);
});

router.get('/categories', (req, res) => {
  const categories = db.prepare(`
    SELECT category, COUNT(*) AS total
    FROM products
    WHERE active = 1
    GROUP BY category
    ORDER BY category
  `).all();
  return res.json(categories);
});

router.post('/', requireRole('admin', 'manager'), (req, res) => {
  const product = productSchema.parse(req.body);
  const result = db.prepare(`
    INSERT INTO products
      (name, category, cost_price, sale_price, stock_quantity, min_stock, supplier, internal_code, unit, active)
    VALUES
      (@name, @category, @cost_price, @sale_price, @stock_quantity, @min_stock, @supplier, @internal_code, @unit, COALESCE(@active, 1))
  `).run(product);

  return res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid));
});

router.patch('/:id', requireRole('admin', 'manager'), (req, res) => {
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ message: 'Produto nao encontrado.' });

  const merged = productSchema.parse({ ...current, ...req.body });
  db.prepare(`
    UPDATE products SET
      name = @name,
      category = @category,
      cost_price = @cost_price,
      sale_price = @sale_price,
      stock_quantity = @stock_quantity,
      min_stock = @min_stock,
      supplier = @supplier,
      internal_code = @internal_code,
      unit = @unit,
      active = COALESCE(@active, 1)
    WHERE id = @id
  `).run({ ...merged, id: Number(req.params.id) });

  return res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  return res.status(204).send();
});

module.exports = router;
