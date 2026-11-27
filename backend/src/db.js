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
const { USER_ROLES } = require('./utils/roles');

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

function ensureSaleItemCostAuditSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_item_cost_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
      previous_unit_cost REAL NOT NULL,
      new_unit_cost REAL NOT NULL,
      changed_by INTEGER REFERENCES users(id),
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );

    CREATE INDEX IF NOT EXISTS idx_sale_item_cost_corrections_item
      ON sale_item_cost_corrections(sale_item_id, created_at);
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
      payment_installments INTEGER NOT NULL DEFAULT 1 CHECK (payment_installments >= 1),
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

    CREATE TABLE IF NOT EXISTS library_installment_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL UNIQUE REFERENCES library_sales(id) ON DELETE RESTRICT,
      customer_name TEXT NOT NULL,
      customer_contact TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('pix', 'dinheiro')),
      total_amount REAL NOT NULL CHECK (total_amount >= 0),
      installment_count INTEGER NOT NULL CHECK (installment_count >= 2),
      status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      cancelled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS library_installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES library_installment_plans(id) ON DELETE RESTRICT,
      installment_number INTEGER NOT NULL,
      amount REAL NOT NULL CHECK (amount >= 0),
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
      paid_at TEXT,
      paid_method TEXT,
      notes TEXT,
      paid_by INTEGER REFERENCES users(id),
      UNIQUE(plan_id, installment_number)
    );

    CREATE TABLE IF NOT EXISTS library_sellers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      whatsapp_phone TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      eligible INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER REFERENCES users(id),
      archived_at TEXT,
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
      customer_name TEXT,
      customer_contact TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_library_installment_plans_status ON library_installment_plans(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_library_installments_due ON library_installments(status, due_date);
    CREATE INDEX IF NOT EXISTS idx_library_sellers_rotation ON library_sellers(active, eligible, id);
    CREATE INDEX IF NOT EXISTS idx_library_sellers_user ON library_sellers(user_id);
    CREATE INDEX IF NOT EXISTS idx_library_requests_status_created ON library_assisted_requests(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_library_requests_seller_status ON library_assisted_requests(assigned_seller_id, status);
    CREATE INDEX IF NOT EXISTS idx_library_request_items_request ON library_assisted_request_items(request_id);
    CREATE INDEX IF NOT EXISTS idx_library_assignment_history_request ON library_assignment_history(request_id, created_at);
  `);

  addColumnIfMissing('library_sales', 'assisted_request_id', 'INTEGER REFERENCES library_assisted_requests(id)');
  addColumnIfMissing('library_sales', 'seller_id', 'INTEGER REFERENCES library_sellers(id)');
  addColumnIfMissing('library_sales', 'payment_installments', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('library_sales', 'customer_contact', 'TEXT');
  addColumnIfMissing('library_assisted_requests', 'customer_name', 'TEXT');
  addColumnIfMissing('library_assisted_requests', 'customer_contact', 'TEXT');
  addColumnIfMissing('library_sellers', 'archived_at', 'TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_library_requests_customer_lookup
      ON library_assisted_requests(customer_name, customer_contact);
    CREATE INDEX IF NOT EXISTS idx_library_sellers_archived
      ON library_sellers(archived_at, active, eligible);
  `);
}

function ensureBrothersSchema() {
  createMigrationBackup('brothers module');
  db.exec(`
    CREATE TABLE IF NOT EXISTS brother_permissions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL CHECK (permission IN (
        'brothers:read', 'brothers:create', 'brothers:update',
        'brothers:groups:manage', 'brothers:ministries:manage',
        'brothers:followups:read', 'brothers:followups:create', 'brothers:followups:update',
        'brothers:users:manage', 'brothers:pastoral:coordinate', 'brothers:pastoral:manage',
        'brothers:calendar:read', 'brothers:calendar:manage', 'brothers:self:access'
      )),
      granted_by INTEGER REFERENCES users(id),
      granted_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      PRIMARY KEY (user_id, permission)
    );
    CREATE TABLE IF NOT EXISTS brothers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL, preferred_name TEXT, birth_date TEXT, phone TEXT, email TEXT,
      postal_code TEXT, address_street TEXT, address_number TEXT, address_complement TEXT,
      district TEXT, city TEXT, state TEXT, community_joined_on TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      community_status TEXT, created_by INTEGER REFERENCES users(id), updated_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_brothers_name_birth ON brothers(lower(full_name), birth_date) WHERE birth_date IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_brothers_name ON brothers(full_name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_brothers_status ON brothers(status, full_name COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS prayer_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE, description TEXT,
      responsible_brother_id INTEGER REFERENCES brothers(id), active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );
    CREATE TABLE IF NOT EXISTS brother_group_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT, brother_id INTEGER NOT NULL REFERENCES brothers(id) ON DELETE RESTRICT,
      group_id INTEGER NOT NULL REFERENCES prayer_groups(id) ON DELETE RESTRICT, started_on TEXT NOT NULL, ended_on TEXT,
      created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      CHECK (ended_on IS NULL OR ended_on >= started_on)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_brother_group_current ON brother_group_memberships(brother_id, group_id) WHERE ended_on IS NULL;
    CREATE INDEX IF NOT EXISTS idx_brother_group_history ON brother_group_memberships(brother_id, started_on DESC);
    CREATE TABLE IF NOT EXISTS ministries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE, description TEXT,
      responsible_brother_id INTEGER REFERENCES brothers(id), active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );
    CREATE TABLE IF NOT EXISTS brother_ministry_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT, brother_id INTEGER NOT NULL REFERENCES brothers(id) ON DELETE RESTRICT,
      ministry_id INTEGER NOT NULL REFERENCES ministries(id) ON DELETE RESTRICT, function_title TEXT,
      started_on TEXT NOT NULL, ended_on TEXT, created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      CHECK (ended_on IS NULL OR ended_on >= started_on)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_brother_ministry_current ON brother_ministry_memberships(brother_id, ministry_id) WHERE ended_on IS NULL;
    CREATE INDEX IF NOT EXISTS idx_brother_ministry_history ON brother_ministry_memberships(brother_id, started_on DESC);
    CREATE TABLE IF NOT EXISTS brother_followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT, brother_id INTEGER NOT NULL REFERENCES brothers(id) ON DELETE RESTRICT,
      occurred_on TEXT NOT NULL, responsible_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      category TEXT NOT NULL, notes TEXT NOT NULL, next_on TEXT,
      status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
      created_by INTEGER NOT NULL REFERENCES users(id), updated_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_brother_followups_timeline ON brother_followups(brother_id, occurred_on DESC, id DESC);
    CREATE TABLE IF NOT EXISTS brother_followup_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, followup_id INTEGER NOT NULL REFERENCES brother_followups(id) ON DELETE RESTRICT,
      actor_user_id INTEGER REFERENCES users(id), change_type TEXT NOT NULL,
      previous_occurred_on TEXT, occurred_on TEXT, previous_start_time TEXT, start_time TEXT,
      previous_end_time TEXT, end_time TEXT, previous_status TEXT, status TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now','-3 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_brother_followup_history ON brother_followup_history(followup_id,changed_at DESC);
    CREATE TABLE IF NOT EXISTS brother_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, brother_id INTEGER NOT NULL REFERENCES brothers(id) ON DELETE RESTRICT,
      actor_user_id INTEGER REFERENCES users(id), event_type TEXT NOT NULL, summary TEXT NOT NULL, details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_brother_history_timeline ON brother_history(brother_id, created_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS brother_account_links (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      brother_id INTEGER NOT NULL UNIQUE REFERENCES brothers(id) ON DELETE RESTRICT,
      linked_by INTEGER REFERENCES users(id), linked_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );
    CREATE TABLE IF NOT EXISTS brother_pastoral_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, brother_id INTEGER NOT NULL REFERENCES brothers(id) ON DELETE RESTRICT,
      role TEXT NOT NULL CHECK (role IN ('coordinator','pastor','sheep')),
      started_on TEXT NOT NULL, ended_on TEXT, assigned_by INTEGER REFERENCES users(id),
      CHECK (ended_on IS NULL OR ended_on >= started_on)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_brother_pastoral_role_current ON brother_pastoral_roles(brother_id) WHERE ended_on IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pastoral_coordinator_current ON brother_pastoral_roles(role) WHERE role = 'coordinator' AND ended_on IS NULL;
    CREATE TABLE IF NOT EXISTS pastoral_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pastor_brother_id INTEGER NOT NULL REFERENCES brothers(id) ON DELETE RESTRICT,
      sheep_brother_id INTEGER NOT NULL REFERENCES brothers(id) ON DELETE RESTRICT,
      started_on TEXT NOT NULL, ended_on TEXT, assigned_by INTEGER REFERENCES users(id),
      CHECK (pastor_brother_id != sheep_brother_id), CHECK (ended_on IS NULL OR ended_on >= started_on)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pastoral_assignment_current ON pastoral_assignments(sheep_brother_id) WHERE ended_on IS NULL;
    CREATE INDEX IF NOT EXISTS idx_pastoral_assignment_pastor ON pastoral_assignments(pastor_brother_id, ended_on, sheep_brother_id);
    CREATE TABLE IF NOT EXISTS pastoral_coordinator_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coordinator_brother_id INTEGER NOT NULL REFERENCES brothers(id) ON DELETE RESTRICT,
      pastor_brother_id INTEGER NOT NULL REFERENCES brothers(id) ON DELETE RESTRICT,
      started_on TEXT NOT NULL, ended_on TEXT, assigned_by INTEGER REFERENCES users(id),
      CHECK (coordinator_brother_id != pastor_brother_id), CHECK (ended_on IS NULL OR ended_on >= started_on)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_coordinator_pastor_current ON pastoral_coordinator_assignments(pastor_brother_id) WHERE ended_on IS NULL;
    CREATE INDEX IF NOT EXISTS idx_coordinator_assignment_history ON pastoral_coordinator_assignments(coordinator_brother_id,ended_on,pastor_brother_id);
    CREATE TABLE IF NOT EXISTS community_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT,
      event_type TEXT NOT NULL CHECK (event_type IN ('work','pastoral_meeting','other')),
      event_date TEXT NOT NULL, start_time TEXT, end_time TEXT, location TEXT,
      responsible_user_id INTEGER REFERENCES users(id), visibility TEXT NOT NULL DEFAULT 'community' CHECK (visibility IN ('community','pastoral','private')),
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
      recurrence_interval INTEGER NOT NULL DEFAULT 0 CHECK (recurrence_interval >= 0), recurrence_until TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id), updated_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')), updated_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
      CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time)
    );
    CREATE INDEX IF NOT EXISTS idx_community_events_date ON community_events(event_date, status, event_type);
    CREATE TABLE IF NOT EXISTS community_event_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
      event_date TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('scheduled','cancelled','completed')),
      title TEXT, description TEXT, start_time TEXT, end_time TEXT, location TEXT,
      UNIQUE (event_id,event_date), CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time)
    );
    CREATE TABLE IF NOT EXISTS community_event_participants (
      event_id INTEGER NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
      brother_id INTEGER NOT NULL REFERENCES brothers(id) ON DELETE RESTRICT,
      PRIMARY KEY (event_id,brother_id)
    );
    CREATE TABLE IF NOT EXISTS prayer_group_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL REFERENCES prayer_groups(id) ON DELETE RESTRICT,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), start_time TEXT NOT NULL, end_time TEXT NOT NULL,
      location TEXT, starts_on TEXT NOT NULL, ends_on TEXT, interval_weeks INTEGER NOT NULL DEFAULT 1 CHECK (interval_weeks BETWEEN 1 AND 52),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)), created_by INTEGER REFERENCES users(id),
      CHECK (end_time > start_time), CHECK (ends_on IS NULL OR ends_on >= starts_on)
    );
    CREATE INDEX IF NOT EXISTS idx_prayer_group_schedule_current ON prayer_group_schedules(group_id, active, starts_on);
    CREATE TABLE IF NOT EXISTS prayer_group_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL REFERENCES prayer_group_schedules(id) ON DELETE CASCADE,
      event_date TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('scheduled','cancelled','completed')),
      start_time TEXT, end_time TEXT, location TEXT, UNIQUE (schedule_id,event_date),
      CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time)
    );
  `);
  addColumnIfMissing('brothers', 'photo_url', 'TEXT');
  addColumnIfMissing('brother_followups', 'start_time', 'TEXT');
  addColumnIfMissing('brother_followups', 'end_time', 'TEXT');
  addColumnIfMissing('brother_followups', 'location', 'TEXT');
  addColumnIfMissing('community_event_occurrences', 'moved_to_date', 'TEXT');
  addColumnIfMissing('prayer_group_occurrences', 'moved_to_date', 'TEXT');
  addColumnIfMissing('prayer_groups', 'service_id', 'INTEGER REFERENCES ministries(id) ON DELETE SET NULL');
  addColumnIfMissing('prayer_groups', 'habitual_day_of_week', 'INTEGER');
  addColumnIfMissing('prayer_groups', 'habitual_start_time', 'TEXT');
  addColumnIfMissing('prayer_groups', 'location', 'TEXT');
  addColumnIfMissing('prayer_groups', 'starts_on', 'TEXT');
  addColumnIfMissing('prayer_group_schedules', 'group_profile_schedule', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('brother_ministry_memberships', 'structure_node_id', 'INTEGER REFERENCES ministry_structure_nodes(id) ON DELETE SET NULL');
  addColumnIfMissing('community_events', 'ministry_id', 'INTEGER REFERENCES ministries(id) ON DELETE SET NULL');
  addColumnIfMissing('community_events', 'group_id', 'INTEGER REFERENCES prayer_groups(id) ON DELETE SET NULL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS ministry_structure_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ministry_id INTEGER NOT NULL REFERENCES ministries(id) ON DELETE RESTRICT,
      parent_node_id INTEGER REFERENCES ministry_structure_nodes(id) ON DELETE RESTRICT,
      node_type TEXT NOT NULL CHECK (node_type IN ('coordination','team','custom')),
      name TEXT NOT NULL, description TEXT,
      responsible_brother_id INTEGER REFERENCES brothers(id) ON DELETE SET NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','-3 hours')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','-3 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_ministry_structure_parent ON ministry_structure_nodes(ministry_id,parent_node_id,active);
    CREATE TABLE IF NOT EXISTS ministry_structure_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL REFERENCES ministry_structure_nodes(id) ON DELETE RESTRICT,
      actor_user_id INTEGER REFERENCES users(id), action TEXT NOT NULL,
      summary TEXT NOT NULL, details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','-3 hours'))
    );
    CREATE TABLE IF NOT EXISTS ministry_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ministry_id INTEGER NOT NULL REFERENCES ministries(id) ON DELETE RESTRICT,
      actor_user_id INTEGER REFERENCES users(id), action TEXT NOT NULL,
      summary TEXT NOT NULL, details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','-3 hours'))
    );
    CREATE TABLE IF NOT EXISTS prayer_group_pastors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES prayer_groups(id) ON DELETE RESTRICT,
      brother_id INTEGER NOT NULL REFERENCES brothers(id) ON DELETE RESTRICT,
      started_on TEXT NOT NULL, ended_on TEXT, created_by INTEGER REFERENCES users(id),
      CHECK (ended_on IS NULL OR ended_on >= started_on)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prayer_group_pastor_current ON prayer_group_pastors(group_id,brother_id) WHERE ended_on IS NULL;
    CREATE TABLE IF NOT EXISTS prayer_group_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES prayer_groups(id) ON DELETE RESTRICT,
      actor_user_id INTEGER REFERENCES users(id), action TEXT NOT NULL,
      summary TEXT NOT NULL, details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','-3 hours'))
    );
  `);
  const permissionSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'brother_permissions'").get()?.sql || '';
  if (!permissionSql.includes('brothers:users:manage')) {
    createMigrationBackup('pastoral permissions');
    db.exec(`ALTER TABLE brother_permissions RENAME TO brother_permissions_legacy;
      CREATE TABLE brother_permissions (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        permission TEXT NOT NULL CHECK (permission IN ('brothers:read','brothers:create','brothers:update','brothers:groups:manage','brothers:ministries:manage','brothers:followups:read','brothers:followups:create','brothers:followups:update','brothers:users:manage','brothers:pastoral:coordinate','brothers:pastoral:manage','brothers:calendar:read','brothers:calendar:manage','brothers:self:access')),
        granted_by INTEGER REFERENCES users(id), granted_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours')),
        PRIMARY KEY (user_id,permission));
      INSERT INTO brother_permissions SELECT * FROM brother_permissions_legacy;
      DROP TABLE brother_permissions_legacy;`);
  }
}

function ensureProductImageSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_image_files (
      filename TEXT PRIMARY KEY,
      content BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '-3 hours'))
    );
  `);
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
  const userRoleTriggers = tableExists('user_roles') ? `
    CREATE TRIGGER trg_user_roles_insert AFTER INSERT ON user_roles
    BEGIN UPDATE users SET role = (SELECT role FROM user_roles WHERE user_id = NEW.user_id
      ORDER BY CASE role ${USER_ROLES.map((role, index) => `WHEN '${role}' THEN ${index}`).join(' ')} END LIMIT 1)
      WHERE id = NEW.user_id; END;
    CREATE TRIGGER trg_user_roles_delete AFTER DELETE ON user_roles
    WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = OLD.user_id)
    BEGIN UPDATE users SET role = (SELECT role FROM user_roles WHERE user_id = OLD.user_id
      ORDER BY CASE role ${USER_ROLES.map((role, index) => `WHEN '${role}' THEN ${index}`).join(' ')} END LIMIT 1)
      WHERE id = OLD.user_id; END;
    CREATE TRIGGER trg_users_role_projection BEFORE UPDATE OF role ON users
    WHEN NEW.role != (SELECT role FROM user_roles WHERE user_id = NEW.id
      ORDER BY CASE role ${USER_ROLES.map((role, index) => `WHEN '${role}' THEN ${index}`).join(' ')} END LIMIT 1)
    BEGIN SELECT RAISE(ABORT, 'users.role is a projection; write user_roles'); END;
    CREATE TRIGGER trg_users_initial_role AFTER INSERT ON users
    BEGIN INSERT INTO user_roles (user_id, role) VALUES (NEW.id, NEW.role); END;
  ` : '';

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
        role TEXT NOT NULL CHECK (role IN (${USER_ROLES.map((role) => `'${role}'`).join(', ')})),
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

      DROP TRIGGER IF EXISTS trg_users_initial_role;
      DROP TRIGGER IF EXISTS trg_user_roles_insert;
      DROP TRIGGER IF EXISTS trg_user_roles_delete;
      DROP TABLE users;
      ALTER TABLE users_role_migration RENAME TO users;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
      ${userRoleTriggers}
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

function ensureMultipleUserRolesSchema() {
  if (!tableExists('users')) return;
  if (tableExists('user_roles')) {
    const rolesTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_roles'").get();
    if (USER_ROLES.every((role) => String(rolesTable?.sql || '').includes(`'${role}'`))) return;
    createMigrationBackup('user_roles library cashier');
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`DROP TRIGGER IF EXISTS trg_users_initial_role; DROP TRIGGER IF EXISTS trg_user_roles_insert; DROP TRIGGER IF EXISTS trg_user_roles_delete; DROP TRIGGER IF EXISTS trg_user_roles_immutable; DROP TRIGGER IF EXISTS trg_users_role_projection;
        CREATE TABLE user_roles_migration (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN (${USER_ROLES.map((role) => `'${role}'`).join(', ')})), PRIMARY KEY (user_id, role));
        INSERT INTO user_roles_migration SELECT user_id, role FROM user_roles; DROP TABLE user_roles; ALTER TABLE user_roles_migration RENAME TO user_roles;
        CREATE INDEX idx_user_roles_role ON user_roles(role, user_id);
        CREATE TRIGGER trg_users_initial_role AFTER INSERT ON users BEGIN INSERT INTO user_roles (user_id, role) VALUES (NEW.id, NEW.role); END;
        CREATE TRIGGER trg_user_roles_insert AFTER INSERT ON user_roles BEGIN UPDATE users SET role = (SELECT role FROM user_roles WHERE user_id = NEW.user_id ORDER BY CASE role ${USER_ROLES.map((role, index) => `WHEN '${role}' THEN ${index}`).join(' ')} END LIMIT 1) WHERE id = NEW.user_id; END;
        CREATE TRIGGER trg_user_roles_delete AFTER DELETE ON user_roles WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = OLD.user_id) BEGIN UPDATE users SET role = (SELECT role FROM user_roles WHERE user_id = OLD.user_id ORDER BY CASE role ${USER_ROLES.map((role, index) => `WHEN '${role}' THEN ${index}`).join(' ')} END LIMIT 1) WHERE id = OLD.user_id; END;
        CREATE TRIGGER trg_user_roles_immutable BEFORE UPDATE ON user_roles BEGIN SELECT RAISE(ABORT, 'Replace role assignments instead of updating them'); END;
        CREATE TRIGGER trg_users_role_projection BEFORE UPDATE OF role ON users WHEN NEW.role != (SELECT role FROM user_roles WHERE user_id = NEW.id ORDER BY CASE role ${USER_ROLES.map((role, index) => `WHEN '${role}' THEN ${index}`).join(' ')} END LIMIT 1) BEGIN SELECT RAISE(ABORT, 'users.role is a projection; write user_roles'); END;`);
    })();
    db.pragma('foreign_keys = ON');
    return;
  }
  createMigrationBackup('user_roles');
  const primaryRoleFor = (userId) => `SELECT role FROM user_roles WHERE user_id = ${userId}
    ORDER BY CASE role ${USER_ROLES.map((role, index) => `WHEN '${role}' THEN ${index}`).join(' ')} END LIMIT 1`;
  db.transaction(() => {
    db.exec(`
      CREATE TABLE user_roles (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN (${USER_ROLES.map((role) => `'${role}'`).join(', ')})),
        PRIMARY KEY (user_id, role)
      );
      INSERT INTO user_roles (user_id, role) SELECT id, role FROM users;
      CREATE INDEX idx_user_roles_role ON user_roles(role, user_id);

      -- Legacy inserts (seeds/CLI) still create one assignment.
      CREATE TRIGGER trg_users_initial_role AFTER INSERT ON users
      BEGIN
        INSERT INTO user_roles (user_id, role) VALUES (NEW.id, NEW.role);
      END;
      -- users.role is only a deterministic compatibility projection.
      CREATE TRIGGER trg_user_roles_insert AFTER INSERT ON user_roles
      BEGIN
        UPDATE users SET role = (${primaryRoleFor('NEW.user_id')}) WHERE id = NEW.user_id;
      END;
      CREATE TRIGGER trg_user_roles_delete AFTER DELETE ON user_roles
      WHEN EXISTS (SELECT 1 FROM user_roles WHERE user_id = OLD.user_id)
      BEGIN
        UPDATE users SET role = (${primaryRoleFor('OLD.user_id')})
        WHERE id = OLD.user_id;
      END;
      CREATE TRIGGER trg_user_roles_immutable BEFORE UPDATE ON user_roles
      BEGIN SELECT RAISE(ABORT, 'Replace role assignments instead of updating them'); END;
      CREATE TRIGGER trg_users_role_projection BEFORE UPDATE OF role ON users
      WHEN NEW.role != (${primaryRoleFor('NEW.id')})
      BEGIN SELECT RAISE(ABORT, 'users.role is a projection; write user_roles'); END;
    `);
  })();
}

function runMigrations() {
  ensureAppSettingsSchema();
  ensureAuditLogSchema();
  ensureSaleItemCostAuditSchema();
  ensureCashClosingSchema();
  ensureLibrarySchema();
  ensureBrothersSchema();
  ensureProductImageSchema();
  addColumnIfMissing('users', 'username', 'TEXT');
  addColumnIfMissing('users', 'active', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('users', 'password_must_change', 'INTEGER NOT NULL DEFAULT 0');
  fillMissingUsernames();
  ensureUserRoleSchema();
  addColumnIfMissing('users', 'login_failed_attempts', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('users', 'login_locked_until', 'TEXT');
  addColumnIfMissing('products', 'expiration_date', 'TEXT');
  addColumnIfMissing('products', 'is_donation', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('products', 'image_url', 'TEXT');
  addColumnIfMissing('products', 'visible_in_pos', 'INTEGER NOT NULL DEFAULT 1');
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
  ensureSaleItemCostAuditSchema();
  addColumnIfMissing('inventory_movements', 'expiration_date', 'TEXT');
  addColumnIfMissing('inventory_movements', 'batch_id', 'INTEGER REFERENCES stock_batches(id)');
  repairLegacyUserForeignKeys();
  ensureMultipleUserRolesSchema();
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
  runMigrations();
  // A role/FK migration can intentionally drop compatibility views and triggers.
  // Reapply the idempotent schema after the final migration pass.
  runSchema();
  ensureBrazilTimestampTriggers();
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
