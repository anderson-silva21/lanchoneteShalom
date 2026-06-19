const path = require('path');
const bcrypt = require('bcryptjs');

const args = new Set(process.argv.slice(2));
const defaultDevDbPath = path.resolve(__dirname, '../../database/lanchonete.dev.sqlite');
const mainDbPath = path.resolve(__dirname, '../../database/lanchonete.sqlite');
const selectedDbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : defaultDevDbPath;

if (process.env.NODE_ENV === 'production') {
  console.error('Seed de desenvolvimento bloqueado com NODE_ENV=production.');
  process.exit(1);
}

if (selectedDbPath === mainDbPath) {
  console.error('Seed de desenvolvimento bloqueado no banco principal database/lanchonete.sqlite.');
  console.error('Use o banco dedicado database/lanchonete.dev.sqlite ou informe outro DB_PATH de desenvolvimento.');
  process.exit(1);
}

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DB_PATH = selectedDbPath;
process.env.BACKUP_BEFORE_MIGRATIONS = process.env.BACKUP_BEFORE_MIGRATIONS || 'false';

const { clearOperationalData, compactDatabase, db, dbPath, getOperationalCounts, initDatabase } = require('../src/db');
const { createCombo } = require('../src/services/comboService');
const { createEvent } = require('../src/services/eventsService');
const { createSale } = require('../src/services/salesService');
const { addStock } = require('../src/services/stockService');
const { brazilDate } = require('../src/utils/time');

const seedVersion = 'dev-demo-v1';

function hasOperationalData(counts) {
  return [
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
    'post_event_inventory_items'
  ].some((table) => Number(counts[table] || 0) > 0);
}

function ensureDevUser({ name, username, email, role, password }) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return existing.id;

  return db.prepare(`
    INSERT INTO users (name, username, email, password_hash, role, active, password_must_change)
    VALUES (?, ?, ?, ?, ?, 1, 0)
  `).run(name, username, email, bcrypt.hashSync(password, 10), role).lastInsertRowid;
}

function ensureCategory(name) {
  db.prepare('INSERT OR IGNORE INTO product_categories (name) VALUES (?)').run(name);
}

function createProduct(product, userId) {
  ensureCategory(product.category);
  const id = db.prepare(`
    INSERT INTO products
      (name, category, cost_price, is_donation, sale_price, stock_quantity, min_stock, supplier, internal_code, unit, expiration_date, active)
    VALUES
      (@name, @category, @cost_price, @is_donation, @sale_price, 0, @min_stock, @supplier, @internal_code, @unit, NULL, 1)
  `).run({
    ...product,
    cost_price: product.is_donation ? 0 : product.cost_price,
    is_donation: product.is_donation ? 1 : 0,
    supplier: product.supplier || null
  }).lastInsertRowid;

  if (Number(product.quantity || 0) > 0) {
    addStock({
      productId: id,
      quantity: product.quantity,
      expirationDate: product.expiration_date || null,
      movementType: 'purchase',
      referenceType: 'dev_seed',
      notes: 'Carga ficticia de desenvolvimento',
      userId,
      isDonation: Boolean(product.is_donation),
      costPrice: product.is_donation ? 0 : product.cost_price,
      salePrice: product.sale_price,
      createNewBatch: true
    });
  }

  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

function seedProducts(userId) {
  const products = [
    {
      key: 'agua',
      name: 'Agua Mineral 500ml',
      category: 'Bebidas',
      unit: 'garrafa',
      quantity: 30,
      cost_price: 1.2,
      sale_price: 3,
      min_stock: 10,
      supplier: 'Distribuidor Demo',
      internal_code: 'DEV-BEB-001',
      expiration_date: '2026-12-31'
    },
    {
      key: 'refrigerante',
      name: 'Refrigerante Lata 350ml',
      category: 'Bebidas',
      unit: 'unidade',
      quantity: 20,
      cost_price: 3,
      sale_price: 6,
      min_stock: 8,
      supplier: 'Distribuidor Demo',
      internal_code: 'DEV-BEB-002',
      expiration_date: '2026-11-30'
    },
    {
      key: 'suco',
      name: 'Suco de Uva 200ml',
      category: 'Bebidas',
      unit: 'unidade',
      quantity: 10,
      cost_price: 1.8,
      sale_price: 4,
      min_stock: 6,
      supplier: 'Distribuidor Demo',
      internal_code: 'DEV-BEB-003',
      expiration_date: '2026-10-15'
    },
    {
      key: 'guaranita',
      name: 'Guaranita Zero 200ml',
      category: 'Bebidas',
      unit: 'garrafinha',
      quantity: 3,
      cost_price: 1.6,
      sale_price: 4,
      min_stock: 6,
      supplier: 'Distribuidor Demo',
      internal_code: 'DEV-BEB-004',
      expiration_date: '2026-07-01'
    },
    {
      key: 'coxinha',
      name: 'Coxinha',
      category: 'Lanches',
      unit: 'unidade',
      quantity: 14,
      cost_price: 3,
      sale_price: 7,
      min_stock: 5,
      supplier: 'Cozinha Demo',
      internal_code: 'DEV-LAN-001',
      expiration_date: '2026-06-25'
    },
    {
      key: 'pastel',
      name: 'Pastel',
      category: 'Lanches',
      unit: 'unidade',
      quantity: 12,
      cost_price: 3.5,
      sale_price: 8,
      min_stock: 4,
      supplier: 'Cozinha Demo',
      internal_code: 'DEV-LAN-002',
      expiration_date: '2026-06-26'
    },
    {
      key: 'bolo',
      name: 'Bolo de Pote',
      category: 'Doces e snacks',
      unit: 'unidade',
      quantity: 6,
      cost_price: 4,
      sale_price: 9,
      min_stock: 3,
      supplier: 'Confeitaria Demo',
      internal_code: 'DEV-DOC-001',
      expiration_date: '2026-06-24'
    },
    {
      key: 'chocolate',
      name: 'Chocolate',
      category: 'Doces e snacks',
      unit: 'unidade',
      quantity: 18,
      cost_price: 2.5,
      sale_price: 5,
      min_stock: 6,
      supplier: 'Atacado Demo',
      internal_code: 'DEV-DOC-002',
      expiration_date: '2027-01-31'
    },
    {
      key: 'pao_queijo',
      name: 'Pao de Queijo Doado',
      category: 'Lanches',
      unit: 'unidade',
      quantity: 15,
      cost_price: 0,
      is_donation: true,
      sale_price: 5,
      min_stock: 5,
      supplier: 'Doacao Demo',
      internal_code: 'DEV-LAN-003',
      expiration_date: '2026-06-27'
    },
    {
      key: 'copo',
      name: 'Copo 200ml',
      category: 'Descartáveis',
      unit: 'unidade',
      quantity: 250,
      cost_price: 0.12,
      sale_price: 0.5,
      min_stock: 80,
      supplier: 'Descartaveis Demo',
      internal_code: 'DEV-DES-001',
      expiration_date: null
    },
    {
      key: 'guardanapo',
      name: 'Guardanapo Doado',
      category: 'Descartáveis',
      unit: 'pacote',
      quantity: 20,
      cost_price: 0,
      is_donation: true,
      sale_price: 0,
      min_stock: 10,
      supplier: 'Doacao Demo',
      internal_code: 'DEV-DES-002',
      expiration_date: null
    },
    {
      key: 'oleo',
      name: 'Oleo de Cozinha',
      category: 'Insumos',
      unit: 'unidade',
      quantity: 1,
      cost_price: 7,
      sale_price: 0,
      min_stock: 2,
      supplier: 'Mercado Demo',
      internal_code: 'DEV-INS-001',
      expiration_date: '2026-06-15'
    }
  ];

  return products.reduce((acc, product) => ({
    ...acc,
    [product.key]: createProduct(product, userId)
  }), {});
}

function seedSales(products, combo, userId) {
  createSale({
    payment_method: 'pix',
    notes: 'Venda ficticia de balcao',
    items: [
      { product_id: products.agua.id, quantity: 2 },
      { product_id: products.coxinha.id, quantity: 1 }
    ]
  }, { id: userId });

  createSale({
    payment_method: 'dinheiro',
    notes: 'Combo ficticio',
    items: [{ combo_id: combo.id, quantity: 1 }]
  }, { id: userId });

  createSale({
    payment_method: 'cartao',
    notes: 'Venda ficticia em cartao',
    items: [
      { product_id: products.bolo.id, quantity: 2 },
      { product_id: products.chocolate.id, quantity: 1 }
    ]
  }, { id: userId });

  createSale({
    payment_method: 'pagamento_pendente',
    customer_name: 'Maria Demo',
    notes: 'Pagamento pendente ficticio',
    items: [{ product_id: products.refrigerante.id, quantity: 1 }]
  }, { id: userId });

  createSale({
    payment_method: 'pagamento_pendente',
    customer_name: 'Joao Demo',
    notes: 'Pagamento pendente ficticio',
    items: [{ product_id: products.suco.id, quantity: 2 }]
  }, { id: userId });
}

async function main() {
  initDatabase();

  const shouldReset = args.has('--reset');
  const existingMarker = db.prepare("SELECT value FROM app_settings WHERE key = 'dev_seed_version'").get();
  const before = getOperationalCounts();

  if (shouldReset) {
    clearOperationalData({ resetCategories: true });
    db.prepare("DELETE FROM app_settings WHERE key = 'dev_seed_version'").run();
  } else if (existingMarker?.value === seedVersion) {
    console.log(JSON.stringify({
      message: 'Banco de desenvolvimento ja possui dados ficticios.',
      dbPath,
      hint: 'Use npm run seed:dev -- --reset para recriar os dados.'
    }, null, 2));
    return;
  } else if (hasOperationalData(before)) {
    console.error('O banco de desenvolvimento ja possui dados operacionais.');
    console.error('Use npm run seed:dev -- --reset para limpar e recriar os dados ficticios.');
    process.exit(1);
  }

  const adminId = db.prepare("SELECT id FROM users WHERE username = 'admin'").get()?.id;
  const cashierId = db.prepare("SELECT id FROM users WHERE username = 'caixa'").get()?.id || adminId;

  ensureDevUser({
    name: 'Gerente Demo',
    username: 'gerente',
    email: 'gerente.demo@lanchonete.local',
    role: 'manager',
    password: 'gerente123'
  });

  ensureDevUser({
    name: 'Financeiro Demo',
    username: 'financeiro',
    email: 'financeiro.demo@lanchonete.local',
    role: 'finance',
    password: 'financeiro123'
  });

  createEvent({
    name: 'Evento Demo',
    event_date: brazilDate(),
    notes: 'Evento ficticio para testar receita por evento.'
  });

  const products = seedProducts(adminId);
  const combo = createCombo({
    name: 'Combo Lanche Demo',
    sale_price: 12,
    is_promotion: true,
    expires_at: '2099-12-31T23:59:59.000Z',
    items: [
      { product_id: products.pastel.id, quantity: 1 },
      { product_id: products.refrigerante.id, quantity: 1 }
    ]
  }, adminId);

  seedSales(products, combo, cashierId);

  db.prepare(`
    INSERT INTO app_settings (key, value)
    VALUES ('dev_seed_version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(seedVersion);

  compactDatabase();

  console.log(JSON.stringify({
    message: 'Banco de desenvolvimento populado com dados ficticios.',
    dbPath,
    users: {
      admin: 'admin / admin123',
      cashier: 'caixa / caixa123',
      manager: 'gerente / gerente123',
      finance: 'financeiro / financeiro123'
    },
    counts: getOperationalCounts()
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
