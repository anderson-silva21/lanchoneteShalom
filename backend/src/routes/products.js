const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { addStock, roundQuantity } = require('../services/stockService');
const { deleteProductSafely } = require('../services/productService');
const { recordAudit } = require('../services/auditService');

const router = express.Router();

const optionalDateSchema = z.preprocess(
  (value) => value === '' || value === undefined ? null : value,
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()
);

const productSchema = z.object({
  name: z.string().trim().min(2),
  category: z.string().trim().min(2),
  cost_price: z.coerce.number().nonnegative(),
  is_donation: z.coerce.boolean().default(false),
  sale_price: z.coerce.number().nonnegative(),
  stock_quantity: z.coerce.number().nonnegative(),
  min_stock: z.coerce.number().nonnegative(),
  supplier: z.preprocess((value) => value === '' ? null : value, z.string().trim().optional().nullable()),
  internal_code: z.string().trim().min(2).optional(),
  unit: z.string().trim().min(1),
  expiration_date: optionalDateSchema,
  active: z.coerce.number().int().min(0).max(1).default(1)
});

const importSchema = z.object({
  csv: z.string().optional(),
  rows: z.array(z.record(z.any())).optional()
}).refine((payload) => payload.csv || payload.rows?.length, {
  message: 'Informe um CSV ou linhas para importar.'
});

const productDeleteSchema = z.object({
  confirmation: z.string().trim().min(1)
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

function ensureProductCategory(category) {
  db.prepare('INSERT OR IGNORE INTO product_categories (name) VALUES (?)').run(category);
}

function parseBooleanText(value) {
  return ['1', 'true', 'sim', 's', 'yes', 'y', 'doacao', 'doação'].includes(String(value || '').trim().toLowerCase());
}

function parseNumberText(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().replace(/\./g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function splitCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(csv) {
  const lines = String(csv || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const headers = splitCsvLine(lines[0], delimiter).map((header) => header.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    return headers.reduce((row, header, index) => ({
      ...row,
      [header]: values[index] ?? ''
    }), {});
  });
}

function field(row, aliases, fallback = '') {
  const normalizedEntries = Object.entries(row).reduce((acc, [key, value]) => ({
    ...acc,
    [String(key).trim().toLowerCase()]: value
  }), {});

  for (const alias of aliases) {
    const key = alias.toLowerCase();
    if (normalizedEntries[key] !== undefined) return normalizedEntries[key];
  }

  return fallback;
}

function normalizeImportRow(row) {
  const isDonation = parseBooleanText(field(row, ['doacao', 'doação', 'donation', 'is_donation']));
  return {
    name: String(field(row, ['produto', 'nome', 'name'])).trim(),
    category: String(field(row, ['categoria', 'category'])).trim(),
    unit: String(field(row, ['unidade', 'unit'], 'unidade')).trim() || 'unidade',
    supplier: String(field(row, ['fornecedor', 'supplier'], '')).trim(),
    cost_price: isDonation ? 0 : parseNumberText(field(row, ['custo', 'cost_price', 'custo unitario', 'custo_unitario'])),
    is_donation: isDonation,
    sale_price: parseNumberText(field(row, ['venda', 'preco', 'preço', 'sale_price', 'valor_venda'])),
    stock_quantity: parseNumberText(field(row, ['estoque', 'quantidade', 'stock_quantity', 'qtd'])),
    min_stock: parseNumberText(field(row, ['minimo', 'mínimo', 'estoque_minimo', 'min_stock'])),
    expiration_date: String(field(row, ['validade', 'expiration_date', 'data_validade'], '')).trim() || null,
    active: 1
  };
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
    SELECT
      pc.name AS category,
      COUNT(p.id) AS total
    FROM product_categories pc
    LEFT JOIN products p ON p.category = pc.name AND p.active = 1
    GROUP BY pc.id, pc.name
    ORDER BY pc.name
  `).all();
  return res.json(categories);
});

router.get('/:id/history', requireScreen('products'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ message: 'Produto nao encontrado.' });

  const movements = db.prepare(`
    SELECT
      m.*,
      u.name AS created_by_name
    FROM inventory_movements m
    LEFT JOIN users u ON u.id = m.created_by
    WHERE m.product_id = ?
    ORDER BY datetime(m.created_at) DESC, m.id DESC
    LIMIT 120
  `).all(product.id);

  const sales = db.prepare(`
    SELECT
      si.id,
      si.sale_id,
      si.quantity,
      si.unit_price,
      si.unit_cost,
      si.line_total,
      si.line_profit,
      s.created_at,
      s.payment_method,
      s.payment_status,
      u.name AS sold_by_name,
      e.name AS event_name
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    LEFT JOIN users u ON u.id = s.sold_by
    LEFT JOIN events e ON e.id = s.event_id
    WHERE si.product_id = ?
    ORDER BY datetime(s.created_at) DESC, si.id DESC
    LIMIT 80
  `).all(product.id);

  const audit = db.prepare(`
    SELECT id, username, role, action, summary, metadata, created_at
    FROM audit_logs
    WHERE entity_type = 'product' AND entity_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 80
  `).all(String(product.id)).map((row) => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null
  }));

  return res.json({ product, movements, sales, audit });
});

router.post('/', requireScreen('products'), (req, res) => {
  const payload = productSchema.parse(req.body);
  const product = {
    ...payload,
    internal_code: generateProductCode(payload.category),
    cost_price: payload.is_donation ? 0 : payload.cost_price,
    is_donation: payload.is_donation ? 1 : 0,
    stock_quantity: 0,
    expiration_date: null
  };

  const transaction = db.transaction(() => {
    ensureProductCategory(product.category);
    const result = db.prepare(`
      INSERT INTO products
        (name, category, cost_price, is_donation, sale_price, stock_quantity, min_stock, supplier, internal_code, unit, expiration_date, active)
      VALUES
        (@name, @category, @cost_price, @is_donation, @sale_price, @stock_quantity, @min_stock, @supplier, @internal_code, @unit, @expiration_date, @active)
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
        isDonation: payload.is_donation,
        createNewBatch: true
      });
    }

    return result.lastInsertRowid;
  });

  const productId = transaction();
  const created = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  recordAudit({
    req,
    action: 'product.create',
    entityType: 'product',
    entityId: created.id,
    summary: `Produto cadastrado: ${created.name}`,
    metadata: { product: created }
  });
  return res.status(201).json(created);
});

router.post('/import', requireScreen('products'), (req, res) => {
  const payload = importSchema.parse(req.body);
  const rawRows = payload.rows?.length ? payload.rows : parseCsv(payload.csv);
  const rows = rawRows.map(normalizeImportRow).filter((row) => row.name || row.category);

  if (!rows.length) return res.status(400).json({ message: 'Nenhuma linha valida encontrada para importar.' });

  const validations = rows.map((row, index) => {
    try {
      return { index, product: productSchema.parse(row) };
    } catch (error) {
      return {
        index,
        error: error.issues?.[0]?.message || 'Linha invalida.'
      };
    }
  });

  const errors = validations.filter((item) => item.error).map((item) => ({
    line: item.index + 2,
    message: item.error
  }));

  if (errors.length) {
    return res.status(400).json({ message: 'Corrija a planilha antes de importar.', errors });
  }

  const transaction = db.transaction(() => {
    const created = [];

    validations.forEach(({ product: payloadRow }) => {
      const product = {
        ...payloadRow,
        internal_code: generateProductCode(payloadRow.category),
        cost_price: payloadRow.is_donation ? 0 : payloadRow.cost_price,
        is_donation: payloadRow.is_donation ? 1 : 0,
        stock_quantity: 0,
        expiration_date: null
      };

      ensureProductCategory(product.category);
      const result = db.prepare(`
        INSERT INTO products
          (name, category, cost_price, is_donation, sale_price, stock_quantity, min_stock, supplier, internal_code, unit, expiration_date, active)
        VALUES
          (@name, @category, @cost_price, @is_donation, @sale_price, @stock_quantity, @min_stock, @supplier, @internal_code, @unit, @expiration_date, @active)
      `).run(product);

      if (roundQuantity(payloadRow.stock_quantity) > 0) {
        addStock({
          productId: result.lastInsertRowid,
          quantity: payloadRow.stock_quantity,
          expirationDate: payloadRow.expiration_date,
          movementType: 'purchase',
          referenceType: 'product_import',
          notes: 'Importacao inicial por planilha',
          userId: req.user.id,
          isDonation: payloadRow.is_donation,
          createNewBatch: true
        });
      }

      created.push(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid));
    });

    return created;
  });

  const created = transaction();
  recordAudit({
    req,
    action: 'product.import',
    entityType: 'product',
    summary: `${created.length} produtos importados por planilha`,
    metadata: { total: created.length, product_ids: created.map((item) => item.id) }
  });

  return res.status(201).json({ created, total: created.length });
});

router.patch('/:id', requireScreen('products'), (req, res) => {
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ message: 'Produto nao encontrado.' });

  const merged = productSchema.parse({ ...current, ...req.body });
  const transaction = db.transaction(() => {
    ensureProductCategory(merged.category);
    db.prepare(`
      UPDATE products SET
        name = @name,
        category = @category,
        cost_price = @cost_price,
        is_donation = @is_donation,
        sale_price = @sale_price,
        min_stock = @min_stock,
        supplier = @supplier,
        internal_code = @internal_code,
        unit = @unit,
        active = COALESCE(@active, 1)
      WHERE id = @id
    `).run({
      ...merged,
      cost_price: merged.is_donation ? 0 : merged.cost_price,
      is_donation: merged.is_donation ? 1 : 0,
      id: Number(req.params.id)
    });
  });
  transaction();

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  recordAudit({
    req,
    action: 'product.update',
    entityType: 'product',
    entityId: updated.id,
    summary: `Produto atualizado: ${updated.name}`,
    metadata: { before: current, after: updated }
  });

  return res.json(updated);
});

router.delete('/:id', requireScreen('products'), requireRole('admin'), (req, res, next) => {
  try {
    const payload = productDeleteSchema.parse(req.body || {});
    const result = deleteProductSafely({
      id: req.params.id,
      confirmation: payload.confirmation
    });

    recordAudit({
      req,
      action: 'product.delete',
      entityType: 'product',
      entityId: result.product.id,
      summary: `Produto excluido: ${result.product.name}`,
      metadata: result
    });

    return res.json({
      message: `Produto ${result.product.name} excluido.`,
      ...result
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
