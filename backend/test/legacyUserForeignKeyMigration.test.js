const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-legacy-user-fk-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');

const { db, initDatabase } = require('../src/db');

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('migracao corrige chaves estrangeiras antigas para users antes da venda', () => {
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'finance')),
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
      estimated_profit REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'dinheiro',
      notes TEXT,
      event_id INTEGER REFERENCES events(id),
      sold_by INTEGER REFERENCES "users_legacy_role"(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      payment_status TEXT NOT NULL DEFAULT 'paid',
      customer_name TEXT,
      payment_confirmed_at TEXT,
      payment_confirmed_by INTEGER REFERENCES "users_legacy_role"(id)
    );

    CREATE TABLE inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      batch_id INTEGER REFERENCES stock_batches(id),
      type TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'adjustment', 'waste')),
      quantity_change REAL NOT NULL,
      quantity_before REAL NOT NULL,
      quantity_after REAL NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT,
      expiration_date TEXT,
      created_by INTEGER REFERENCES "users_legacy_role"(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE combos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sale_price REAL NOT NULL DEFAULT 0,
      is_promotion INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      created_by INTEGER REFERENCES "users_legacy_role"(id),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users (name, username, email, password_hash, role)
    VALUES ('Admin', 'admin', 'admin@example.com', 'hash', 'admin');

    INSERT INTO products (name, category, cost_price, sale_price, stock_quantity, min_stock, supplier, internal_code, unit, expiration_date, active)
    VALUES ('Agua com FK antiga', 'Bebidas', 1, 3, 2, 1, NULL, 'BEB-LEGACY-FK', 'unidade', '2026-12-31', 1);
  `);

  initDatabase();

  for (const table of ['sales', 'inventory_movements', 'combos']) {
    const userTargets = db.prepare(`PRAGMA foreign_key_list(${table})`).all()
      .filter((foreignKey) => ['sold_by', 'payment_confirmed_by', 'created_by'].includes(foreignKey.from))
      .map((foreignKey) => foreignKey.table);

    assert.ok(userTargets.length > 0);
    assert.deepEqual([...new Set(userTargets)], ['users']);
  }

  const { createSale } = require('../src/services/salesService');
  const user = db.prepare('SELECT id, username, role FROM users WHERE username = ?').get('admin');
  const product = db.prepare('SELECT id FROM products WHERE internal_code = ?').get('BEB-LEGACY-FK');

  const sale = createSale({
    payment_method: 'pix',
    items: [{ product_id: product.id, quantity: 1 }]
  }, user);

  assert.equal(sale.total, 3);
  assert.equal(sale.sold_by, user.id);
});
