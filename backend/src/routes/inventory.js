const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const optionalDateSchema = z.preprocess(
  (value) => value === '' || value === undefined ? null : value,
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()
);

const movementSchema = z.object({
  product_id: z.coerce.number(),
  type: z.enum(['purchase', 'adjustment', 'waste']),
  quantity: z.coerce.number().finite().positive(),
  expiration_date: optionalDateSchema,
  notes: z.string().optional().nullable()
});

const quantitySchema = z.coerce.number().finite().nonnegative();

const postEventInventorySchema = z.object({
  event_name: z.string().trim().min(2),
  event_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.preprocess((value) => value === '' ? null : value, z.string().trim().max(1000).optional().nullable()),
  items: z.array(z.object({
    product_id: z.coerce.number().int().positive(),
    physical_quantity: quantitySchema,
    expected_stock_quantity: quantitySchema.optional()
  })).min(1)
}).refine((payload) => {
  const productIds = payload.items.map((item) => item.product_id);
  return new Set(productIds).size === productIds.length;
}, {
  message: 'Produto repetido no inventario.',
  path: ['items']
});

function createHttpError(message, status, details) {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
}

function roundQuantity(value) {
  return Number(Number(value || 0).toFixed(3));
}

function sameQuantity(left, right) {
  return Math.abs(roundQuantity(left) - roundQuantity(right)) < 0.0005;
}

function nextProductExpiration(product, payload, nextStock) {
  if (nextStock <= 0) return null;
  if (!payload.expiration_date || payload.type === 'waste') return product.expiration_date || null;
  if (!product.expiration_date || product.stock_quantity <= 0) return payload.expiration_date;
  return payload.expiration_date < product.expiration_date ? payload.expiration_date : product.expiration_date;
}

function getPostEventInventory(id) {
  const inventory = db.prepare(`
    SELECT i.*, u.name AS created_by_name
    FROM post_event_inventories i
    LEFT JOIN users u ON u.id = i.created_by
    WHERE i.id = ?
  `).get(id);

  if (!inventory) return null;

  const items = db.prepare(`
    SELECT
      product_id,
      product_name,
      category,
      internal_code,
      unit,
      quantity_before,
      physical_quantity,
      difference,
      consumed_quantity,
      quantity_change
    FROM post_event_inventory_items
    WHERE inventory_id = ?
    ORDER BY category, product_name
  `).all(id);

  return {
    ...inventory,
    items,
    totals: {
      inventoried_items: items.length,
      adjusted_items: items.filter((item) => !sameQuantity(item.quantity_change, 0)).length,
      consumed_items: items.filter((item) => item.consumed_quantity > 0).length
    }
  };
}

function createPostEventInventory(payload, userId) {
  const transaction = db.transaction(() => {
    const productIds = payload.items.map((item) => item.product_id);
    const placeholders = productIds.map(() => '?').join(', ');
    const products = db.prepare(`
      SELECT *
      FROM products
      WHERE active = 1 AND id IN (${placeholders})
    `).all(productIds);

    if (products.length !== productIds.length) {
      throw createHttpError('Um ou mais produtos nao estao cadastrados ou ativos.', 400);
    }

    const itemsByProductId = new Map(payload.items.map((item) => [item.product_id, item]));
    const conflicts = products
      .map((product) => {
        const item = itemsByProductId.get(product.id);
        if (item.expected_stock_quantity === undefined || sameQuantity(product.stock_quantity, item.expected_stock_quantity)) {
          return null;
        }

        return {
          product_id: product.id,
          product_name: product.name,
          expected_stock_quantity: roundQuantity(item.expected_stock_quantity),
          current_stock_quantity: roundQuantity(product.stock_quantity)
        };
      })
      .filter(Boolean);

    if (conflicts.length > 0) {
      throw createHttpError('O estoque mudou desde a geracao do relatorio. Atualize os produtos e confira novamente.', 409, conflicts);
    }

    const inventoryId = db.prepare(`
      INSERT INTO post_event_inventories (event_name, event_date, notes, created_by)
      VALUES (?, ?, ?, ?)
    `).run(payload.event_name, payload.event_date, payload.notes || null, userId).lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO post_event_inventory_items
        (inventory_id, product_id, product_name, category, internal_code, unit, quantity_before, physical_quantity, difference, consumed_quantity, quantity_change)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMovement = db.prepare(`
      INSERT INTO inventory_movements
        (product_id, type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, expiration_date, created_by)
      VALUES
        (?, 'adjustment', ?, ?, ?, 'post_event_inventory', ?, ?, ?, ?)
    `);

    const updateProduct = db.prepare('UPDATE products SET stock_quantity = ?, expiration_date = ? WHERE id = ?');

    products.forEach((product) => {
      const item = itemsByProductId.get(product.id);
      const quantityBefore = roundQuantity(product.stock_quantity);
      const physicalQuantity = roundQuantity(item.physical_quantity);
      const difference = roundQuantity(quantityBefore - physicalQuantity);
      const consumedQuantity = Math.max(difference, 0);
      const quantityChange = roundQuantity(physicalQuantity - quantityBefore);

      insertItem.run(
        inventoryId,
        product.id,
        product.name,
        product.category,
        product.internal_code,
        product.unit,
        quantityBefore,
        physicalQuantity,
        difference,
        consumedQuantity,
        quantityChange
      );

      if (!sameQuantity(quantityChange, 0)) {
        const nextExpiration = physicalQuantity <= 0 ? null : product.expiration_date;
        updateProduct.run(physicalQuantity, nextExpiration, product.id);
        insertMovement.run(
          product.id,
          quantityChange,
          quantityBefore,
          physicalQuantity,
          inventoryId,
          `Inventario pos-evento: ${payload.event_name}`,
          nextExpiration,
          userId
        );
      }
    });

    return inventoryId;
  });

  return transaction();
}

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
  const expirationDate = nextProductExpiration(product, payload, nextStock);

  const transaction = db.transaction(() => {
    db.prepare('UPDATE products SET stock_quantity = ?, expiration_date = ? WHERE id = ?').run(nextStock, expirationDate, product.id);
    const result = db.prepare(`
      INSERT INTO inventory_movements
        (product_id, type, quantity_change, quantity_before, quantity_after, reference_type, notes, expiration_date, created_by)
      VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?)
    `).run(product.id, payload.type, signedQuantity, product.stock_quantity, nextStock, payload.notes || null, payload.expiration_date || null, req.user.id);

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

router.get('/post-event', requireRole('admin', 'manager'), (req, res) => {
  const inventories = db.prepare(`
    SELECT
      i.id,
      i.event_name,
      i.event_date,
      i.created_at,
      u.name AS created_by_name,
      COUNT(item.id) AS inventoried_items,
      COALESCE(SUM(CASE WHEN item.consumed_quantity > 0 THEN 1 ELSE 0 END), 0) AS consumed_items,
      COALESCE(SUM(CASE WHEN item.quantity_change != 0 THEN 1 ELSE 0 END), 0) AS adjusted_items
    FROM post_event_inventories i
    LEFT JOIN post_event_inventory_items item ON item.inventory_id = i.id
    LEFT JOIN users u ON u.id = i.created_by
    GROUP BY i.id
    ORDER BY unixepoch(i.created_at) DESC
    LIMIT 20
  `).all();

  return res.json(inventories);
});

router.get('/post-event/:id', requireRole('admin', 'manager'), (req, res) => {
  const inventory = getPostEventInventory(req.params.id);
  if (!inventory) return res.status(404).json({ message: 'Inventario nao encontrado.' });
  return res.json(inventory);
});

router.post('/post-event', requireRole('admin', 'manager'), (req, res) => {
  const payload = postEventInventorySchema.parse(req.body);
  const id = createPostEventInventory(payload, req.user.id);
  return res.status(201).json(getPostEventInventory(id));
});

module.exports = router;
