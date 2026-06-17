const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-stock-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');

const { db, initDatabase } = require('../src/db');
const { getDashboardAnalytics } = require('../src/services/analyticsService');
const { createCombo, listActiveCombos } = require('../src/services/comboService');
const { createEvent } = require('../src/services/eventsService');
const { confirmSalePayment, createSale } = require('../src/services/salesService');
const { addStock, getProductStock } = require('../src/services/stockService');

initDatabase();

let userId;
let productSequence = 1;

function resetDatabase() {
  db.exec(`
    DELETE FROM inventory_movements;
    DELETE FROM sale_items;
    DELETE FROM sales;
    DELETE FROM combo_items;
    DELETE FROM combos;
    DELETE FROM post_event_inventory_items;
    DELETE FROM post_event_inventories;
    DELETE FROM events;
    DELETE FROM stock_batches;
    DELETE FROM products;
    DELETE FROM users;
  `);

  userId = db.prepare(`
    INSERT INTO users (name, username, email, password_hash, role)
    VALUES ('Teste', 'teste', 'teste@example.com', 'hash', 'admin')
  `).run().lastInsertRowid;
}

function createProduct(overrides = {}) {
  const code = `TST-${String(productSequence).padStart(3, '0')}`;
  productSequence += 1;

  const product = {
    name: overrides.name || `Produto ${code}`,
    category: overrides.category || 'Teste',
    cost_price: overrides.cost_price ?? 2,
    sale_price: overrides.sale_price ?? 10,
    stock_quantity: 0,
    min_stock: overrides.min_stock ?? 0,
    supplier: null,
    internal_code: code,
    unit: overrides.unit || 'unidade',
    expiration_date: null,
    active: 1
  };

  const id = db.prepare(`
    INSERT INTO products
      (name, category, cost_price, sale_price, stock_quantity, min_stock, supplier, internal_code, unit, expiration_date, active)
    VALUES
      (@name, @category, @cost_price, @sale_price, @stock_quantity, @min_stock, @supplier, @internal_code, @unit, @expiration_date, @active)
  `).run(product).lastInsertRowid;

  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

function getBatches(productId) {
  return db.prepare(`
    SELECT *
    FROM stock_batches
    WHERE product_id = ?
    ORDER BY date(expiration_date), id
  `).all(productId);
}

test.beforeEach(() => {
  resetDatabase();
});

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('entrada de estoque cria um lote com validade e atualiza o total', () => {
  const product = createProduct({ name: 'Arroz' });

  addStock({
    productId: product.id,
    quantity: 2,
    expirationDate: '2026-06-20',
    movementType: 'purchase',
    userId
  });

  const batches = getBatches(product.id);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].quantity_available, 2);
  assert.equal(batches[0].expiration_date, '2026-06-20');

  const updatedProduct = db.prepare('SELECT stock_quantity, expiration_date FROM products WHERE id = ?').get(product.id);
  assert.equal(updatedProduct.stock_quantity, 2);
  assert.equal(updatedProduct.expiration_date, '2026-06-20');
});

test('compra de estoque pode atualizar custo e valor de venda do produto', () => {
  const product = createProduct({ name: 'Arroz', cost_price: 2, sale_price: 10 });

  addStock({
    productId: product.id,
    quantity: 5,
    expirationDate: '2026-06-20',
    movementType: 'purchase',
    costPrice: 3.75,
    salePrice: 12.5,
    userId
  });

  const updatedProduct = db.prepare('SELECT cost_price, sale_price, stock_quantity FROM products WHERE id = ?').get(product.id);
  assert.equal(updatedProduct.cost_price, 3.75);
  assert.equal(updatedProduct.sale_price, 12.5);
  assert.equal(updatedProduct.stock_quantity, 5);
});

test('venda consome primeiro o lote com menor validade usando FEFO', () => {
  const product = createProduct({ name: 'Arroz' });
  addStock({ productId: product.id, quantity: 2, expirationDate: '2026-06-20', userId });
  addStock({ productId: product.id, quantity: 1, expirationDate: '2026-09-15', userId });

  createSale({
    payment_method: 'pix',
    items: [{ product_id: product.id, quantity: 1 }]
  }, { id: userId });

  const batches = getBatches(product.id);
  assert.equal(batches[0].quantity_available, 1);
  assert.equal(batches[1].quantity_available, 1);

  const movements = db.prepare(`
    SELECT batch_id, quantity_change
    FROM inventory_movements
    WHERE type = 'sale'
    ORDER BY id
  `).all();
  assert.equal(movements.length, 1);
  assert.equal(movements[0].batch_id, batches[0].id);
  assert.equal(movements[0].quantity_change, -1);
});

test('venda distribuida consome multiplos lotes quando o primeiro nao basta', () => {
  const product = createProduct({ name: 'Arroz' });
  addStock({ productId: product.id, quantity: 2, expirationDate: '2026-06-20', userId });
  addStock({ productId: product.id, quantity: 3, expirationDate: '2026-09-15', userId });

  createSale({
    payment_method: 'pix',
    items: [{ product_id: product.id, quantity: 4 }]
  }, { id: userId });

  const batches = getBatches(product.id);
  assert.equal(batches[0].quantity_available, 0);
  assert.equal(batches[1].quantity_available, 1);

  const movements = db.prepare(`
    SELECT batch_id, quantity_change
    FROM inventory_movements
    WHERE type = 'sale'
    ORDER BY id
  `).all();
  assert.deepEqual(movements.map((movement) => movement.batch_id), [batches[0].id, batches[1].id]);
  assert.deepEqual(movements.map((movement) => movement.quantity_change), [-2, -2]);

  const updatedProduct = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(product.id);
  assert.equal(updatedProduct.stock_quantity, 1);
});

test('consulta de lotes identifica produtos vencidos', () => {
  const product = createProduct({ name: 'Arroz' });
  addStock({ productId: product.id, quantity: 1, expirationDate: '2000-01-01', userId });

  const stock = getProductStock(product.id);
  assert.equal(stock.totalQuantity, 1);
  assert.equal(stock.batches.length, 1);
  assert.equal(stock.batches[0].expiration_status, 'expired');
  assert.ok(stock.batches[0].days_to_expire < 0);
});

test('dashboard agrupa receita das vendas por evento no ano', () => {
  const insert = db.prepare('INSERT INTO events (name, event_date) VALUES (?, ?)');
  const year = new Date().getFullYear();

  const servosJanuary = insert.run('Servos Apostolicos', `${year}-01-01`).lastInsertRowid;
  const servosFebruary = insert.run('Servos Apostolicos', `${year}-02-01`).lastInsertRowid;
  const corujao = insert.run('Corujao Shalom', `${year}-01-15`).lastInsertRowid;
  const insertSale = db.prepare(`
    INSERT INTO sales (total, estimated_profit, payment_method, event_id, sold_by)
    VALUES (?, ?, 'pix', ?, ?)
  `);

  insertSale.run(100, 40, servosJanuary, userId);
  insertSale.run(80, 30, servosFebruary, userId);
  insertSale.run(250, 90, corujao, userId);

  const events = getDashboardAnalytics().event_revenue;

  assert.deepEqual(events.map((event) => [event.name, event.revenue, event.occurrences]), [
    ['Corujao Shalom', 250, 1],
    ['Servos Apostolicos', 180, 2]
  ]);
});

test('venda pode ser vinculada a um evento', () => {
  const product = createProduct({ name: 'Pastel' });
  addStock({ productId: product.id, quantity: 2, expirationDate: '2026-12-20', userId });
  const year = new Date().getFullYear();
  const eventId = db.prepare('INSERT INTO events (name, event_date) VALUES (?, ?)').run('Corujao Shalom', `${year}-01-15`).lastInsertRowid;

  const sale = createSale({
    payment_method: 'pix',
    event_id: eventId,
    items: [{ product_id: product.id, quantity: 1 }]
  }, { id: userId });

  assert.equal(sale.event_id, eventId);
  assert.equal(sale.event_name, 'Corujao Shalom');
});

test('pagamento pendente exige cliente', () => {
  const product = createProduct({ name: 'Cafe' });
  addStock({ productId: product.id, quantity: 2, expirationDate: '2026-12-20', userId });

  assert.throws(() => createSale({
    payment_method: 'pagamento_pendente',
    items: [{ product_id: product.id, quantity: 1 }]
  }, { id: userId }), /Informe a pessoa ou cliente/);
});

test('pagamento pendente aparece na dashboard e pode ser confirmado', () => {
  const product = createProduct({ name: 'Cafe', sale_price: 8 });
  addStock({ productId: product.id, quantity: 2, expirationDate: '2026-12-20', userId });

  const sale = createSale({
    payment_method: 'pagamento_pendente',
    customer_name: 'Maria',
    notes: 'Paga no proximo encontro',
    items: [{ product_id: product.id, quantity: 1 }]
  }, { id: userId });

  assert.equal(sale.payment_method, 'pagamento_pendente');
  assert.equal(sale.payment_status, 'pending');
  assert.equal(sale.customer_name, 'Maria');

  const dashboard = getDashboardAnalytics();
  assert.equal(dashboard.kpis.pending_payment_count, 1);
  assert.equal(dashboard.kpis.pending_payment_total, 8);
  assert.equal(dashboard.pending_payments[0].notes, 'Paga no proximo encontro');

  const confirmed = confirmSalePayment(sale.id, 'pix', userId);
  assert.equal(confirmed.payment_method, 'pix');
  assert.equal(confirmed.payment_status, 'paid');

  const row = db.prepare('SELECT pagamento, status_pagamento, cliente FROM v_sales_sheet WHERE venda_id = ?').get(sale.id);
  assert.deepEqual(row, {
    pagamento: 'pix',
    status_pagamento: 'pago',
    cliente: 'Maria'
  });
});

test('registro de evento atribui vendas existentes realizadas na mesma data', () => {
  const saleId = db.prepare(`
    INSERT INTO sales (total, estimated_profit, payment_method, sold_by, created_at)
    VALUES (150, 60, 'pix', ?, '2026-07-10 12:00:00')
  `).run(userId).lastInsertRowid;

  const event = createEvent({
    name: 'Servos Apostolicos',
    event_date: '2026-07-10'
  });

  const sale = db.prepare('SELECT event_id FROM sales WHERE id = ?').get(saleId);
  assert.equal(sale.event_id, event.id);
  assert.equal(event.assigned_sales, 1);
  assert.equal(event.assigned_revenue, 150);
});

test('nova venda e atribuida automaticamente ao evento do dia', () => {
  const today = db.prepare("SELECT date('now', 'localtime') AS date").get().date;
  const event = createEvent({
    name: 'Evento de Hoje',
    event_date: today
  });
  const product = createProduct({ name: 'Cafe' });
  addStock({ productId: product.id, quantity: 2, expirationDate: '2026-12-20', userId });

  const sale = createSale({
    payment_method: 'pix',
    items: [{ product_id: product.id, quantity: 1 }]
  }, { id: userId });

  assert.equal(sale.event_id, event.id);
  assert.equal(sale.event_name, 'Evento de Hoje');
});

test('caixa cria promocao e venda desconta o estoque dos produtos do combo', () => {
  const pastel = createProduct({ name: 'Pastel', sale_price: 8, cost_price: 3 });
  const coxinha = createProduct({ name: 'Coxinha', sale_price: 7, cost_price: 2.5 });
  addStock({ productId: pastel.id, quantity: 10, expirationDate: '2026-12-20', userId });
  addStock({ productId: coxinha.id, quantity: 6, expirationDate: '2026-12-20', userId });

  const promotion = createCombo({
    name: 'Queima de salgados',
    sale_price: 18,
    is_promotion: true,
    expires_at: '2099-12-31T23:59:59.000Z',
    items: [
      { product_id: pastel.id, quantity: 2 },
      { product_id: coxinha.id, quantity: 1 }
    ]
  }, userId);

  assert.equal(promotion.regular_price, 23);
  assert.equal(promotion.savings, 5);
  assert.equal(promotion.max_available, 5);

  const sale = createSale({
    payment_method: 'pix',
    items: [{ combo_id: promotion.id, quantity: 2 }]
  }, { id: userId });

  assert.equal(sale.total, 36);
  assert.equal(db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(pastel.id).stock_quantity, 6);
  assert.equal(db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(coxinha.id).stock_quantity, 4);
});

test('promocao expirada nao aparece no PDV', () => {
  const product = createProduct({ name: 'Empada', sale_price: 9 });
  addStock({ productId: product.id, quantity: 2, expirationDate: '2026-12-20', userId });
  createCombo({
    name: 'Promocao encerrada',
    sale_price: 5,
    is_promotion: true,
    expires_at: '2000-01-01T23:59:59.000Z',
    items: [{ product_id: product.id, quantity: 1 }]
  }, userId);

  assert.equal(listActiveCombos().length, 0);
});
