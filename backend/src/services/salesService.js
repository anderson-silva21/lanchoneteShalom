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

function listPendingPayments({ limit = 500 } = {}) {
  return db.prepare(`
    SELECT
      s.id,
      s.created_at,
      s.customer_name,
      s.total,
      s.notes,
      s.payment_method,
      s.payment_status,
      s.event_id,
      u.name AS sold_by_name,
      e.name AS event_name,
      e.event_date
    FROM sales s
    LEFT JOIN users u ON u.id = s.sold_by
    LEFT JOIN events e ON e.id = s.event_id
    WHERE s.payment_status = 'pending'
       OR s.payment_method = ?
    ORDER BY s.created_at DESC
    LIMIT ?
  `).all(pendingPaymentMethod, Number(limit) || 500).map((sale) => ({
    ...sale,
    total: money(sale.total)
  }));
}

function normalizeClosingDate(value) {
  const date = String(value || '').trim();
  if (!date) return db.prepare("SELECT date('now', 'localtime') AS date").get().date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw createHttpError('Data de fechamento invalida.', 400);
  }
  return date;
}

function normalizeOptionalEventId(value) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError('Evento invalido.', 400);
  }
  if (!db.prepare('SELECT id FROM events WHERE id = ?').get(id)) {
    throw createHttpError('Evento nao encontrado.', 404);
  }
  return id;
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function buildClosingFilter({ date, eventId }) {
  const where = ['date(s.created_at) = date(?)'];
  const params = [date];

  if (eventId) {
    where.push('s.event_id = ?');
    params.push(eventId);
  }

  return {
    where: where.join(' AND '),
    params
  };
}

function getCashClosing(filters = {}) {
  const date = normalizeClosingDate(filters.date);
  const rawEventId = filters.event_id !== undefined ? filters.event_id : filters.eventId;
  const eventId = normalizeOptionalEventId(rawEventId);
  const { where, params } = buildClosingFilter({ date, eventId });

  const summary = db.prepare(`
    SELECT
      COUNT(*) AS sales_count,
      COALESCE(SUM(s.total), 0) AS gross_total,
      COALESCE(SUM(CASE
        WHEN s.payment_status = 'paid' AND s.payment_method != ? THEN s.total
        ELSE 0
      END), 0) AS paid_total,
      COALESCE(SUM(CASE
        WHEN s.payment_status = 'pending' OR s.payment_method = ? THEN s.total
        ELSE 0
      END), 0) AS pending_total,
      COALESCE(SUM(s.estimated_profit), 0) AS estimated_profit
    FROM sales s
    WHERE ${where}
  `).get(pendingPaymentMethod, pendingPaymentMethod, ...params);

  const paymentMethodsSummary = db.prepare(`
    SELECT
      CASE
        WHEN s.payment_status = 'pending' OR s.payment_method = ? THEN ?
        ELSE s.payment_method
      END AS payment_method,
      CASE
        WHEN s.payment_status = 'pending' OR s.payment_method = ? THEN 'pending'
        ELSE 'paid'
      END AS payment_status,
      COUNT(*) AS sales_count,
      COALESCE(SUM(s.total), 0) AS total,
      COALESCE(SUM(s.estimated_profit), 0) AS estimated_profit
    FROM sales s
    WHERE ${where}
    GROUP BY payment_method, payment_status
    ORDER BY payment_status DESC, total DESC
  `).all(pendingPaymentMethod, pendingPaymentMethod, pendingPaymentMethod, ...params).map((row) => ({
    ...row,
    sales_count: Number(row.sales_count || 0),
    total: money(row.total),
    estimated_profit: money(row.estimated_profit)
  }));

  const sales = db.prepare(`
    SELECT
      s.id,
      s.created_at,
      s.customer_name,
      s.payment_method,
      s.payment_status,
      s.payment_confirmed_at,
      s.total,
      s.estimated_profit,
      s.notes,
      u.name AS sold_by_name,
      e.name AS event_name,
      e.event_date
    FROM sales s
    LEFT JOIN users u ON u.id = s.sold_by
    LEFT JOIN events e ON e.id = s.event_id
    WHERE ${where}
    ORDER BY s.created_at DESC
  `).all(...params).map((sale) => ({
    ...sale,
    total: money(sale.total),
    estimated_profit: money(sale.estimated_profit)
  }));

  const pendingPayments = db.prepare(`
    SELECT
      s.id,
      s.created_at,
      s.customer_name,
      s.total,
      s.notes,
      s.payment_method,
      s.payment_status,
      s.event_id,
      u.name AS sold_by_name,
      e.name AS event_name,
      e.event_date
    FROM sales s
    LEFT JOIN users u ON u.id = s.sold_by
    LEFT JOIN events e ON e.id = s.event_id
    WHERE (s.payment_status = 'pending' OR s.payment_method = ?)
      AND ${where}
    ORDER BY s.created_at DESC
  `).all(pendingPaymentMethod, ...params).map((sale) => ({
    ...sale,
    total: money(sale.total)
  }));

  const event = eventId
    ? db.prepare('SELECT id, name, event_date FROM events WHERE id = ?').get(eventId)
    : null;

  const registeredClosing = eventId
    ? db.prepare(`
      SELECT c.*, u.name AS created_by_name
      FROM cash_closings c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.closing_date = ? AND c.event_id = ?
      ORDER BY datetime(c.created_at) DESC, c.id DESC
      LIMIT 1
    `).get(date, eventId)
    : db.prepare(`
      SELECT c.*, u.name AS created_by_name
      FROM cash_closings c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.closing_date = ? AND c.event_id IS NULL
      ORDER BY datetime(c.created_at) DESC, c.id DESC
      LIMIT 1
    `).get(date);

  return {
    date,
    event,
    summary: {
      sales_count: Number(summary.sales_count || 0),
      gross_total: money(summary.gross_total),
      paid_total: money(summary.paid_total),
      pending_total: money(summary.pending_total),
      estimated_profit: money(summary.estimated_profit)
    },
    payment_methods: paymentMethodsSummary,
    pending_payments: pendingPayments,
    sales,
    registered_closing: registeredClosing ? {
      ...registeredClosing,
      summary: JSON.parse(registeredClosing.summary_json)
    } : null
  };
}

function saveCashClosing(filters = {}, userId = null) {
  const closing = getCashClosing(filters);
  const notes = String(filters.notes || '').trim() || null;
  const eventId = closing.event?.id || null;
  const summaryJson = JSON.stringify({
    summary: closing.summary,
    payment_methods: closing.payment_methods,
    pending_payments: closing.pending_payments.map((payment) => ({
      id: payment.id,
      customer_name: payment.customer_name,
      total: payment.total
    }))
  });

  const existing = eventId
    ? db.prepare('SELECT id FROM cash_closings WHERE closing_date = ? AND event_id = ?').get(closing.date, eventId)
    : db.prepare('SELECT id FROM cash_closings WHERE closing_date = ? AND event_id IS NULL').get(closing.date);

  let id;
  if (existing) {
    id = existing.id;
    db.prepare(`
      UPDATE cash_closings
      SET summary_json = ?, notes = ?, created_by = ?, created_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(summaryJson, notes, userId, id);
  } else {
    id = db.prepare(`
      INSERT INTO cash_closings (closing_date, event_id, summary_json, notes, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(closing.date, eventId, summaryJson, notes, userId).lastInsertRowid;
  }

  return {
    ...getCashClosing({ date: closing.date, event_id: eventId || undefined }),
    closing_record_id: id
  };
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
  getCashClosing,
  getSaleById,
  listPendingPayments,
  saveCashClosing
};
