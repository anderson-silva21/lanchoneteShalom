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

function countRows(table) {
  return db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total;
}

function seedUsers() {
  if (countRows('users') > 0) return;

  const insert = db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (@name, @email, @password_hash, @role)
  `);

  insert.run({
    name: 'Administrador da Lanchonete',
    email: 'admin@lanchonete.local',
    password_hash: bcrypt.hashSync('admin123', 10),
    role: 'admin'
  });

  insert.run({
    name: 'Operador de Caixa',
    email: 'caixa@lanchonete.local',
    password_hash: bcrypt.hashSync('caixa123', 10),
    role: 'cashier'
  });
}

function seedProducts() {
  if (countRows('products') > 0) return;

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
      (product_id, type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, notes, created_by, created_at)
    VALUES (?, 'sale', ?, ?, ?, 'sale', ?, ?, ?, ?)
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
      insertMovement.run(product.id, -quantity, current, after, saleId, 'Baixa automatica por venda seed', admin.id, iso);
    }
  }
}

function initDatabase() {
  runSchema();
  const seed = db.transaction(() => {
    seedUsers();
    seedProducts();
    seedCombos();
    seedSalesHistory();
  });
  seed();
}

module.exports = {
  db,
  dbPath,
  initDatabase
};
