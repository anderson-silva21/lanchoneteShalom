const { db } = require('../db');

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

function normalizeExpirationDate(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).slice(0, 10);
}

function normalizePrice(value, message) {
  if (value === undefined || value === null || value === '') return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) {
    throw createHttpError(message, 400);
  }
  return price;
}

function getProduct(productId) {
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(productId);
  if (!product) throw createHttpError('Produto nao encontrado.', 404);
  return product;
}

function getBatch(batchId, productId) {
  const statement = db.prepare(`
    SELECT b.*, p.name AS product_name, p.unit
    FROM stock_batches b
    JOIN products p ON p.id = b.product_id
    WHERE b.id = ?
      ${productId ? 'AND b.product_id = ?' : ''}
  `);
  const batch = productId ? statement.get(batchId, productId) : statement.get(batchId);

  if (!batch) throw createHttpError('Lote nao encontrado.', 404);
  return batch;
}

function getProductTotal(productId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(quantity_available), 0) AS total
    FROM stock_batches
    WHERE product_id = ?
  `).get(productId);

  return roundQuantity(row?.total || 0);
}

function getNextExpiration(productId) {
  const row = db.prepare(`
    SELECT expiration_date
    FROM stock_batches
    WHERE product_id = ?
      AND quantity_available > 0
      AND expiration_date IS NOT NULL
      AND expiration_date != ''
    ORDER BY date(expiration_date) ASC, id ASC
    LIMIT 1
  `).get(productId);

  return row?.expiration_date || null;
}

function syncProductStock(productId) {
  const total = getProductTotal(productId);
  const expirationDate = getNextExpiration(productId);
  db.prepare('UPDATE products SET stock_quantity = ?, expiration_date = ? WHERE id = ?')
    .run(total, expirationDate, productId);
  return {
    stock_quantity: total,
    expiration_date: expirationDate
  };
}

function insertMovement({
  productId,
  batchId = null,
  movementType,
  quantityChange,
  quantityBefore,
  quantityAfter,
  referenceType = 'manual',
  referenceId = null,
  notes = null,
  expirationDate = null,
  userId = null
}) {
  return db.prepare(`
    INSERT INTO inventory_movements
      (product_id, batch_id, type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, expiration_date, created_by)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    productId,
    batchId,
    movementType,
    roundQuantity(quantityChange),
    roundQuantity(quantityBefore),
    roundQuantity(quantityAfter),
    referenceType,
    referenceId,
    notes,
    expirationDate,
    userId
  ).lastInsertRowid;
}

function addStock({
  productId,
  batchId = null,
  quantity,
  expirationDate = null,
  movementType = 'purchase',
  referenceType = 'manual',
  referenceId = null,
  notes = null,
  userId = null,
  isDonation = undefined,
  costPrice = null,
  salePrice = null,
  createNewBatch = true
}) {
  const product = getProduct(productId);

  const quantityToAdd = roundQuantity(quantity);
  if (quantityToAdd <= 0) throw createHttpError('Quantidade invalida.', 400);
  const hasDonationFlag = isDonation !== undefined && isDonation !== null && isDonation !== '';
  const normalizedDonationFlag = String(isDonation).trim().toLowerCase();
  const shouldMarkDonation = isDonation === true || isDonation === 1 || ['1', 'true', 'sim', 'yes'].includes(normalizedDonationFlag);
  const nextCostPrice = normalizePrice(costPrice, 'Custo invalido.');
  const nextSalePrice = normalizePrice(salePrice, 'Preco de venda invalido.');

  const quantityBefore = getProductTotal(productId);
  let batch;

  if (batchId && !createNewBatch) {
    batch = getBatch(batchId, productId);
    const nextBatchQuantity = roundQuantity(Number(batch.quantity_available || 0) + quantityToAdd);
    db.prepare('UPDATE stock_batches SET quantity_available = ? WHERE id = ?').run(nextBatchQuantity, batch.id);
  } else {
    const result = db.prepare(`
      INSERT INTO stock_batches (product_id, expiration_date, quantity_available)
      VALUES (?, ?, ?)
    `).run(productId, normalizeExpirationDate(expirationDate), quantityToAdd);
    batch = db.prepare('SELECT * FROM stock_batches WHERE id = ?').get(result.lastInsertRowid);
  }

  if (hasDonationFlag || nextCostPrice !== null || nextSalePrice !== null) {
    const nextDonationFlag = shouldMarkDonation ? 1 : hasDonationFlag ? 0 : Number(product.is_donation || 0);
    db.prepare('UPDATE products SET cost_price = ?, is_donation = ?, sale_price = ? WHERE id = ?')
      .run(shouldMarkDonation ? 0 : (nextCostPrice ?? product.cost_price), nextDonationFlag, nextSalePrice ?? product.sale_price, productId);
  }

  const synced = syncProductStock(productId);
  const movementId = insertMovement({
    productId,
    batchId: batch.id,
    movementType,
    quantityChange: quantityToAdd,
    quantityBefore,
    quantityAfter: synced.stock_quantity,
    referenceType,
    referenceId,
    notes,
    expirationDate: batch.expiration_date || null,
    userId
  });

  return {
    batch_id: batch.id,
    movement_id: movementId,
    quantity_before: quantityBefore,
    quantity_after: synced.stock_quantity
  };
}

function removeStockFromBatch({
  productId,
  batchId,
  quantity,
  movementType = 'adjustment',
  referenceType = 'manual',
  referenceId = null,
  notes = null,
  userId = null
}) {
  getProduct(productId);
  const batch = getBatch(batchId, productId);
  const quantityToRemove = roundQuantity(quantity);

  if (quantityToRemove <= 0) throw createHttpError('Quantidade invalida.', 400);
  if (roundQuantity(batch.quantity_available) < quantityToRemove) {
    throw createHttpError('Lote nao possui saldo suficiente.', 400);
  }

  const quantityBefore = getProductTotal(productId);
  const nextBatchQuantity = roundQuantity(batch.quantity_available - quantityToRemove);
  db.prepare('UPDATE stock_batches SET quantity_available = ? WHERE id = ?').run(nextBatchQuantity, batch.id);
  const synced = syncProductStock(productId);
  const movementId = insertMovement({
    productId,
    batchId: batch.id,
    movementType,
    quantityChange: -quantityToRemove,
    quantityBefore,
    quantityAfter: synced.stock_quantity,
    referenceType,
    referenceId,
    notes,
    expirationDate: batch.expiration_date || null,
    userId
  });

  return {
    batch_id: batch.id,
    movement_id: movementId,
    quantity_before: quantityBefore,
    quantity_after: synced.stock_quantity
  };
}

function getFefoBatches(productId) {
  return db.prepare(`
    SELECT *
    FROM stock_batches
    WHERE product_id = ?
      AND quantity_available > 0
    ORDER BY
      CASE WHEN expiration_date IS NULL OR expiration_date = '' THEN 1 ELSE 0 END,
      date(expiration_date) ASC,
      id ASC
  `).all(productId);
}

function consumeStockFefo({
  productId,
  quantity,
  movementType = 'sale',
  referenceType = 'sale',
  referenceId = null,
  notes = null,
  userId = null
}) {
  const product = getProduct(productId);
  const quantityToConsume = roundQuantity(quantity);
  if (quantityToConsume <= 0) throw createHttpError('Quantidade invalida.', 400);

  const totalAvailable = getProductTotal(productId);
  if (totalAvailable < quantityToConsume) {
    throw createHttpError(`${product.name} nao possui estoque suficiente.`, 400);
  }

  let remaining = quantityToConsume;
  let runningTotal = totalAvailable;
  const allocations = [];
  const updateBatch = db.prepare('UPDATE stock_batches SET quantity_available = ? WHERE id = ?');

  for (const batch of getFefoBatches(productId)) {
    if (remaining <= 0) break;

    const consumed = roundQuantity(Math.min(remaining, Number(batch.quantity_available || 0)));
    const nextBatchQuantity = roundQuantity(batch.quantity_available - consumed);
    const quantityBefore = runningTotal;
    const quantityAfter = roundQuantity(runningTotal - consumed);

    updateBatch.run(nextBatchQuantity, batch.id);
    const movementId = insertMovement({
      productId,
      batchId: batch.id,
      movementType,
      quantityChange: -consumed,
      quantityBefore,
      quantityAfter,
      referenceType,
      referenceId,
      notes,
      expirationDate: batch.expiration_date || null,
      userId
    });

    allocations.push({
      batch_id: batch.id,
      expiration_date: batch.expiration_date || null,
      quantity: consumed,
      movement_id: movementId
    });

    remaining = roundQuantity(remaining - consumed);
    runningTotal = quantityAfter;
  }

  if (remaining > 0) {
    throw createHttpError(`${product.name} nao possui estoque suficiente.`, 400);
  }

  syncProductStock(productId);
  return allocations;
}

function setProductStock({
  productId,
  physicalQuantity,
  expectedQuantity,
  referenceType = 'manual',
  referenceId = null,
  notes = null,
  userId = null,
  expirationDate = null
}) {
  getProduct(productId);
  const currentQuantity = getProductTotal(productId);
  const nextQuantity = roundQuantity(physicalQuantity);

  if (nextQuantity < 0) throw createHttpError('Quantidade invalida.', 400);

  if (expectedQuantity !== undefined && !sameQuantity(currentQuantity, expectedQuantity)) {
    throw createHttpError('O estoque mudou desde a ultima leitura.', 409, {
      product_id: productId,
      expected_stock_quantity: roundQuantity(expectedQuantity),
      current_stock_quantity: currentQuantity
    });
  }

  if (sameQuantity(currentQuantity, nextQuantity)) {
    return {
      quantity_before: currentQuantity,
      quantity_after: currentQuantity,
      allocations: []
    };
  }

  if (nextQuantity > currentQuantity) {
    const entry = addStock({
      productId,
      quantity: roundQuantity(nextQuantity - currentQuantity),
      expirationDate,
      movementType: 'adjustment',
      referenceType,
      referenceId,
      notes,
      userId,
      createNewBatch: true
    });

    return {
      quantity_before: currentQuantity,
      quantity_after: entry.quantity_after,
      allocations: [{ batch_id: entry.batch_id, quantity: roundQuantity(nextQuantity - currentQuantity) }]
    };
  }

  const allocations = consumeStockFefo({
    productId,
    quantity: roundQuantity(currentQuantity - nextQuantity),
    movementType: 'adjustment',
    referenceType,
    referenceId,
    notes,
    userId
  });

  return {
    quantity_before: currentQuantity,
    quantity_after: nextQuantity,
    allocations
  };
}

function listStockBatches({ productId = null, includeEmpty = false } = {}) {
  const params = [];
  const where = ['p.active = 1'];

  if (productId) {
    where.push('b.product_id = ?');
    params.push(productId);
  }

  if (!includeEmpty) {
    where.push('b.quantity_available > 0');
  }

  return db.prepare(`
    SELECT
      b.id,
      b.product_id,
      p.name AS product_name,
      p.category,
      p.internal_code,
      p.unit,
      b.expiration_date,
      b.quantity_available,
      CAST(julianday(date(b.expiration_date)) - julianday(date('now', 'localtime')) AS INTEGER) AS days_to_expire,
      CASE
        WHEN b.quantity_available <= 0 THEN 'empty'
        WHEN b.expiration_date IS NULL OR b.expiration_date = '' THEN 'missing'
        WHEN date(b.expiration_date) < date('now', 'localtime') THEN 'expired'
        WHEN date(b.expiration_date) <= date('now', 'localtime', '+7 days') THEN 'critical'
        WHEN date(b.expiration_date) <= date('now', 'localtime', '+30 days') THEN 'warning'
        ELSE 'ok'
      END AS expiration_status,
      b.created_at,
      b.updated_at
    FROM stock_batches b
    JOIN products p ON p.id = b.product_id
    WHERE ${where.join(' AND ')}
    ORDER BY
      p.name ASC,
      CASE WHEN b.expiration_date IS NULL OR b.expiration_date = '' THEN 1 ELSE 0 END,
      date(b.expiration_date) ASC,
      b.id ASC
  `).all(...params);
}

function getProductStock(productId, options = {}) {
  const product = getProduct(productId);
  const batches = listStockBatches({ productId, includeEmpty: Boolean(options.includeEmpty) });
  return {
    productId: product.id,
    product,
    totalQuantity: roundQuantity(batches.reduce((sum, batch) => sum + Number(batch.quantity_available || 0), 0)),
    batches
  };
}

function updateBatchExpiration({ batchId, expirationDate }) {
  const batch = getBatch(Number(batchId));
  getProduct(batch.product_id);

  db.prepare('UPDATE stock_batches SET expiration_date = ? WHERE id = ?')
    .run(normalizeExpirationDate(expirationDate), batch.id);

  syncProductStock(batch.product_id);
  return getProductStock(batch.product_id, { includeEmpty: true });
}

module.exports = {
  addStock,
  consumeStockFefo,
  getProductStock,
  listStockBatches,
  removeStockFromBatch,
  roundQuantity,
  sameQuantity,
  setProductStock,
  syncProductStock,
  updateBatchExpiration
};
