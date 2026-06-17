PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
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

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  cost_price REAL NOT NULL DEFAULT 0,
  is_donation INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS stock_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  expiration_date TEXT,
  quantity_available REAL NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS combos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sale_price REAL NOT NULL DEFAULT 0,
  is_promotion INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_by INTEGER REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS combo_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  combo_id INTEGER NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL DEFAULT 1,
  UNIQUE (combo_id, product_id)
);

CREATE TABLE IF NOT EXISTS sales (
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  combo_id INTEGER REFERENCES combos(id),
  item_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  line_profit REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory_movements (
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS post_event_inventories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (name, event_date)
);

CREATE TABLE IF NOT EXISTS post_event_inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL REFERENCES post_event_inventories(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  internal_code TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity_before REAL NOT NULL,
  physical_quantity REAL NOT NULL,
  difference REAL NOT NULL,
  consumed_quantity REAL NOT NULL,
  quantity_change REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (inventory_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_products_status ON products(active, category, stock_quantity);
CREATE INDEX IF NOT EXISTS idx_stock_batches_product_expiration ON stock_batches(product_id, quantity_available, expiration_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_combos_active_expiration ON combos(active, expires_at);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_event ON sales(event_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_movements_product_date ON inventory_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_movements_batch_date ON inventory_movements(batch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_date_name ON events(event_date, name);
CREATE INDEX IF NOT EXISTS idx_post_event_inventories_date ON post_event_inventories(event_date, created_at);
CREATE INDEX IF NOT EXISTS idx_post_event_inventory_items_inventory ON post_event_inventory_items(inventory_id);

CREATE TRIGGER IF NOT EXISTS trg_products_updated_at
AFTER UPDATE ON products
FOR EACH ROW
BEGIN
  UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_stock_batches_updated_at
AFTER UPDATE ON stock_batches
FOR EACH ROW
BEGIN
  UPDATE stock_batches SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

DROP VIEW IF EXISTS v_products_sheet;
DROP VIEW IF EXISTS v_stock_batches_sheet;
DROP VIEW IF EXISTS v_sales_sheet;
DROP VIEW IF EXISTS v_movements_sheet;
DROP VIEW IF EXISTS v_post_event_inventory_sheet;

CREATE VIEW IF NOT EXISTS v_products_sheet AS
SELECT
  id,
  internal_code AS codigo,
  name AS produto,
  category AS categoria,
  unit AS unidade,
  cost_price AS custo,
  CASE WHEN is_donation = 1 THEN 'sim' ELSE 'nao' END AS doacao,
  sale_price AS preco,
  stock_quantity AS estoque,
  min_stock AS estoque_minimo,
  supplier AS fornecedor,
  expiration_date AS validade,
  CASE
    WHEN stock_quantity <= min_stock * 0.5 THEN 'critico'
    WHEN stock_quantity <= min_stock THEN 'atencao'
    ELSE 'normal'
  END AS status_estoque,
  CASE
    WHEN expiration_date IS NULL OR expiration_date = '' THEN 'sem_validade'
    WHEN date(expiration_date) < date('now', 'localtime') THEN 'vencido'
    WHEN date(expiration_date) <= date('now', 'localtime', '+7 days') THEN 'vence_7_dias'
    WHEN date(expiration_date) <= date('now', 'localtime', '+30 days') THEN 'vence_30_dias'
    ELSE 'ok'
  END AS status_validade,
  updated_at AS atualizado_em
FROM products
WHERE active = 1;

CREATE VIEW IF NOT EXISTS v_stock_batches_sheet AS
SELECT
  b.id AS lote_id,
  p.id AS produto_id,
  p.internal_code AS codigo_produto,
  p.name AS produto,
  p.category AS categoria,
  p.unit AS unidade,
  b.quantity_available AS quantidade,
  b.expiration_date AS validade,
  CAST(julianday(date(b.expiration_date)) - julianday(date('now', 'localtime')) AS INTEGER) AS dias_para_vencer,
  CASE
    WHEN b.quantity_available <= 0 THEN 'esgotado'
    WHEN b.expiration_date IS NULL OR b.expiration_date = '' THEN 'sem_validade'
    WHEN date(b.expiration_date) < date('now', 'localtime') THEN 'vencido'
    WHEN date(b.expiration_date) <= date('now', 'localtime', '+7 days') THEN 'vence_7_dias'
    WHEN date(b.expiration_date) <= date('now', 'localtime', '+30 days') THEN 'vence_30_dias'
    ELSE 'ok'
  END AS status_validade,
  b.created_at AS criado_em,
  b.updated_at AS atualizado_em
FROM stock_batches b
JOIN products p ON p.id = b.product_id
WHERE p.active = 1;

CREATE VIEW IF NOT EXISTS v_sales_sheet AS
SELECT
  s.id AS venda_id,
  s.created_at AS data_hora,
  u.name AS operador,
  e.name AS evento,
  e.event_date AS data_evento,
  s.customer_name AS cliente,
  s.payment_method AS pagamento,
  CASE WHEN s.payment_status = 'pending' THEN 'pendente' ELSE 'pago' END AS status_pagamento,
  s.payment_confirmed_at AS pago_em,
  s.total AS faturamento,
  s.estimated_profit AS lucro_estimado,
  s.notes AS observacoes
FROM sales s
LEFT JOIN users u ON u.id = s.sold_by
LEFT JOIN events e ON e.id = s.event_id;

CREATE VIEW IF NOT EXISTS v_movements_sheet AS
SELECT
  m.id,
  m.created_at AS data_hora,
  p.internal_code AS codigo_produto,
  p.name AS produto,
  m.batch_id AS lote_id,
  m.type AS tipo,
  m.quantity_change AS quantidade,
  m.quantity_before AS antes,
  m.quantity_after AS depois,
  m.expiration_date AS validade,
  m.notes AS observacoes
FROM inventory_movements m
JOIN products p ON p.id = m.product_id;

CREATE VIEW IF NOT EXISTS v_post_event_inventory_sheet AS
SELECT
  i.id AS inventario_id,
  i.event_name AS evento,
  i.event_date AS data_evento,
  i.created_at AS registrado_em,
  u.name AS registrado_por,
  item.internal_code AS codigo_produto,
  item.product_name AS produto,
  item.category AS categoria,
  item.unit AS unidade,
  item.quantity_before AS quantidade_sistema,
  item.physical_quantity AS quantidade_inventario,
  item.difference AS diferenca,
  item.consumed_quantity AS quantidade_consumida,
  item.quantity_change AS ajuste_estoque,
  i.notes AS observacoes
FROM post_event_inventory_items item
JOIN post_event_inventories i ON i.id = item.inventory_id
LEFT JOIN users u ON u.id = i.created_by;
