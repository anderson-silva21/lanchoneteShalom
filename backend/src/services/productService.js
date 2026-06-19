const { db } = require('../db');

function createHttpError(message, status = 400, details = undefined) {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
}

function roundQuantity(value) {
  return Number(Number(value || 0).toFixed(3));
}

function expectedDeleteProductConfirmation(productId) {
  return `EXCLUIR PRODUTO ${productId}`;
}

function getActiveCombosForProduct(productId) {
  return db.prepare(`
    SELECT c.id, c.name
    FROM combo_items ci
    JOIN combos c ON c.id = ci.combo_id
    WHERE ci.product_id = ?
      AND c.active = 1
      AND (c.expires_at IS NULL OR unixepoch(c.expires_at) > unixepoch('now'))
    ORDER BY c.name
  `).all(productId);
}

function getProductStockSnapshot(productId, productStockQuantity) {
  const batchStock = db.prepare(`
    SELECT COALESCE(SUM(quantity_available), 0) AS total
    FROM stock_batches
    WHERE product_id = ?
  `).get(productId);

  return {
    product_stock: roundQuantity(productStockQuantity),
    batch_stock: roundQuantity(batchStock?.total || 0)
  };
}

const deleteProductTransaction = db.transaction(({ id, confirmation }) => {
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) {
    throw createHttpError('Produto invalido.', 400);
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(productId);
  if (!product) {
    throw createHttpError('Produto ativo nao encontrado.', 404);
  }

  const expectedConfirmation = expectedDeleteProductConfirmation(productId);
  if (String(confirmation || '').trim() !== expectedConfirmation) {
    throw createHttpError(`Digite ${expectedConfirmation} para confirmar a exclusao do produto.`, 400);
  }

  const activeCombos = getActiveCombosForProduct(productId);
  if (activeCombos.length) {
    throw createHttpError('Produto esta em combo ativo. Remova ou encerre o combo antes de excluir.', 409, {
      product_id: productId,
      combos: activeCombos
    });
  }

  const stock = getProductStockSnapshot(productId, product.stock_quantity);
  if (stock.product_stock > 0 || stock.batch_stock > 0) {
    throw createHttpError('Zere o estoque do produto antes de excluir.', 409, {
      product_id: productId,
      ...stock
    });
  }

  const sales = db.prepare('SELECT COUNT(*) AS total FROM sale_items WHERE product_id = ?').get(productId);
  const movements = db.prepare('SELECT COUNT(*) AS total FROM inventory_movements WHERE product_id = ?').get(productId);

  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(productId);

  return {
    product,
    stock,
    sales_count: Number(sales?.total || 0),
    movement_count: Number(movements?.total || 0)
  };
});

function deleteProductSafely(payload) {
  return deleteProductTransaction(payload);
}

module.exports = {
  deleteProductSafely,
  expectedDeleteProductConfirmation
};
