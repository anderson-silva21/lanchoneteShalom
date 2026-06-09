const { db } = require('../db');

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function enrichCombo(combo) {
  const items = db.prepare(`
    SELECT
      ci.quantity,
      p.id,
      p.name,
      p.unit,
      p.stock_quantity,
      p.cost_price,
      p.sale_price
    FROM combo_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.combo_id = ?
    ORDER BY p.name
  `).all(combo.id);
  const regularPrice = items.reduce((sum, item) => sum + Number(item.sale_price || 0) * Number(item.quantity || 0), 0);
  const maxAvailable = items.length
    ? Math.max(0, Math.floor(Math.min(...items.map((item) => Number(item.stock_quantity || 0) / Number(item.quantity || 1)))))
    : 0;

  return {
    ...combo,
    is_promotion: Boolean(combo.is_promotion),
    items,
    regular_price: regularPrice,
    savings: Math.max(0, regularPrice - Number(combo.sale_price || 0)),
    max_available: maxAvailable
  };
}

function listActiveCombos() {
  return db.prepare(`
    SELECT *
    FROM combos
    WHERE active = 1
      AND (expires_at IS NULL OR unixepoch(expires_at) > unixepoch('now'))
    ORDER BY is_promotion DESC, name ASC
  `).all().map(enrichCombo);
}

const createComboTransaction = db.transaction((payload, userId) => {
  const productIds = payload.items.map((item) => Number(item.product_id));
  if (new Set(productIds).size !== productIds.length) {
    throw createHttpError('Cada produto pode aparecer apenas uma vez no combo.', 400);
  }

  const getProduct = db.prepare('SELECT id, sale_price, stock_quantity FROM products WHERE id = ? AND active = 1');
  const products = payload.items.map((item) => {
    const product = getProduct.get(item.product_id);
    if (!product) {
      throw createHttpError('Um dos produtos do combo nao foi encontrado.', 404);
    }
    if (Number(product.stock_quantity || 0) < Number(item.quantity)) {
      throw createHttpError('Um dos produtos nao possui estoque suficiente para montar o combo.', 400);
    }
    return { ...product, quantity: Number(item.quantity) };
  });

  const regularPrice = products.reduce((sum, product) => sum + Number(product.sale_price || 0) * product.quantity, 0);
  if (payload.is_promotion && Number(payload.sale_price) >= regularPrice) {
    throw createHttpError('O preco promocional deve ser menor que o preco normal dos produtos.', 400);
  }

  const result = db.prepare(`
    INSERT INTO combos (name, sale_price, is_promotion, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    payload.name,
    payload.sale_price,
    payload.is_promotion ? 1 : 0,
    payload.expires_at || null,
    userId
  );

  const insertItem = db.prepare('INSERT INTO combo_items (combo_id, product_id, quantity) VALUES (?, ?, ?)');
  payload.items.forEach((item) => insertItem.run(result.lastInsertRowid, item.product_id, item.quantity));

  return enrichCombo(db.prepare('SELECT * FROM combos WHERE id = ?').get(result.lastInsertRowid));
});

function createCombo(payload, userId) {
  return createComboTransaction(payload, userId);
}

module.exports = {
  createCombo,
  listActiveCombos
};
