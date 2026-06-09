const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { addStock, roundQuantity } = require('../services/stockService');

const router = express.Router();

const optionalDateSchema = z.preprocess(
  (value) => value === '' || value === undefined ? null : value,
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()
);

const productSchema = z.object({
  name: z.string().trim().min(2),
  category: z.string().trim().min(2),
  cost_price: z.coerce.number().nonnegative(),
  sale_price: z.coerce.number().nonnegative(),
  stock_quantity: z.coerce.number().nonnegative(),
  min_stock: z.coerce.number().nonnegative(),
  supplier: z.preprocess((value) => value === '' ? null : value, z.string().trim().optional().nullable()),
  internal_code: z.string().trim().min(2).optional(),
  unit: z.string().trim().min(1),
  expiration_date: optionalDateSchema,
  active: z.coerce.number().int().min(0).max(1).default(1)
});

function categoryPrefix(category) {
  const normalized = String(category || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();

  return (normalized.slice(0, 3) || 'PRO').padEnd(3, 'X');
}

function generateProductCode(category) {
  const prefix = categoryPrefix(category);
  const rows = db.prepare(`
    SELECT internal_code
    FROM products
    WHERE internal_code LIKE ?
  `).all(`${prefix}-%`);

  const lastNumber = rows.reduce((max, row) => {
    const match = String(row.internal_code || '').match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `${prefix}-${String(lastNumber + 1).padStart(3, '0')}`;
}

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

router.post('/', requireScreen('products'), (req, res) => {
  const payload = productSchema.parse(req.body);
  const product = {
    ...payload,
    internal_code: generateProductCode(payload.category),
    stock_quantity: 0,
    expiration_date: null
  };

  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO products
        (name, category, cost_price, sale_price, stock_quantity, min_stock, supplier, internal_code, unit, expiration_date, active)
      VALUES
        (@name, @category, @cost_price, @sale_price, @stock_quantity, @min_stock, @supplier, @internal_code, @unit, @expiration_date, @active)
    `).run(product);

    if (roundQuantity(payload.stock_quantity) > 0) {
      addStock({
        productId: result.lastInsertRowid,
        quantity: payload.stock_quantity,
        expirationDate: payload.expiration_date,
        movementType: 'purchase',
        referenceType: 'product_creation',
        notes: 'Estoque inicial do produto',
        userId: req.user.id,
        createNewBatch: true
      });
    }

    return result.lastInsertRowid;
  });

  const productId = transaction();
  return res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(productId));
});

router.patch('/:id', requireScreen('products'), (req, res) => {
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ message: 'Produto nao encontrado.' });

  const merged = productSchema.parse({ ...current, ...req.body });
  db.prepare(`
    UPDATE products SET
      name = @name,
      category = @category,
      cost_price = @cost_price,
      sale_price = @sale_price,
      min_stock = @min_stock,
      supplier = @supplier,
      internal_code = @internal_code,
      unit = @unit,
      active = COALESCE(@active, 1)
    WHERE id = @id
  `).run({ ...merged, id: Number(req.params.id) });

  return res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireScreen('products'), (req, res) => {
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  return res.status(204).send();
});

module.exports = router;
