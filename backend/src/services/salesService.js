const { db } = require('../db');

const createSaleTransaction = db.transaction((payload, user) => {
  const items = payload.items || [];
  if (!items.length) {
    const error = new Error('Inclua ao menos um item na venda.');
    error.status = 400;
    throw error;
  }

  const insertSale = db.prepare(`
    INSERT INTO sales (total, estimated_profit, payment_method, notes, sold_by)
    VALUES (0, 0, ?, ?, ?)
  `);
  const saleId = insertSale.run(payload.payment_method || 'pix', payload.notes || null, user.id).lastInsertRowid;

  const insertItem = db.prepare(`
    INSERT INTO sale_items
      (sale_id, product_id, combo_id, item_name, quantity, unit_price, unit_cost, line_total, line_profit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMovement = db.prepare(`
    INSERT INTO inventory_movements
      (product_id, type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by)
    VALUES (?, 'sale', ?, ?, ?, 'sale', ?, ?, ?)
  `);
  const updateStock = db.prepare('UPDATE products SET stock_quantity = ? WHERE id = ?');
  const getProduct = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1');
  const getCombo = db.prepare('SELECT * FROM combos WHERE id = ? AND active = 1');
  const getComboItems = db.prepare(`
    SELECT ci.quantity, p.*
    FROM combo_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.combo_id = ?
  `);

  let total = 0;
  let profit = 0;

  function reduceProduct(product, quantity, note) {
    if (product.stock_quantity < quantity) {
      const error = new Error(`${product.name} nao possui estoque suficiente.`);
      error.status = 400;
      throw error;
    }

    const after = Number((product.stock_quantity - quantity).toFixed(3));
    updateStock.run(after, product.id);
    insertMovement.run(product.id, -quantity, product.stock_quantity, after, saleId, note, user.id);
  }

  items.forEach((item) => {
    const quantity = Number(item.quantity || 1);
    if (quantity <= 0) {
      const error = new Error('Quantidade invalida.');
      error.status = 400;
      throw error;
    }

    if (item.product_id || item.productId) {
      const product = getProduct.get(item.product_id || item.productId);
      if (!product) {
        const error = new Error('Produto nao encontrado.');
        error.status = 404;
        throw error;
      }

      reduceProduct(product, quantity, `Venda de ${product.name}`);
      const lineTotal = product.sale_price * quantity;
      const lineProfit = (product.sale_price - product.cost_price) * quantity;
      insertItem.run(saleId, product.id, null, product.name, quantity, product.sale_price, product.cost_price, lineTotal, lineProfit);
      total += lineTotal;
      profit += lineProfit;
      return;
    }

    if (item.combo_id || item.comboId) {
      const combo = getCombo.get(item.combo_id || item.comboId);
      if (!combo) {
        const error = new Error('Combo nao encontrado.');
        error.status = 404;
        throw error;
      }

      const comboItems = getComboItems.all(combo.id);
      const unitCost = comboItems.reduce((sum, comboItem) => sum + comboItem.cost_price * comboItem.quantity, 0);

      comboItems.forEach((comboItem) => {
        reduceProduct(comboItem, comboItem.quantity * quantity, `Combo ${combo.name}`);
      });

      const lineTotal = combo.sale_price * quantity;
      const lineProfit = (combo.sale_price - unitCost) * quantity;
      insertItem.run(saleId, null, combo.id, combo.name, quantity, combo.sale_price, unitCost, lineTotal, lineProfit);
      total += lineTotal;
      profit += lineProfit;
      return;
    }

    const error = new Error('Item de venda sem produto ou combo.');
    error.status = 400;
    throw error;
  });

  db.prepare('UPDATE sales SET total = ?, estimated_profit = ? WHERE id = ?').run(total, profit, saleId);
  return saleId;
});

function getSaleById(id) {
  const sale = db.prepare(`
    SELECT s.*, u.name AS sold_by_name
    FROM sales s
    LEFT JOIN users u ON u.id = s.sold_by
    WHERE s.id = ?
  `).get(id);

  if (!sale) return null;

  sale.items = db.prepare(`
    SELECT id, product_id, combo_id, item_name, quantity, unit_price, unit_cost, line_total, line_profit
    FROM sale_items
    WHERE sale_id = ?
  `).all(id);

  return sale;
}

function createSale(payload, user) {
  const saleId = createSaleTransaction(payload, user);
  return getSaleById(saleId);
}

module.exports = {
  createSale,
  getSaleById
};
