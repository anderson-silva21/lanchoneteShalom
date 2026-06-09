const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');

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
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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

function runMigrations() {
  addColumnIfMissing('users', 'username', 'TEXT');
  fillMissingUsernames();
  addColumnIfMissing('products', 'expiration_date', 'TEXT');
  addColumnIfMissing('combos', 'is_promotion', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('combos', 'expires_at', 'TEXT');
  addColumnIfMissing('combos', 'created_by', 'INTEGER REFERENCES users(id)');
  addColumnIfMissing('sales', 'event_id', 'INTEGER REFERENCES events(id)');
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

function seedProducts() {
  if (countRows('products') > 0) return false;

  const products = [
    ['X-Burger', 'Lanches', 8.5, 18.9, 32, 10, 'Cozinha interna', 'LAN-001', 'unidade'],
    ['X-Salada', 'Lanches', 9.4, 21.9, 26, 10, 'Cozinha interna', 'LAN-002', 'unidade'],
    ['Coca-Cola 350ml', 'Bebidas', 3.8, 7.5, 72, 24, 'Distribuidora Nova', 'BEB-001', 'lata'],
    ['Suco de Laranja', 'Bebidas', 4.1, 9.9, 18, 12, 'Hortifruti Bom Dia', 'BEB-002', 'copo'],
    ['Agua sem gas', 'Bebidas', 1.9, 4.5, 44, 20, 'Distribuidora Nova', 'BEB-003', 'garrafa'],
    ['Batata frita', 'Porcoes', 4.2, 12.0, 28, 12, 'Cozinha interna', 'POR-001', 'porcao'],
    ['Molho cheddar', 'Insumos', 18.0, 0, 6, 4, 'Laticinios Sul', 'INS-001', 'kg'],
    ['Hamburguer 120g', 'Insumos', 5.7, 0, 54, 25, 'Frigorifico Central', 'INS-002', 'unidade'],
    ['Pao brioche', 'Insumos', 1.35, 0, 58, 30, 'Padaria Primavera', 'INS-003', 'unidade'],
    ['Queijo cheddar', 'Insumos', 1.85, 0, 47, 25, 'Laticinios Sul', 'INS-004', 'fatia'],
    ['Bacon', 'Insumos', 2.4, 0, 14, 10, 'Frigorifico Central', 'INS-005', 'porcao']
  ];

  const insert = db.prepare(`
    INSERT INTO products
      (name, category, cost_price, sale_price, stock_quantity, min_stock, supplier, internal_code, unit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  products.forEach((product) => insert.run(product));
  return true;
}

function seedCombos() {
  if (countRows('combos') > 0) return;

  const getProduct = db.prepare('SELECT id FROM products WHERE internal_code = ?');
  const insertCombo = db.prepare('INSERT INTO combos (name, sale_price) VALUES (?, ?)');
  const insertItem = db.prepare('INSERT INTO combo_items (combo_id, product_id, quantity) VALUES (?, ?, ?)');

  const comboId = insertCombo.run('Combo Classico', 34.9).lastInsertRowid;
  [
    ['LAN-001', 1],
    ['BEB-001', 1],
    ['POR-001', 1]
  ].forEach(([code, quantity]) => {
    const product = getProduct.get(code);
    if (product) insertItem.run(comboId, product.id, quantity);
  });
}

function firstSaturday(year, month) {
  let date = dayjs(`${year}-${String(month + 1).padStart(2, '0')}-01`);
  while (date.day() !== 6) date = date.add(1, 'day');
  return date;
}

function lastSaturday(year, month) {
  let date = dayjs(`${year}-${String(month + 1).padStart(2, '0')}-01`).endOf('month');
  while (date.day() !== 6) date = date.subtract(1, 'day');
  return date;
}

function seedPrototypeEvents() {
  if (countRows('events') > 0) return;

  const today = dayjs();
  const year = today.year();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO events (name, event_date, notes)
    VALUES (?, ?, ?)
  `);

  for (let month = 0; month <= today.month(); month += 1) {
    const eventDate = firstSaturday(year, month);
    if (!eventDate.isAfter(today, 'day')) {
      insert.run('Servos Apostolicos', eventDate.format('YYYY-MM-DD'), 'Ocorrencia mensal - seed do prototipo');
    }
  }

  [0, 3].forEach((month) => {
    const eventDate = lastSaturday(year, month);
    if (!eventDate.isAfter(today, 'day')) {
      insert.run('Corujao Shalom', eventDate.format('YYYY-MM-DD'), 'Ocorrencia - seed do prototipo');
    }
  });
}

function seedPrototypeEventSales() {
  if (!columnExists('sales', 'event_id') || countRows('events') === 0) return;

  const events = db.prepare('SELECT id FROM events ORDER BY event_date, id').all();
  const linkedSalesCount = db.prepare('SELECT COUNT(*) AS total FROM sales WHERE event_id IS NOT NULL').get().total;
  const sales = db.prepare(`
    SELECT id
    FROM sales
    WHERE event_id IS NULL
      ${linkedSalesCount > 0 ? "AND notes = 'Venda seed'" : ''}
    ORDER BY created_at, id
  `).all();
  const updateSale = db.prepare('UPDATE sales SET event_id = ? WHERE id = ?');

  sales.forEach((sale, index) => {
    updateSale.run(events[index % events.length].id, sale.id);
  });
}

function consumeSeedProductStock(productId, quantity) {
  if (!tableExists('stock_batches')) return [];

  let remaining = roundQuantity(quantity);
  const allocations = [];
  const batches = db.prepare(`
    SELECT *
    FROM stock_batches
    WHERE product_id = ? AND quantity_available > 0
    ORDER BY
      CASE WHEN expiration_date IS NULL OR expiration_date = '' THEN 1 ELSE 0 END,
      date(expiration_date) ASC,
      id ASC
  `).all(productId);

  const updateBatch = db.prepare('UPDATE stock_batches SET quantity_available = ? WHERE id = ?');

  for (const batch of batches) {
    if (remaining <= 0) break;

    const quantityToConsume = Math.min(remaining, Number(batch.quantity_available || 0));
    const nextQuantity = roundQuantity(Number(batch.quantity_available || 0) - quantityToConsume);
    updateBatch.run(nextQuantity, batch.id);
    allocations.push({
      batch_id: batch.id,
      expiration_date: batch.expiration_date || null,
      quantity: roundQuantity(quantityToConsume)
    });
    remaining = roundQuantity(remaining - quantityToConsume);
  }

  return allocations;
}

function seedSalesHistory() {
  if (countRows('sales') > 0) return;

  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  const products = db.prepare('SELECT id, name, cost_price, sale_price, stock_quantity FROM products WHERE sale_price > 0').all();
  const insertSale = db.prepare(`
    INSERT INTO sales (total, estimated_profit, payment_method, notes, sold_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO sale_items
      (sale_id, product_id, item_name, quantity, unit_price, unit_cost, line_total, line_profit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMovement = db.prepare(`
    INSERT INTO inventory_movements
      (product_id, batch_id, type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, expiration_date, created_by, created_at)
    VALUES (?, ?, 'sale', ?, ?, ?, 'sale', ?, ?, ?, ?, ?)
  `);
  const updateStock = db.prepare('UPDATE products SET stock_quantity = ? WHERE id = ?');

  for (let dayOffset = 13; dayOffset >= 1; dayOffset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    const salesInDay = 3 + (dayOffset % 5);

    for (let i = 0; i < salesInDay; i += 1) {
      const product = products[(dayOffset + i) % products.length];
      const quantity = 1 + ((dayOffset + i) % 2);
      const total = product.sale_price * quantity;
      const profit = (product.sale_price - product.cost_price) * quantity;
      const createdAt = new Date(date);
      createdAt.setHours(11 + ((i * 2) % 10), (i * 13) % 60, 0, 0);
      const iso = createdAt.toISOString();
      const saleId = insertSale.run(total, profit, i % 2 ? 'cartao' : 'pix', 'Venda seed', admin.id, iso).lastInsertRowid;
      insertItem.run(saleId, product.id, product.name, quantity, product.sale_price, product.cost_price, total, profit);

      const current = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(product.id).stock_quantity;
      const after = Math.max(current - quantity, 0);
      updateStock.run(after, product.id);
      const allocations = consumeSeedProductStock(product.id, quantity);
      let movementBefore = current;
      if (allocations.length) {
        allocations.forEach((allocation) => {
          const movementAfter = roundQuantity(movementBefore - allocation.quantity);
          insertMovement.run(
            product.id,
            allocation.batch_id,
            -allocation.quantity,
            movementBefore,
            movementAfter,
            saleId,
            'Baixa automatica por venda seed',
            allocation.expiration_date,
            admin.id,
            iso
          );
          movementBefore = movementAfter;
        });
      } else {
        insertMovement.run(product.id, null, -quantity, current, after, saleId, 'Baixa automatica por venda seed', null, admin.id, iso);
      }
    }
  }

  syncAllProductStockFromBatches();
}

function initDatabase() {
  ensureStockBatchSchema();
  ensureEventSchema();
  runMigrations();
  runSchema();
  runMigrations();
  const seed = db.transaction(() => {
    seedUsers();
    const insertedDemoProducts = seedProducts();
    if (insertedDemoProducts) seedCombos();
    seedPrototypeEvents();
    migrateLegacyStockBatches();
    if (insertedDemoProducts) seedSalesHistory();
    seedPrototypeEventSales();
  });
  seed();
  runMigrations();
}

module.exports = {
  db,
  dbPath,
  initDatabase
};
