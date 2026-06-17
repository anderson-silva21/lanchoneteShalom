const { db } = require('../db');
const { findEventForToday } = require('./eventsService');
const { consumeStockFefo } = require('./stockService');

const pendingPaymentMethod = 'pagamento_pendente';
const paidPaymentMethods = new Set(['pix', 'cartao', 'dinheiro']);
const paymentMethods = new Set([...paidPaymentMethods, pendingPaymentMethod]);

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizePaymentMethod(value = 'pix') {
  const method = String(value || 'pix').trim();
  if (!paymentMethods.has(method)) {
    throw createHttpError('Metodo de pagamento invalido.', 400);
  }
  return method;
}

function normalizeCustomerName(value) {
  const customerName = String(value || '').trim();
  return customerName || null;
}

const createSaleTransaction = db.transaction((payload, user) => {
  const items = payload.items || [];
  if (!items.length) {
    throw createHttpError('Inclua ao menos um item na venda.', 400);
  }

  const paymentMethod = normalizePaymentMethod(payload.payment_method || 'pix');
  const paymentStatus = paymentMethod === pendingPaymentMethod ? 'pending' : 'paid';
  const customerName = normalizeCustomerName(payload.customer_name || payload.customerName);

  if (paymentStatus === 'pending' && !customerName) {
    throw createHttpError('Informe a pessoa ou cliente do pagamento pendente.', 400);
  }

  const eventId = findEventForToday()?.id || payload.event_id || payload.eventId || null;
  if (eventId && !db.prepare('SELECT id FROM events WHERE id = ?').get(eventId)) {
    throw createHttpError('Evento nao encontrado.', 404);
  }

  const paymentConfirmedAt = paymentStatus === 'paid' ? new Date().toISOString() : null;
  const paymentConfirmedBy = paymentStatus === 'paid' ? user.id : null;
  const insertSale = db.prepare(`
    INSERT INTO sales
      (total, estimated_profit, payment_method, payment_status, customer_name, payment_confirmed_at, payment_confirmed_by, notes, event_id, sold_by)
    VALUES
      (0, 0, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const saleId = insertSale.run(paymentMethod, paymentStatus, customerName, paymentConfirmedAt, paymentConfirmedBy, payload.notes || null, eventId, user.id).lastInsertRowid;

  const insertItem = db.prepare(`
    INSERT INTO sale_items
      (sale_id, product_id, combo_id, item_name, quantity, unit_price, unit_cost, line_total, line_profit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
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
    consumeStockFefo({
      productId: product.id,
      quantity,
      movementType: 'sale',
      referenceType: 'sale',
      referenceId: saleId,
      notes: note,
      userId: user.id
    });
  }

  items.forEach((item) => {
    const quantity = Number(item.quantity || 1);
    if (quantity <= 0) {
      throw createHttpError('Quantidade invalida.', 400);
    }

    if (item.product_id || item.productId) {
      const product = getProduct.get(item.product_id || item.productId);
      if (!product) {
        throw createHttpError('Produto nao encontrado.', 404);
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
        throw createHttpError('Combo nao encontrado.', 404);
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

    throw createHttpError('Item de venda sem produto ou combo.', 400);
  });

  db.prepare('UPDATE sales SET total = ?, estimated_profit = ? WHERE id = ?').run(total, profit, saleId);
  return saleId;
});

function getSaleById(id) {
  const sale = db.prepare(`
    SELECT s.*, u.name AS sold_by_name, e.name AS event_name, e.event_date
    FROM sales s
    LEFT JOIN users u ON u.id = s.sold_by
    LEFT JOIN events e ON e.id = s.event_id
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

function confirmSalePayment(id, paymentMethod, userId) {
  const method = normalizePaymentMethod(paymentMethod);
  if (method === pendingPaymentMethod) {
    throw createHttpError('Escolha um metodo de pagamento confirmado.', 400);
  }

  const sale = db.prepare('SELECT id, payment_method, payment_status FROM sales WHERE id = ?').get(id);
  if (!sale) throw createHttpError('Venda nao encontrada.', 404);
  if (sale.payment_status !== 'pending' && sale.payment_method !== pendingPaymentMethod) {
    throw createHttpError('Pagamento ja confirmado.', 400);
  }

  db.prepare(`
    UPDATE sales
    SET payment_method = ?,
        payment_status = 'paid',
        payment_confirmed_at = CURRENT_TIMESTAMP,
        payment_confirmed_by = ?
    WHERE id = ?
  `).run(method, userId || null, id);

  return getSaleById(id);
}

module.exports = {
  confirmSalePayment,
  createSale,
  getSaleById
};
