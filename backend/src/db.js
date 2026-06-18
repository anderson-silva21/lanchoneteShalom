const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dataDir = path.resolve(__dirname, '../../database');
const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(dataDir, 'lanchonete.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function runSchema() {
  const schemaPath = path.join(dataDir, 'schema.sql');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
}

function ensureStockBatchSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      expiration_date TEXT,
      quantity_available REAL NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_stock_batches_product_expiration
      ON stock_batches(product_id, quantity_available, expiration_date);

    CREATE TRIGGER IF NOT EXISTS trg_stock_batches_updated_at
    AFTER UPDATE ON stock_batches
    FOR EACH ROW
    BEGIN
      UPDATE stock_batches SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
    END;
  `);
}

function ensureEventSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      event_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (name, event_date)
    );

    CREATE INDEX IF NOT EXISTS idx_events_date_name ON events(event_date, name);
  `);
}

function tableExists(table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
}

function addColumnIfMissing(table, column, definition) {
  if (!tableExists(table) || columnExists(table, column)) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    if (error.code === 'SQLITE_ERROR' && /duplicate column name/i.test(error.message)) return;
    throw error;
  }
}

function ensureAppSettingsSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getAppSetting(key, fallback = '') {
  ensureAppSettingsSchema();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row?.value ?? fallback;
}

function setAppSetting(key, value) {
  ensureAppSettingsSchema();
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `).run(key, String(value));
}

function isInitialLoadEnabled() {
  return getAppSetting('initial_load_enabled', '0') === '1';
}

function setInitialLoadEnabled(enabled) {
  setAppSetting('initial_load_enabled', enabled ? '1' : '0');
  return isInitialLoadEnabled();
}

function roundQuantity(value) {
  return Number(Number(value || 0).toFixed(3));
}

function syncProductStockFromBatches(productId) {
  if (!tableExists('stock_batches')) return;

  const total = db.prepare(`
    SELECT COALESCE(SUM(quantity_available), 0) AS total
    FROM stock_batches
    WHERE product_id = ?
  `).get(productId).total;

  const nextExpiration = db.prepare(`
    SELECT expiration_date
    FROM stock_batches
    WHERE product_id = ?
      AND quantity_available > 0
      AND expiration_date IS NOT NULL
      AND expiration_date != ''
    ORDER BY date(expiration_date) ASC, id ASC
    LIMIT 1
  `).get(productId);

  db.prepare('UPDATE products SET stock_quantity = ?, expiration_date = ? WHERE id = ?')
    .run(roundQuantity(total), nextExpiration?.expiration_date || null, productId);
}

function syncAllProductStockFromBatches() {
  if (!tableExists('stock_batches')) return;

  const productIds = db.prepare(`
    SELECT DISTINCT product_id
    FROM stock_batches
  `).all();

  productIds.forEach((row) => syncProductStockFromBatches(row.product_id));
}

function migrateLegacyStockBatches() {
  if (!tableExists('products') || !tableExists('stock_batches')) return;

  const products = db.prepare(`
    SELECT p.id, p.stock_quantity, p.expiration_date
    FROM products p
    WHERE p.stock_quantity > 0
      AND NOT EXISTS (
        SELECT 1
        FROM stock_batches b
        WHERE b.product_id = p.id
      )
  `).all();

  const insertBatch = db.prepare(`
    INSERT INTO stock_batches (product_id, expiration_date, quantity_available)
    VALUES (?, ?, ?)
  `);

  products.forEach((product) => {
    insertBatch.run(product.id, product.expiration_date || null, roundQuantity(product.stock_quantity));
  });

  syncAllProductStockFromBatches();
}

function normalizeUsername(value, fallback = 'user') {
  const normalized = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/gi, '')
    .toLowerCase();

  return normalized || fallback;
}

function fillMissingUsernames() {
  if (!tableExists('users') || !columnExists('users', 'username')) return;

  const users = db.prepare('SELECT id, name, email, username FROM users ORDER BY id').all();
  const used = new Set(users.map((user) => user.username).filter(Boolean));
  const updateUsername = db.prepare('UPDATE users SET username = ? WHERE id = ?');

  users.forEach((user) => {
    if (user.username) return;

    const defaultUsername = user.email === 'admin@lanchonete.local'
      ? 'admin'
      : user.email === 'caixa@lanchonete.local'
        ? 'caixa'
        : normalizeUsername(String(user.email || user.name).split('@')[0], `user${user.id}`);

    let nextUsername = normalizeUsername(defaultUsername, `user${user.id}`);
    let suffix = 2;
    while (used.has(nextUsername)) {
      nextUsername = `${normalizeUsername(defaultUsername, `user${user.id}`)}${suffix}`;
      suffix += 1;
    }

    used.add(nextUsername);
    updateUsername.run(nextUsername, user.id);
  });
}

function ensureUserRoleSchema() {
  if (!tableExists('users')) return;

  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (String(table?.sql || '').includes("'finance'")) return;

  const foreignKeysEnabled = Number(db.pragma('foreign_keys', { simple: true })) === 1;
  db.pragma('foreign_keys = OFF');

  const migrate = db.transaction(() => {
    db.exec(`
      DROP TABLE IF EXISTS users_role_migration;

      CREATE TABLE users_role_migration (
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

      INSERT INTO users_role_migration (
        id,
        name,
        username,
        email,
        password_hash,
        role,
        active,
        password_must_change,
        created_at
      )
      SELECT
        id,
        name,
        username,
        email,
        password_hash,
        role,
        active,
        password_must_change,
        created_at
      FROM users;

      DROP TABLE users;
      ALTER TABLE users_role_migration RENAME TO users;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);
  });

  try {
    migrate();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeysEnabled ? 'ON' : 'OFF'}`);
  }
}

function runMigrations() {
  ensureAppSettingsSchema();
  addColumnIfMissing('users', 'username', 'TEXT');
  addColumnIfMissing('users', 'active', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('users', 'password_must_change', 'INTEGER NOT NULL DEFAULT 0');
  fillMissingUsernames();
  ensureUserRoleSchema();
  addColumnIfMissing('products', 'expiration_date', 'TEXT');
  addColumnIfMissing('products', 'is_donation', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('combos', 'is_promotion', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('combos', 'expires_at', 'TEXT');
  addColumnIfMissing('combos', 'created_by', 'INTEGER REFERENCES users(id)');
  addColumnIfMissing('sales', 'event_id', 'INTEGER REFERENCES events(id)');
  addColumnIfMissing('sales', 'payment_status', "TEXT NOT NULL DEFAULT 'paid'");
  addColumnIfMissing('sales', 'customer_name', 'TEXT');
  addColumnIfMissing('sales', 'payment_confirmed_at', 'TEXT');
  addColumnIfMissing('sales', 'payment_confirmed_by', 'INTEGER REFERENCES users(id)');
  addColumnIfMissing('inventory_movements', 'expiration_date', 'TEXT');
  addColumnIfMissing('inventory_movements', 'batch_id', 'INTEGER REFERENCES stock_batches(id)');
  migrateLegacyStockBatches();
}

function countRows(table) {
  return db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total;
}

function seedUsers() {
  if (countRows('users') > 0) return;

  const insert = db.prepare(`
    INSERT INTO users (name, username, email, password_hash, role)
    VALUES (@name, @username, @email, @password_hash, @role)
  `);

  insert.run({
    name: 'Administrador da Lanchonete',
    username: 'admin',
    email: 'admin@lanchonete.local',
    password_hash: bcrypt.hashSync('admin123', 10),
    role: 'admin'
  });

  insert.run({
    name: 'Operador de Caixa',
    username: 'caixa',
    email: 'caixa@lanchonete.local',
    password_hash: bcrypt.hashSync('caixa123', 10),
    role: 'cashier'
  });
}

function seedProductCategories() {
  const insert = db.prepare('INSERT OR IGNORE INTO product_categories (name) VALUES (?)');
  const categories = [
    'Bebidas',
    'Descartáveis',
    'Doces e snacks',
    'Insumos',
    'Lanches',
    'Porcoes'
  ];

  categories.forEach((category) => insert.run(category));

  db.prepare(`
    INSERT OR IGNORE INTO product_categories (name)
    SELECT DISTINCT category
    FROM products
    WHERE category IS NOT NULL AND trim(category) != ''
  `).run();
}

function getOperationalCounts() {
  const tables = [
    'products',
    'stock_batches',
    'inventory_movements',
    'sales',
    'sale_items',
    'combos',
    'combo_items',
    'events',
    'post_event_inventories',
    'post_event_inventory_items',
    'product_categories'
  ];

  return tables.reduce((counts, table) => ({
    ...counts,
    [table]: tableExists(table) ? countRows(table) : 0
  }), {});
}

function clearOperationalData({ resetCategories = true } = {}) {
  const reset = db.transaction(() => {
    db.exec(`
      DELETE FROM post_event_inventory_items;
      DELETE FROM post_event_inventories;
      DELETE FROM inventory_movements;
      DELETE FROM sale_items;
      DELETE FROM sales;
      DELETE FROM combo_items;
      DELETE FROM combos;
      DELETE FROM stock_batches;
      DELETE FROM events;
      DELETE FROM products;
      ${resetCategories ? 'DELETE FROM product_categories;' : ''}
      DELETE FROM sqlite_sequence
      WHERE name IN (
        'products',
        'stock_batches',
        'inventory_movements',
        'sales',
        'sale_items',
        'combos',
        'combo_items',
        'events',
        'post_event_inventories',
        'post_event_inventory_items',
        'product_categories'
      );
    `);
    seedProductCategories();
  });

  reset();
  return getOperationalCounts();
}

function compactDatabase() {
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('VACUUM');
  db.pragma('wal_checkpoint(TRUNCATE)');
}

function initDatabase() {
  ensureStockBatchSchema();
  ensureEventSchema();
  runMigrations();
  runSchema();
  runMigrations();
  const seed = db.transaction(() => {
    seedUsers();
    seedProductCategories();
    migrateLegacyStockBatches();
  });
  seed();
  runMigrations();
}

module.exports = {
  clearOperationalData,
  compactDatabase,
  db,
  dbPath,
  getOperationalCounts,
  isInitialLoadEnabled,
  setInitialLoadEnabled,
  initDatabase
};
