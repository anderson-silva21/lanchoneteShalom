const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-legacy-sale-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');

const { db, initDatabase } = require('../src/db');

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('migracao completa tabelas antigas de vendas antes de registrar venda', () => {
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier')),
      active INTEGER NOT NULL DEFAULT 1,
      password_must_change INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      stock_quantity REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      supplier TEXT,
      internal_code TEXT NOT NULL UNIQUE,
      unit TEXT NOT NULL DEFAULT 'unidade',
      expiration_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'dinheiro',
      notes TEXT,
      sold_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      item_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL
    );

    INSERT INTO users (name, username, email, password_hash, role)
    VALUES ('Admin', 'admin', 'admin@example.com', 'hash', 'admin');

    INSERT INTO products (name, category, cost_price, sale_price, stock_quantity, min_stock, supplier, internal_code, unit, expiration_date, active)
    VALUES ('Agua antiga', 'Bebidas', 1, 3, 2, 1, NULL, 'BEB-001', 'unidade', '2026-12-31', 1);
  `);

  initDatabase();

  const salesColumns = db.prepare('PRAGMA table_info(sales)').all().map((column) => column.name);
  const itemColumns = db.prepare('PRAGMA table_info(sale_items)').all().map((column) => column.name);

  assert.ok(salesColumns.includes('estimated_profit'));
  assert.ok(itemColumns.includes('combo_id'));
  assert.ok(itemColumns.includes('unit_cost'));
  assert.ok(itemColumns.includes('line_profit'));

  const { createSale } = require('../src/services/salesService');
  const user = db.prepare('SELECT id, username, role FROM users WHERE username = ?').get('admin');
  const product = db.prepare('SELECT id FROM products WHERE internal_code = ?').get('BEB-001');

  const sale = createSale({
    payment_method: 'pix',
    items: [{ product_id: product.id, quantity: 1 }]
  }, user);

  assert.equal(sale.total, 3);
  assert.equal(sale.estimated_profit, 2);

  const item = db.prepare('SELECT unit_cost, line_profit FROM sale_items WHERE sale_id = ?').get(sale.id);
  assert.deepEqual(item, { unit_cost: 1, line_profit: 2 });
});
