const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { BRAZIL_SQL_NOW, brazilTimestamp } = require('./utils/time');

const dataDir = path.resolve(__dirname, '../../database');
const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(dataDir, 'lanchonete.sqlite');
const backupDir = path.join(path.dirname(dbPath), 'backups');
let migrationBackupCreated = false;
const BRAZIL_TIMESTAMP_MIGRATION_KEY = 'timestamps_brazil_minus3_migrated_v1';
const USER_ROLES = ['admin', 'manager', 'cashier', 'finance', 'library'];

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function runSchema() {
  const schemaPath = path.join(dataDir, 'schema.sql');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
}

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

function hasExistingApplicationTables() {
  return Boolean(db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    LIMIT 1
  `).get());
}

function createMigrationBackup(reason = 'schema') {
  if (migrationBackupCreated) return null;
  if (String(process.env.BACKUP_BEFORE_MIGRATIONS || 'true').toLowerCase() === 'false') return null;
  if (!hasExistingApplicationTables()) return null;

  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = `${brazilTimestamp().replace(/[: ]/g, '-')}-${String(new Date().getMilliseconds()).padStart(3, '0')}`;
  const file = `lanchonete-pre-migration-${stamp}.sqlite`;
  const target = path.join(backupDir, file);
  db.exec(`VACUUM INTO '${escapeSqlString(target)}'`);
  migrationBackupCreated = true;
  console.log(`Backup pre-migracao criado: ${file} (${reason})`);
  return { file, path: target, reason };
}

function ensureStockBatchSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      expiration_date TEXT,
      quantity_available REAL NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );

    CREATE INDEX IF NOT EXISTS idx_stock_batches_product_expiration
      ON stock_batches(product_id, quantity_available, expiration_date);

    CREATE TRIGGER IF NOT EXISTS trg_stock_batches_updated_at
    AFTER UPDATE ON stock_batches
    FOR EACH ROW
    BEGIN
      UPDATE stock_batches SET updated_at = datetime('now', '-3 hours') WHERE id = OLD.id;
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
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
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
    createMigrationBackup(`add ${table}.${column}`);
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
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );
  `);
}

function ensureAuditLogSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      username TEXT,
      role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      summary TEXT NOT NULL,
      metadata TEXT,
      ip TEXT,
      request_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at);
  `);
}

function ensureLibrarySchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS library_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );

    CREATE TABLE IF NOT EXISTS library_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category_id INTEGER REFERENCES library_categories(id),
      sku TEXT NOT NULL UNIQUE,
      price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
      cost_price REAL NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
      stock_quantity REAL NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
      min_stock REAL NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
      active INTEGER NOT NULL DEFAULT 1,
      published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );

    CREATE TABLE IF NOT EXISTS library_product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES library_products(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      alt_text TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS library_inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES library_products(id),
      type TEXT NOT NULL CHECK (type IN ('replenishment', 'sale', 'adjustment')),
      quantity_change REAL NOT NULL,
      quantity_before REAL NOT NULL,
      quantity_after REAL NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      reason TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );

    CREATE TABLE IF NOT EXISTS library_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
      total_cost REAL NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
      gross_profit REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'manual',
      customer_name TEXT,
      notes TEXT,
      idempotency_key TEXT UNIQUE,
      assisted_request_id INTEGER,
      seller_id INTEGER,
      sold_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );

    CREATE TABLE IF NOT EXISTS library_sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES library_sales(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES library_products(id),
      item_name TEXT NOT NULL,
      sku TEXT NOT NULL,
      quantity REAL NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
      line_total REAL NOT NULL CHECK (line_total >= 0),
      line_profit REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS library_sellers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      whatsapp_phone TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      eligible INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );

    CREATE TABLE IF NOT EXISTS library_round_robin_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_seller_id INTEGER REFERENCES library_sellers(id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );

    CREATE TABLE IF NOT EXISTS library_assisted_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_reference TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'expired')),
      assigned_seller_id INTEGER REFERENCES library_sellers(id),
      assigned_at TEXT,
      customer_note TEXT,
      idempotency_key TEXT UNIQUE,
      sale_id INTEGER REFERENCES library_sales(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      completed_at TEXT,
      cancelled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS library_assisted_request_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES library_assisted_requests(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES library_products(id),
      product_name TEXT NOT NULL,
      sku TEXT NOT NULL,
      requested_quantity REAL NOT NULL CHECK (requested_quantity > 0),
      unit_price_snapshot REAL NOT NULL CHECK (unit_price_snapshot >= 0)
    );

    CREATE TABLE IF NOT EXISTS library_assignment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES library_assisted_requests(id) ON DELETE CASCADE,
      previous_seller_id INTEGER REFERENCES library_sellers(id),
      new_seller_id INTEGER REFERENCES library_sellers(id),
      reason TEXT,
      changed_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );

    CREATE INDEX IF NOT EXISTS idx_library_products_catalog ON library_products(active, published, category_id, name);
    CREATE INDEX IF NOT EXISTS idx_library_products_stock ON library_products(active, stock_quantity, min_stock);
    CREATE INDEX IF NOT EXISTS idx_library_images_product ON library_product_images(product_id, position);
    CREATE INDEX IF NOT EXISTS idx_library_movements_product_date ON library_inventory_movements(product_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_library_sales_created_at ON library_sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_library_sale_items_sale ON library_sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_library_sellers_rotation ON library_sellers(active, eligible, id);
    CREATE INDEX IF NOT EXISTS idx_library_sellers_user ON library_sellers(user_id);
    CREATE INDEX IF NOT EXISTS idx_library_requests_status_created ON library_assisted_requests(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_library_requests_seller_status ON library_assisted_requests(assigned_seller_id, status);
    CREATE INDEX IF NOT EXISTS idx_library_request_items_request ON library_assisted_request_items(request_id);
    CREATE INDEX IF NOT EXISTS idx_library_assignment_history_request ON library_assignment_history(request_id, created_at);
  `);

  addColumnIfMissing('library_sales', 'assisted_request_id', 'INTEGER REFERENCES library_assisted_requests(id)');
  addColumnIfMissing('library_sales', 'seller_id', 'INTEGER REFERENCES library_sellers(id)');
}

function ensureCashClosingSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cash_closings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      closing_date TEXT NOT NULL,
      event_id INTEGER REFERENCES events(id),
      summary_json TEXT NOT NULL,
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (closing_date, event_id)
    );

    CREATE INDEX IF NOT EXISTS idx_cash_closings_date ON cash_closings(closing_date, event_id);
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
    VALUES (?, ?, ${BRAZIL_SQL_NOW})
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = ${BRAZIL_SQL_NOW}
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

function dropSheetViews() {
  db.exec(`
    DROP VIEW IF EXISTS v_products_sheet;
    DROP VIEW IF EXISTS v_stock_batches_sheet;
    DROP VIEW IF EXISTS v_sales_sheet;
    DROP VIEW IF EXISTS v_movements_sheet;
    DROP VIEW IF EXISTS v_post_event_inventory_sheet;
  `);
}

function dropTimestampTriggers() {
  const triggerNames = [
    'trg_products_updated_at',
    'trg_stock_batches_updated_at',
    'trg_users_created_at_local',
    'trg_audit_logs_created_at_local',
    'trg_product_categories_created_at_local',
    'trg_products_created_at_local',
    'trg_stock_batches_created_at_local',
    'trg_combos_created_at_local',
    'trg_sales_created_at_local',
    'trg_inventory_movements_created_at_local',
    'trg_post_event_inventories_created_at_local',
    'trg_events_created_at_local',
    'trg_cash_closings_created_at_local',
    'trg_post_event_inventory_items_created_at_local',
    'trg_library_categories_created_at_local',
    'trg_library_products_created_at_local',
    'trg_library_inventory_movements_created_at_local',
    'trg_library_sales_created_at_local',
    'trg_library_sellers_created_at_local',
    'trg_library_assisted_requests_created_at_local',
    'trg_library_assignment_history_created_at_local'
  ];

  triggerNames.forEach((trigger) => {
    db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  });
}

function createLocalCreatedAtTrigger(table, primaryKey = 'id') {
  if (!tableExists(table) || !columnExists(table, 'created_at')) return;
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_${table}_created_at_local
    AFTER INSERT ON ${table}
    FOR EACH ROW
    WHEN ABS(strftime('%s', NEW.created_at) - strftime('%s', 'now')) <= 1
    BEGIN
      UPDATE ${table} SET created_at = ${BRAZIL_SQL_NOW} WHERE ${primaryKey} = NEW.${primaryKey};
    END;
  `);
}

function ensureBrazilTimestampTriggers() {
  dropTimestampTriggers();

  [
    'users',
    'audit_logs',
    'product_categories',
    'products',
    'stock_batches',
    'combos',
    'sales',
    'inventory_movements',
    'post_event_inventories',
    'events',
    'cash_closings',
    'post_event_inventory_items',
    'library_categories',
    'library_products',
    'library_inventory_movements',
    'library_sales',
    'library_sellers',
    'library_assisted_requests',
    'library_assignment_history'
  ].forEach((table) => createLocalCreatedAtTrigger(table));

  if (tableExists('products') && columnExists('products', 'updated_at')) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_products_updated_at
      AFTER UPDATE ON products
      FOR EACH ROW
      BEGIN
        UPDATE products SET updated_at = ${BRAZIL_SQL_NOW} WHERE id = OLD.id;
      END;
    `);
  }

  if (tableExists('stock_batches') && columnExists('stock_batches', 'updated_at')) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_stock_batches_updated_at
      AFTER UPDATE ON stock_batches
      FOR EACH ROW
      BEGIN
        UPDATE stock_batches SET updated_at = ${BRAZIL_SQL_NOW} WHERE id = OLD.id;
      END;
    `);
  }

  if (tableExists('library_products') && columnExists('library_products', 'updated_at')) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_library_products_updated_at
      AFTER UPDATE ON library_products
      FOR EACH ROW
      BEGIN
        UPDATE library_products SET updated_at = ${BRAZIL_SQL_NOW} WHERE id = OLD.id;
      END;
    `);
  }

  if (tableExists('library_sellers') && columnExists('library_sellers', 'updated_at')) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_library_sellers_updated_at
      AFTER UPDATE ON library_sellers
      FOR EACH ROW
      BEGIN
        UPDATE library_sellers SET updated_at = ${BRAZIL_SQL_NOW} WHERE id = OLD.id;
      END;
    `);
  }

  if (tableExists('library_assisted_requests') && columnExists('library_assisted_requests', 'updated_at')) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_library_assisted_requests_updated_at
      AFTER UPDATE ON library_assisted_requests
      FOR EACH ROW
      BEGIN
        UPDATE library_assisted_requests SET updated_at = ${BRAZIL_SQL_NOW} WHERE id = OLD.id;
      END;
    `);
  }
}

function shiftTimestampColumn(table, column) {
  if (!tableExists(table) || !columnExists(table, column)) return;
  db.prepare(`
    UPDATE ${table}
    SET ${column} = datetime(${column}, '-3 hours')
    WHERE ${column} IS NOT NULL
      AND trim(${column}) != ''
  `).run();
}

function migrateExistingTimestampsToBrazilTime() {
  ensureAppSettingsSchema();
  if (getAppSetting(BRAZIL_TIMESTAMP_MIGRATION_KEY, '0') === '1') return;

  createMigrationBackup('timestamps brazil minus3');
  dropTimestampTriggers();

  const migrate = db.transaction(() => {
    [
      ['users', 'created_at'],
      ['app_settings', 'updated_at'],
      ['audit_logs', 'created_at'],
      ['product_categories', 'created_at'],
      ['products', 'created_at'],
      ['products', 'updated_at'],
      ['stock_batches', 'created_at'],
      ['stock_batches', 'updated_at'],
      ['combos', 'created_at'],
      ['sales', 'created_at'],
      ['sales', 'payment_confirmed_at'],
      ['inventory_movements', 'created_at'],
      ['post_event_inventories', 'created_at'],
      ['events', 'created_at'],
      ['cash_closings', 'created_at'],
      ['post_event_inventory_items', 'created_at'],
      ['library_categories', 'created_at'],
      ['library_products', 'created_at'],
      ['library_products', 'updated_at'],
      ['library_inventory_movements', 'created_at'],
      ['library_sales', 'created_at'],
      ['library_sellers', 'created_at'],
      ['library_sellers', 'updated_at'],
      ['library_assisted_requests', 'created_at'],
      ['library_assisted_requests', 'updated_at'],
      ['library_assisted_requests', 'assigned_at'],
      ['library_assisted_requests', 'completed_at'],
      ['library_assisted_requests', 'cancelled_at'],
      ['library_assignment_history', 'created_at']
    ].forEach(([table, column]) => shiftTimestampColumn(table, column));

    setAppSetting(BRAZIL_TIMESTAMP_MIGRATION_KEY, '1');
  });

  migrate();
}

function ensureUserRoleSchema() {
  if (!tableExists('users')) return;

  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  const tableSql = String(table?.sql || '');
  if (USER_ROLES.every((role) => tableSql.includes(`'${role}'`))) return;

  createMigrationBackup('users.role library');
  const foreignKeysEnabled = Number(db.pragma('foreign_keys', { simple: true })) === 1;
  db.pragma('foreign_keys = OFF');

  const migrate = db.transaction(() => {
    dropSheetViews();

    db.exec(`
      DROP TABLE IF EXISTS users_role_migration;

      CREATE TABLE users_role_migration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'finance', 'library')),
        active INTEGER NOT NULL DEFAULT 1,
        password_must_change INTEGER NOT NULL DEFAULT 0,
        login_failed_attempts INTEGER NOT NULL DEFAULT 0,
        login_locked_until TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
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
        login_failed_attempts,
        login_locked_until,
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
        0,
        NULL,
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

const userForeignKeyTableDefinitions = {
  sales: {
    createSql: (table) => `
      CREATE TABLE ${table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total REAL NOT NULL DEFAULT 0,
        estimated_profit REAL NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT 'dinheiro',
        payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'pending')),
        customer_name TEXT,
        payment_confirmed_at TEXT,
        payment_confirmed_by INTEGER REFERENCES users(id),
        notes TEXT,
        event_id INTEGER REFERENCES events(id),
        sold_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (${BRAZIL_SQL_NOW})
      );
    `,
    columns: [
      ['id', 'NULL'],
      ['total', '0'],
      ['estimated_profit', '0'],
      ['payment_method', "'dinheiro'"],
      ['payment_status', "CASE WHEN payment_method = 'pagamento_pendente' THEN 'pending' ELSE 'paid' END"],
      ['customer_name', 'NULL'],
      ['payment_confirmed_at', 'NULL'],
      ['payment_confirmed_by', 'NULL'],
      ['notes', 'NULL'],
      ['event_id', 'NULL'],
      ['sold_by', 'NULL'],
      ['created_at', BRAZIL_SQL_NOW]
    ]
  },
  inventory_movements: {
    createSql: (table) => `
      CREATE TABLE ${table} (
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
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (${BRAZIL_SQL_NOW})
      );
    `,
    columns: [
      ['id', 'NULL'],
      ['product_id', 'NULL'],
      ['batch_id', 'NULL'],
      ['type', "'adjustment'"],
      ['quantity_change', '0'],
      ['quantity_before', '0'],
      ['quantity_after', '0'],
      ['reference_type', 'NULL'],
      ['reference_id', 'NULL'],
      ['notes', 'NULL'],
      ['expiration_date', 'NULL'],
      ['created_by', 'NULL'],
      ['created_at', BRAZIL_SQL_NOW]
    ]
  },
  combos: {
    createSql: (table) => `
      CREATE TABLE ${table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sale_price REAL NOT NULL DEFAULT 0,
        is_promotion INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT,
        created_by INTEGER REFERENCES users(id),
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (${BRAZIL_SQL_NOW})
      );
    `,
    columns: [
      ['id', 'NULL'],
      ['name', "''"],
      ['sale_price', '0'],
      ['is_promotion', '0'],
      ['expires_at', 'NULL'],
      ['created_by', 'NULL'],
      ['active', '1'],
      ['created_at', BRAZIL_SQL_NOW]
    ]
  },
  cash_closings: {
    createSql: (table) => `
      CREATE TABLE ${table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        closing_date TEXT NOT NULL,
        event_id INTEGER REFERENCES events(id),
        summary_json TEXT NOT NULL,
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (${BRAZIL_SQL_NOW}),
        UNIQUE (closing_date, event_id)
      );
    `,
    columns: [
      ['id', 'NULL'],
      ['closing_date', "date('now', '-3 hours')"],
      ['event_id', 'NULL'],
      ['summary_json', "'{}'"],
      ['notes', 'NULL'],
      ['created_by', 'NULL'],
      ['created_at', BRAZIL_SQL_NOW]
    ]
  },
  post_event_inventories: {
    createSql: (table) => `
      CREATE TABLE ${table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_name TEXT NOT NULL,
        event_date TEXT NOT NULL,
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (${BRAZIL_SQL_NOW})
      );
    `,
    columns: [
      ['id', 'NULL'],
      ['event_name', "''"],
      ['event_date', "date('now', '-3 hours')"],
      ['notes', 'NULL'],
      ['created_by', 'NULL'],
      ['created_at', BRAZIL_SQL_NOW]
    ]
  },
  audit_logs: {
    createSql: (table) => `
      CREATE TABLE ${table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        username TEXT,
        role TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        summary TEXT NOT NULL,
        metadata TEXT,
        ip TEXT,
        request_id TEXT,
        created_at TEXT NOT NULL DEFAULT (${BRAZIL_SQL_NOW})
      );
    `,
    columns: [
      ['id', 'NULL'],
      ['user_id', 'NULL'],
      ['username', 'NULL'],
      ['role', 'NULL'],
      ['action', "'system.migration'"],
      ['entity_type', 'NULL'],
      ['entity_id', 'NULL'],
      ['summary', "'Registro migrado'"],
      ['metadata', 'NULL'],
      ['ip', 'NULL'],
      ['request_id', 'NULL'],
      ['created_at', BRAZIL_SQL_NOW]
    ]
  }
};

function hasLegacyUserForeignKey(table) {
  if (!tableExists(table)) return false;
  return db.prepare(`PRAGMA foreign_key_list(${table})`).all().some((foreignKey) => {
    const target = String(foreignKey.table || '');
    return target !== 'users' && /^users([_"]|$)/.test(target);
  });
}

function rebuildTableWithUserForeignKey(table, definition) {
  const migrationTable = `${table}_user_fk_migration`;
  const insertColumns = definition.columns.map(([column]) => column).join(', ');
  const selectColumns = definition.columns.map(([column, fallback]) => {
    return columnExists(table, column) ? column : `${fallback} AS ${column}`;
  }).join(', ');

  db.exec(`DROP TABLE IF EXISTS ${migrationTable};`);
  db.exec(definition.createSql(migrationTable));
  db.exec(`
    INSERT INTO ${migrationTable} (${insertColumns})
    SELECT ${selectColumns}
    FROM ${table};

    DROP TABLE ${table};
    ALTER TABLE ${migrationTable} RENAME TO ${table};
  `);
}

function repairLegacyUserForeignKeys() {
  const tablesToRepair = Object.entries(userForeignKeyTableDefinitions)
    .filter(([table]) => hasLegacyUserForeignKey(table));

  if (!tablesToRepair.length) return;

  createMigrationBackup('legacy user foreign keys');
  const foreignKeysEnabled = Number(db.pragma('foreign_keys', { simple: true })) === 1;
  db.pragma('foreign_keys = OFF');

  const repair = db.transaction(() => {
    dropSheetViews();
    dropTimestampTriggers();
    tablesToRepair.forEach(([table, definition]) => rebuildTableWithUserForeignKey(table, definition));
  });

  try {
    repair();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeysEnabled ? 'ON' : 'OFF'}`);
  }
}

function runMigrations() {
  ensureAppSettingsSchema();
  ensureAuditLogSchema();
  ensureCashClosingSchema();
  ensureLibrarySchema();
  addColumnIfMissing('users', 'username', 'TEXT');
  addColumnIfMissing('users', 'active', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('users', 'password_must_change', 'INTEGER NOT NULL DEFAULT 0');
  fillMissingUsernames();
  ensureUserRoleSchema();
  addColumnIfMissing('users', 'login_failed_attempts', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('users', 'login_locked_until', 'TEXT');
  addColumnIfMissing('products', 'expiration_date', 'TEXT');
  addColumnIfMissing('products', 'is_donation', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('combos', 'is_promotion', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('combos', 'expires_at', 'TEXT');
  addColumnIfMissing('combos', 'created_by', 'INTEGER REFERENCES users(id)');
  addColumnIfMissing('sales', 'event_id', 'INTEGER REFERENCES events(id)');
  addColumnIfMissing('sales', 'estimated_profit', 'REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('sales', 'payment_status', "TEXT NOT NULL DEFAULT 'paid'");
  addColumnIfMissing('sales', 'customer_name', 'TEXT');
  addColumnIfMissing('sales', 'payment_confirmed_at', 'TEXT');
  addColumnIfMissing('sales', 'payment_confirmed_by', 'INTEGER REFERENCES users(id)');
  addColumnIfMissing('sale_items', 'combo_id', 'INTEGER');
  addColumnIfMissing('sale_items', 'unit_cost', 'REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('sale_items', 'line_profit', 'REAL NOT NULL DEFAULT 0');
  addColumnIfMissing('inventory_movements', 'expiration_date', 'TEXT');
  addColumnIfMissing('inventory_movements', 'batch_id', 'INTEGER REFERENCES stock_batches(id)');
  repairLegacyUserForeignKeys();
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
    'cash_closings',
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
      DELETE FROM cash_closings;
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
        'cash_closings',
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
  migrateExistingTimestampsToBrazilTime();
  ensureBrazilTimestampTriggers();
  runMigrations();
  const seed = db.transaction(() => {
    seedUsers();
    seedProductCategories();
    migrateLegacyStockBatches();
  });
  seed();
  ensureBrazilTimestampTriggers();
  runMigrations();
}

module.exports = {
  clearOperationalData,
  compactDatabase,
  db,
  dbPath,
  getAppSetting,
  getOperationalCounts,
  isInitialLoadEnabled,
  setAppSetting,
  setInitialLoadEnabled,
  initDatabase
};
