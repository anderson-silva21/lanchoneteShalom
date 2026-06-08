const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-stock-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');

const { db, initDatabase } = require('../src/db');
const { createSale } = require('../src/services/salesService');
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
