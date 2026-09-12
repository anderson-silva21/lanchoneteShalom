const crypto = require('crypto');
const { db } = require('../db');

const money = (value) => Number(Number(value || 0).toFixed(2));
const quantity = (value) => Number(Number(value || 0).toFixed(3));

function createHttpError(message, status, details) {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
}

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeCustomerName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) {
    throw createHttpError('Informe o nome do cliente.', 400);
  }
  return name;
}

function normalizeSku(value, fallbackName = 'PRODUTO') {
  const normalized = String(value || fallbackName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 18);
  return normalized || 'PRODUTO';
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw createHttpError('Informe um WhatsApp valido com DDI e DDD.', 400);
  }
  return digits;
}

function randomReference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  while (suffix.length < 5) {
    suffix += alphabet[crypto.randomInt(alphabet.length)];
  }
  return `LS-${suffix}`;
}

function generatePublicReference() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const reference = randomReference();
    const existing = db.prepare('SELECT id FROM library_assisted_requests WHERE public_reference = ?').get(reference);
    if (!existing) return reference;
  }
  throw createHttpError('Nao foi possivel gerar uma referencia publica.', 500);
}

function formatCurrency(value) {
  return `R$ ${money(value).toFixed(2).replace('.', ',')}`;
}

function generateSku(name) {
  const prefix = normalizeSku(name).slice(0, 8).padEnd(3, 'X');
  const rows = db.prepare('SELECT sku FROM library_products WHERE sku LIKE ?').all(`${prefix}-%`);
  const nextNumber = rows.reduce((max, row) => {
    const match = String(row.sku || '').match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `${prefix}-${String(nextNumber).padStart(3, '0')}`;
}

function normalizeImageList(images = []) {
  return images
    .map((image, index) => ({
      url: normalizeText(typeof image === 'string' ? image : image.url),
      alt_text: normalizeText(typeof image === 'string' ? null : image.alt_text),
      position: Number.isInteger(Number(image.position)) ? Number(image.position) : index
    }))
    .filter((image) => image.url);
}

function getCategory(categoryId) {
  if (!categoryId) return null;
  const category = db.prepare('SELECT * FROM library_categories WHERE id = ? AND active = 1').get(categoryId);
  if (!category) throw createHttpError('Categoria da Livraria nao encontrada.', 404);
  return category;
}

function listCategories({ includeInactive = false } = {}) {
  return db.prepare(`
    SELECT
      c.id,
      c.name,
      c.description,
      c.active,
      c.created_at,
      COUNT(p.id) AS products_count
    FROM library_categories c
    LEFT JOIN library_products p ON p.category_id = c.id AND p.active = 1
    ${includeInactive ? '' : 'WHERE c.active = 1'}
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE ASC
  `).all().map((category) => ({
    ...category,
    active: Boolean(category.active),
    products_count: Number(category.products_count || 0)
  }));
}

function createCategory(payload) {
  const name = String(payload.name || '').trim();
  if (name.length < 2) throw createHttpError('Informe uma categoria valida.', 400);

  const result = db.prepare(`
    INSERT INTO library_categories (name, description, active)
    VALUES (?, ?, ?)
  `).run(name, normalizeText(payload.description), payload.active === false ? 0 : 1);

  return db.prepare('SELECT * FROM library_categories WHERE id = ?').get(result.lastInsertRowid);
}

function replaceImages(productId, images = []) {
  db.prepare('DELETE FROM library_product_images WHERE product_id = ?').run(productId);
  const insert = db.prepare(`
    INSERT INTO library_product_images (product_id, url, alt_text, position)
    VALUES (?, ?, ?, ?)
  `);
  normalizeImageList(images).forEach((image) => {
    insert.run(productId, image.url, image.alt_text, image.position);
  });
}

function attachImages(products) {
  const rows = Array.isArray(products) ? products : [products];
  if (!rows.length) return products;
  const ids = rows.map((product) => product.id);
  const placeholders = ids.map(() => '?').join(', ');
  const imagesByProduct = {};
  db.prepare(`
    SELECT id, product_id, url, alt_text, position
    FROM library_product_images
    WHERE product_id IN (${placeholders})
    ORDER BY position ASC, id ASC
  `).all(...ids).forEach((image) => {
    if (!imagesByProduct[image.product_id]) imagesByProduct[image.product_id] = [];
    imagesByProduct[image.product_id].push(image);
  });

  const mapped = rows.map((product) => ({
    ...product,
    active: Boolean(product.active),
    published: Boolean(product.published),
    price: money(product.price),
    cost_price: money(product.cost_price),
    stock_quantity: quantity(product.stock_quantity),
    min_stock: quantity(product.min_stock),
    images: imagesByProduct[product.id] || []
  }));

  return Array.isArray(products) ? mapped : mapped[0];
}

function publicProduct(row, baseUrl = '') {
  const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/livraria/produto/${row.id}` : null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    sku: row.sku,
    price: money(row.price),
    available: quantity(row.stock_quantity) > 0,
    stock_status: quantity(row.stock_quantity) > 0 ? 'available' : 'unavailable',
    images: row.images.map((image) => ({
      url: image.url,
      alt_text: image.alt_text || row.name
    })),
    url
  };
}

function listPublicProducts({ q = '', categoryId = '', includeUnavailable = false, baseUrl = '', sort = '' } = {}) {
  const where = ['p.active = 1', 'p.published = 1'];
  const params = [];

  if (!includeUnavailable) where.push('p.stock_quantity > 0');
  if (q) {
    where.push('(p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (categoryId) {
    where.push('p.category_id = ?');
    params.push(Number(categoryId));
  }

  const sortClause = {
    price_asc: 'p.price ASC, c.name COLLATE NOCASE ASC, p.name COLLATE NOCASE ASC',
    price_desc: 'p.price DESC, c.name COLLATE NOCASE ASC, p.name COLLATE NOCASE ASC'
  }[sort] || 'c.name COLLATE NOCASE ASC, p.name COLLATE NOCASE ASC';

  const products = attachImages(db.prepare(`
    SELECT p.*, c.name AS category
    FROM library_products p
    LEFT JOIN library_categories c ON c.id = p.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${sortClause}
  `).all(...params));

  return products.map((product) => publicProduct(product, baseUrl));
}

function getPublicProduct(id, baseUrl = '') {
  const product = attachImages(db.prepare(`
    SELECT p.*, c.name AS category
    FROM library_products p
    LEFT JOIN library_categories c ON c.id = p.category_id
    WHERE p.id = ? AND p.active = 1 AND p.published = 1
  `).get(id));

  if (!product) return null;
  return publicProduct(product, baseUrl);
}

function listProducts({ q = '', categoryId = '', status = '' } = {}) {
  const where = [];
  const params = [];

  if (q) {
    where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (categoryId) {
    where.push('p.category_id = ?');
    params.push(Number(categoryId));
  }
  if (status === 'published') where.push('p.published = 1');
  if (status === 'draft') where.push('p.published = 0');
  if (status === 'inactive') where.push('p.active = 0');
  if (status !== 'inactive') where.push('p.active = 1');

  return attachImages(db.prepare(`
    SELECT
      p.*,
      c.name AS category,
      CASE
        WHEN p.stock_quantity <= 0 THEN 'empty'
        ELSE 'ok'
      END AS stock_status
    FROM library_products p
    LEFT JOIN library_categories c ON c.id = p.category_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.active DESC, c.name COLLATE NOCASE ASC, p.name COLLATE NOCASE ASC
  `).all(...params));
}

const saveProductTransaction = db.transaction((payload, id = null) => {
  const categoryId = payload.category_id || payload.categoryId || null;
  if (categoryId) getCategory(categoryId);

  const product = {
    name: String(payload.name || '').trim(),
    description: normalizeText(payload.description),
    category_id: categoryId,
    sku: normalizeSku(payload.sku || (id ? null : generateSku(payload.name))),
    price: money(payload.price),
    cost_price: money(payload.cost_price),
    stock_quantity: id ? undefined : quantity(payload.stock_quantity),
    min_stock: quantity(payload.min_stock),
    active: payload.active === false || payload.active === 0 ? 0 : 1,
    published: payload.published === true || payload.published === 1 ? 1 : 0
  };

  if (product.name.length < 2) throw createHttpError('Informe o nome do produto.', 400);
  if (!product.sku || product.sku.length < 2) throw createHttpError('Informe um SKU valido.', 400);
  if (!Number.isFinite(product.price) || !Number.isFinite(product.cost_price)) {
    throw createHttpError('Preco ou custo invalido.', 400);
  }

  let productId = id ? Number(id) : null;
  if (productId) {
    const current = db.prepare('SELECT * FROM library_products WHERE id = ?').get(productId);
    if (!current) throw createHttpError('Produto da Livraria nao encontrado.', 404);
    db.prepare(`
      UPDATE library_products
      SET name = @name,
          description = @description,
          category_id = @category_id,
          sku = @sku,
          price = @price,
          cost_price = @cost_price,
          min_stock = @min_stock,
          active = @active,
          published = @published
      WHERE id = @id
    `).run({ ...product, id: productId });
  } else {
    productId = db.prepare(`
      INSERT INTO library_products
        (name, description, category_id, sku, price, cost_price, stock_quantity, min_stock, active, published)
      VALUES
        (@name, @description, @category_id, @sku, @price, @cost_price, @stock_quantity, @min_stock, @active, @published)
    `).run(product).lastInsertRowid;

    if (product.stock_quantity > 0) {
      insertMovement({
        productId,
        movementType: 'replenishment',
        quantityChange: product.stock_quantity,
        quantityBefore: 0,
        quantityAfter: product.stock_quantity,
        referenceType: 'product_creation',
        reason: 'Estoque inicial da Livraria',
        userId: payload.user_id || null
      });
    }
  }

  replaceImages(productId, payload.images || []);
  return productId;
});

function saveProduct(payload, id = null) {
  const productId = saveProductTransaction(payload, id);
  return attachImages(db.prepare(`
    SELECT p.*, c.name AS category
    FROM library_products p
    LEFT JOIN library_categories c ON c.id = p.category_id
    WHERE p.id = ?
  `).get(productId));
}

function getProduct(id) {
  const product = attachImages(db.prepare(`
    SELECT p.*, c.name AS category
    FROM library_products p
    LEFT JOIN library_categories c ON c.id = p.category_id
    WHERE p.id = ?
  `).get(id));
  if (!product) throw createHttpError('Produto da Livraria nao encontrado.', 404);
  return product;
}

function insertMovement({
  productId,
  movementType,
  quantityChange,
  quantityBefore,
  quantityAfter,
  referenceType = 'manual',
  referenceId = null,
  reason = null,
  userId = null
}) {
  return db.prepare(`
    INSERT INTO library_inventory_movements
      (product_id, type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, reason, created_by)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    productId,
    movementType,
    quantity(quantityChange),
    quantity(quantityBefore),
    quantity(quantityAfter),
    referenceType,
    referenceId,
    reason,
    userId
  ).lastInsertRowid;
}

function adjustStock({ productId, type = 'adjustment', quantityChange, reason, userId = null }) {
  const delta = quantity(quantityChange);
  if (!Number.isFinite(delta) || delta === 0) throw createHttpError('Informe uma quantidade de ajuste valida.', 400);
  if (!String(reason || '').trim()) throw createHttpError('Informe o motivo do ajuste.', 400);

  const transaction = db.transaction(() => {
    const product = db.prepare('SELECT * FROM library_products WHERE id = ? AND active = 1').get(productId);
    if (!product) throw createHttpError('Produto da Livraria nao encontrado.', 404);

    const before = quantity(product.stock_quantity);
    const after = quantity(before + delta);
    if (after < 0) throw createHttpError(`${product.name} nao possui estoque suficiente.`, 400);

    db.prepare('UPDATE library_products SET stock_quantity = ? WHERE id = ?').run(after, product.id);
    const movementId = insertMovement({
      productId: product.id,
      movementType: type === 'replenishment' ? 'replenishment' : 'adjustment',
      quantityChange: delta,
      quantityBefore: before,
      quantityAfter: after,
      reason,
      userId
    });

    return movementId;
  });

  const movementId = transaction();
  return getMovement(movementId);
}

function getMovement(id) {
  return db.prepare(`
    SELECT m.*, p.name AS product_name, p.sku, u.name AS created_by_name
    FROM library_inventory_movements m
    JOIN library_products p ON p.id = m.product_id
    LEFT JOIN users u ON u.id = m.created_by
    WHERE m.id = ?
  `).get(id);
}

function listMovements({ limit = 200 } = {}) {
  return db.prepare(`
    SELECT m.*, p.name AS product_name, p.sku, u.name AS created_by_name
    FROM library_inventory_movements m
    JOIN library_products p ON p.id = m.product_id
    LEFT JOIN users u ON u.id = m.created_by
    ORDER BY datetime(m.created_at) DESC, m.id DESC
    LIMIT ?
  `).all(Math.min(Math.max(Number(limit) || 200, 1), 500));
}

function sellerDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    display_name: row.display_name,
    whatsapp_phone: row.whatsapp_phone,
    active: Boolean(row.active),
    eligible: Boolean(row.eligible),
    archived: Boolean(row.archived_at),
    archived_at: row.archived_at || null,
    operational_history_count: Number(row.operational_history_count || 0),
    active_assignments_count: Number(row.active_assignments_count || 0),
    user_id: row.user_id,
    user_name: row.user_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function listSellers({ includeInactive = true, visibility = 'active' } = {}) {
  const where = [];
  if (visibility === 'archived') where.push('s.archived_at IS NOT NULL');
  else if (visibility === 'all') {
    // ADMIN audit view: include archived and inactive sellers.
  } else {
    where.push('s.archived_at IS NULL');
    if (!includeInactive || visibility === 'active') where.push('s.active = 1');
  }
  return db.prepare(`
    SELECT
      s.*,
      u.name AS user_name,
      (
        SELECT COUNT(*)
        FROM library_assisted_requests r
        WHERE r.assigned_seller_id = s.id
      ) + (
        SELECT COUNT(*)
        FROM library_sales sale
        WHERE sale.seller_id = s.id
      ) + (
        SELECT COUNT(*)
        FROM library_assignment_history h
        WHERE h.previous_seller_id = s.id OR h.new_seller_id = s.id
      ) AS operational_history_count,
      (
        SELECT COUNT(*)
        FROM library_assisted_requests active_request
        WHERE active_request.assigned_seller_id = s.id
          AND active_request.status IN ('pending', 'in_progress')
      ) AS active_assignments_count
    FROM library_sellers s
    LEFT JOIN users u ON u.id = s.user_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY
      CASE WHEN s.archived_at IS NULL THEN 0 ELSE 1 END,
      s.active DESC,
      s.eligible DESC,
      s.display_name COLLATE NOCASE ASC
  `).all().map(sellerDto);
}

function getSeller(id) {
  return sellerDto(db.prepare(`
    SELECT
      s.*,
      u.name AS user_name,
      (
        SELECT COUNT(*)
        FROM library_assisted_requests r
        WHERE r.assigned_seller_id = s.id
      ) + (
        SELECT COUNT(*)
        FROM library_sales sale
        WHERE sale.seller_id = s.id
      ) + (
        SELECT COUNT(*)
        FROM library_assignment_history h
        WHERE h.previous_seller_id = s.id OR h.new_seller_id = s.id
      ) AS operational_history_count,
      (
        SELECT COUNT(*)
        FROM library_assisted_requests active_request
        WHERE active_request.assigned_seller_id = s.id
          AND active_request.status IN ('pending', 'in_progress')
      ) AS active_assignments_count
    FROM library_sellers s
    LEFT JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(id));
}

function saveSeller(payload, id = null) {
  let sellerId = id ? Number(id) : null;
  const current = sellerId ? getSeller(sellerId) : null;
  if (sellerId && !current) throw createHttpError('Vendedor da Livraria nao encontrado.', 404);
  if (current?.archived) throw createHttpError('Vendedor arquivado nao pode ser editado.', 400);

  const seller = {
    display_name: String(payload.display_name ?? payload.displayName ?? current?.display_name ?? '').trim(),
    whatsapp_phone: normalizePhone(payload.whatsapp_phone ?? payload.whatsappPhone ?? current?.whatsapp_phone),
    active: payload.active === undefined ? (current?.active === false ? 0 : 1) : (payload.active === false || payload.active === 0 ? 0 : 1),
    eligible: payload.eligible === undefined ? (current?.eligible === false ? 0 : 1) : (payload.eligible === false || payload.eligible === 0 ? 0 : 1),
    user_id: payload.user_id ?? payload.userId ?? current?.user_id ?? null
  };
  if (seller.display_name.length < 2) throw createHttpError('Informe o nome do vendedor.', 400);

  if (seller.user_id) {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(seller.user_id);
    if (!user) throw createHttpError('Usuario associado nao encontrado.', 404);
  }

  if (sellerId) {
    db.prepare(`
      UPDATE library_sellers
      SET display_name = @display_name,
          whatsapp_phone = @whatsapp_phone,
          active = @active,
          eligible = @eligible,
          user_id = @user_id
      WHERE id = @id
    `).run({ ...seller, id: sellerId });
  } else {
    sellerId = db.prepare(`
      INSERT INTO library_sellers (display_name, whatsapp_phone, active, eligible, user_id)
      VALUES (@display_name, @whatsapp_phone, @active, @eligible, @user_id)
    `).run(seller).lastInsertRowid;
  }
  return getSeller(sellerId);
}

function getSellerRemovalImpact(id) {
  const sellerId = Number(id);
  if (!Number.isInteger(sellerId) || sellerId <= 0) throw createHttpError('Vendedor da Livraria invalido.', 400);
  const seller = getSeller(sellerId);
  if (!seller) throw createHttpError('Vendedor da Livraria nao encontrado.', 404);

  const requests = db.prepare('SELECT COUNT(*) AS total FROM library_assisted_requests WHERE assigned_seller_id = ?').get(sellerId).total;
  const activeRequests = db.prepare(`
    SELECT COUNT(*) AS total
    FROM library_assisted_requests
    WHERE assigned_seller_id = ?
      AND status IN ('pending', 'in_progress')
  `).get(sellerId).total;
  const sales = db.prepare('SELECT COUNT(*) AS total FROM library_sales WHERE seller_id = ?').get(sellerId).total;
  const assignmentHistory = db.prepare(`
    SELECT COUNT(*) AS total
    FROM library_assignment_history
    WHERE previous_seller_id = ? OR new_seller_id = ?
  `).get(sellerId, sellerId).total;

  const history_count = Number(requests || 0) + Number(sales || 0) + Number(assignmentHistory || 0);
  return {
    seller,
    history_count,
    active_assignments_count: Number(activeRequests || 0),
    has_history: history_count > 0
  };
}

const removeSellerTransaction = db.transaction((id) => {
  const impact = getSellerRemovalImpact(id);

  if (!impact.has_history) {
    db.prepare('UPDATE library_round_robin_state SET last_seller_id = NULL WHERE last_seller_id = ?').run(impact.seller.id);
    db.prepare('DELETE FROM library_sellers WHERE id = ?').run(impact.seller.id);
    return {
      mode: 'deleted',
      seller: impact.seller,
      history_count: impact.history_count,
      active_assignments_count: impact.active_assignments_count
    };
  }

  db.prepare(`
    UPDATE library_sellers
    SET active = 0,
        eligible = 0,
        archived_at = COALESCE(archived_at, datetime('now', '-3 hours'))
    WHERE id = ?
  `).run(impact.seller.id);

  return {
    mode: 'archived',
    seller: getSeller(impact.seller.id),
    history_count: impact.history_count,
    active_assignments_count: impact.active_assignments_count
  };
});

function removeSeller(id) {
  return removeSellerTransaction(id);
}

function selectNextSeller() {
  const sellers = db.prepare(`
    SELECT id, display_name, whatsapp_phone
    FROM library_sellers
    WHERE active = 1 AND eligible = 1 AND archived_at IS NULL
    ORDER BY id ASC
  `).all();
  if (!sellers.length) return null;

  db.prepare(`
    INSERT INTO library_round_robin_state (id, last_seller_id)
    VALUES (1, NULL)
    ON CONFLICT(id) DO NOTHING
  `).run();

  const state = db.prepare('SELECT last_seller_id FROM library_round_robin_state WHERE id = 1').get();
  const currentIndex = sellers.findIndex((seller) => Number(seller.id) === Number(state?.last_seller_id));
  const nextSeller = sellers[(currentIndex + 1) % sellers.length];
  db.prepare(`
    UPDATE library_round_robin_state
    SET last_seller_id = ?, updated_at = datetime('now', '-3 hours')
    WHERE id = 1
  `).run(nextSeller.id);
  return nextSeller;
}

function loadRequestItems(requestIds = []) {
  const ids = requestIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return {};
  const placeholders = ids.map(() => '?').join(', ');
  const itemsByRequest = {};
  db.prepare(`
    SELECT i.*, p.price AS current_price, p.stock_quantity, p.active, p.published
    FROM library_assisted_request_items i
    LEFT JOIN library_products p ON p.id = i.product_id
    WHERE i.request_id IN (${placeholders})
    ORDER BY i.id ASC
  `).all(...ids).forEach((item) => {
    const mapped = {
      id: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      sku: item.sku,
      requested_quantity: quantity(item.requested_quantity),
      unit_price_snapshot: money(item.unit_price_snapshot),
      current_price: money(item.current_price),
      stock_quantity: quantity(item.stock_quantity),
      active: Boolean(item.active),
      published: Boolean(item.published),
      line_total_snapshot: money(item.unit_price_snapshot * item.requested_quantity),
      line_total_current: money((item.current_price || 0) * item.requested_quantity),
      price_changed: money(item.current_price) !== money(item.unit_price_snapshot),
      stock_available: quantity(item.stock_quantity) >= quantity(item.requested_quantity)
    };
    if (!itemsByRequest[item.request_id]) itemsByRequest[item.request_id] = [];
    itemsByRequest[item.request_id].push(mapped);
  });
  return itemsByRequest;
}

function requestDto(row, { publicSafe = false } = {}) {
  if (!row) return null;
  const items = loadRequestItems([row.id])[row.id] || [];
  const estimatedTotal = items.reduce((sum, item) => sum + item.line_total_snapshot, 0);
  const currentTotal = items.reduce((sum, item) => sum + item.line_total_current, 0);
  const seller = row.assigned_seller_id ? {
    id: publicSafe ? undefined : row.assigned_seller_id,
    display_name: row.assigned_seller_name,
    whatsapp_phone: publicSafe ? undefined : row.assigned_seller_phone
  } : null;
  const base = {
    reference: row.public_reference,
    status: row.status,
    assigned_at: row.assigned_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    cancelled_at: row.cancelled_at,
    seller: seller ? Object.fromEntries(Object.entries(seller).filter(([, value]) => value !== undefined)) : null,
    items: items.map((item) => publicSafe ? {
      product_id: item.product_id,
      product_name: item.product_name,
      sku: item.sku,
      requested_quantity: item.requested_quantity,
      unit_price_snapshot: item.unit_price_snapshot,
      line_total_snapshot: item.line_total_snapshot
    } : item),
    estimated_total: money(estimatedTotal),
    current_total: money(currentTotal),
    has_availability_changes: items.some((item) => item.price_changed || !item.stock_available || !item.active)
  };
  if (!publicSafe) {
    base.id = row.id;
    base.assigned_seller_id = row.assigned_seller_id;
    base.sale_id = row.sale_id;
    base.customer_name = row.customer_name;
    base.customer_contact = row.customer_contact;
    base.customer_note = row.customer_note;
  }
  return base;
}

function findRequestByReference(reference) {
  return db.prepare(`
    SELECT r.*, s.display_name AS assigned_seller_name, s.whatsapp_phone AS assigned_seller_phone
    FROM library_assisted_requests r
    LEFT JOIN library_sellers s ON s.id = r.assigned_seller_id
    WHERE r.public_reference = ?
  `).get(String(reference || '').trim().toUpperCase());
}

function buildRequestWhatsAppUrl(request) {
  const phone = request?.seller?.whatsapp_phone || request?.assigned_seller_phone || '';
  const configuredPhone = String(phone).replace(/\D/g, '');
  if (!configuredPhone) return null;
  const items = (request.items || []).map((item) => `- ${item.product_name} x${decimalQuantity(item.requested_quantity)}`);
  const message = [
    'Ola! Montei um carrinho na Livraria Shalom e gostaria de continuar o atendimento.',
    '',
    `Codigo: ${request.reference || request.public_reference}`,
    request.customer_name ? `Cliente: ${request.customer_name}` : '',
    request.customer_contact ? `Contato: ${request.customer_contact}` : '',
    '',
    'Itens:',
    ...items,
    '',
    `Total estimado: ${formatCurrency(request.estimated_total)}`,
    '',
    'Poderia me ajudar?'
  ].join('\n');
  return `https://wa.me/${configuredPhone}?text=${encodeURIComponent(message)}`;
}

function decimalQuantity(value) {
  const rounded = quantity(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

const createAssistedRequestTransaction = db.transaction((payload = {}) => {
  const idempotencyKey = normalizeText(payload.idempotency_key || payload.idempotencyKey);
  if (idempotencyKey) {
    const existing = db.prepare('SELECT public_reference FROM library_assisted_requests WHERE idempotency_key = ?').get(idempotencyKey);
    if (existing) return existing.public_reference;
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw createHttpError('Inclua ao menos um item no carrinho.', 400);
  const customerName = normalizeCustomerName(payload.customer_name || payload.customerName);
  const customerContact = normalizePhone(payload.customer_contact || payload.customerContact);

  const normalizedItems = items.map((item) => ({
    product_id: Number(item.product_id || item.productId),
    quantity: quantity(item.quantity || 1)
  }));
  if (normalizedItems.some((item) => !Number.isInteger(item.product_id) || item.product_id <= 0 || item.quantity <= 0)) {
    throw createHttpError('Carrinho contem item invalido.', 400);
  }

  const seller = selectNextSeller();
  const reference = generatePublicReference();
  const requestId = db.prepare(`
    INSERT INTO library_assisted_requests
      (public_reference, status, assigned_seller_id, assigned_at, customer_name, customer_contact, customer_note, idempotency_key)
    VALUES (?, 'pending', ?, ${seller ? "datetime('now', '-3 hours')" : 'NULL'}, ?, ?, ?, ?)
  `).run(reference, seller?.id || null, customerName, customerContact, normalizeText(payload.customer_note || payload.customerNote), idempotencyKey).lastInsertRowid;

  const insertItem = db.prepare(`
    INSERT INTO library_assisted_request_items
      (request_id, product_id, product_name, sku, requested_quantity, unit_price_snapshot)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  normalizedItems.forEach((item) => {
    const product = db.prepare(`
      SELECT *
      FROM library_products
      WHERE id = ? AND active = 1 AND published = 1
    `).get(item.product_id);
    if (!product) throw createHttpError('Produto indisponivel no catalogo publico.', 400);
    insertItem.run(requestId, product.id, product.name, product.sku, item.quantity, product.price);
  });

  if (seller) {
    db.prepare(`
      INSERT INTO library_assignment_history (request_id, previous_seller_id, new_seller_id, reason, changed_by)
      VALUES (?, NULL, ?, 'round_robin', NULL)
    `).run(requestId, seller.id);
  }

  return reference;
});

function createAssistedRequest(payload = {}) {
  const reference = createAssistedRequestTransaction(payload);
  const internalRequest = requestDto(findRequestByReference(reference));
  const publicRequest = requestDto(findRequestByReference(reference), { publicSafe: true });
  publicRequest.whatsapp_url = internalRequest?.seller ? buildRequestWhatsAppUrl(internalRequest) : null;
  return publicRequest;
}

function getPublicAssistedRequest(reference) {
  const internalRequest = requestDto(findRequestByReference(reference));
  if (!internalRequest) return null;
  const publicRequest = requestDto(findRequestByReference(reference), { publicSafe: true });
  publicRequest.whatsapp_url = internalRequest.seller ? buildRequestWhatsAppUrl(internalRequest) : null;
  return publicRequest;
}

function listAssistedRequests({ status = '', sellerId = '', q = '', limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (status) {
    where.push('r.status = ?');
    params.push(status);
  }
  if (sellerId) {
    where.push('r.assigned_seller_id = ?');
    params.push(Number(sellerId));
  }
  if (q) {
    where.push('(r.public_reference LIKE ? OR r.customer_name LIKE ? OR r.customer_contact LIKE ?)');
    const term = String(q).trim();
    params.push(`%${term.toUpperCase()}%`, `%${term}%`, `%${term.replace(/\D/g, '')}%`);
  }
  const rows = db.prepare(`
    SELECT r.*, s.display_name AS assigned_seller_name, s.whatsapp_phone AS assigned_seller_phone
    FROM library_assisted_requests r
    LEFT JOIN library_sellers s ON s.id = r.assigned_seller_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY datetime(r.created_at) DESC, r.id DESC
    LIMIT ?
  `).all(...params, Math.min(Math.max(Number(limit) || 100, 1), 300));
  return rows.map((row) => requestDto(row));
}

function getAssistedRequest(reference) {
  const request = requestDto(findRequestByReference(reference));
  if (!request) throw createHttpError('Carrinho assistido nao encontrado.', 404);
  request.assignment_history = db.prepare(`
    SELECT h.*, prev.display_name AS previous_seller_name, next.display_name AS new_seller_name, u.name AS changed_by_name
    FROM library_assignment_history h
    LEFT JOIN library_sellers prev ON prev.id = h.previous_seller_id
    LEFT JOIN library_sellers next ON next.id = h.new_seller_id
    LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.request_id = ?
    ORDER BY datetime(h.created_at) DESC, h.id DESC
  `).all(request.id);
  return request;
}

function updateAssistedRequestItems(reference, items = []) {
  const request = getAssistedRequest(reference);
  if (!['pending', 'in_progress'].includes(request.status)) {
    throw createHttpError('Este carrinho nao pode mais ser alterado.', 400);
  }
  if (!Array.isArray(items) || !items.length) throw createHttpError('Inclua ao menos um item.', 400);

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM library_assisted_request_items WHERE request_id = ?').run(request.id);
    const insert = db.prepare(`
      INSERT INTO library_assisted_request_items
        (request_id, product_id, product_name, sku, requested_quantity, unit_price_snapshot)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    items.forEach((item) => {
      const productId = Number(item.product_id || item.productId);
      const itemQuantity = quantity(item.quantity || item.requested_quantity || 1);
      if (!Number.isInteger(productId) || productId <= 0 || itemQuantity <= 0) {
        throw createHttpError('Item invalido.', 400);
      }
      const product = db.prepare('SELECT * FROM library_products WHERE id = ? AND active = 1').get(productId);
      if (!product) throw createHttpError('Produto da Livraria nao encontrado.', 404);
      insert.run(request.id, product.id, product.name, product.sku, itemQuantity, product.price);
    });
    db.prepare("UPDATE library_assisted_requests SET status = 'in_progress' WHERE id = ? AND status = 'pending'").run(request.id);
  });
  transaction();
  return getAssistedRequest(reference);
}

function cancelAssistedRequest(reference) {
  const request = getAssistedRequest(reference);
  if (request.status === 'completed') throw createHttpError('Carrinho ja convertido em venda.', 400);
  db.prepare(`
    UPDATE library_assisted_requests
    SET status = 'cancelled', cancelled_at = datetime('now', '-3 hours')
    WHERE id = ? AND status != 'cancelled'
  `).run(request.id);
  return getAssistedRequest(reference);
}

function reassignAssistedRequest(reference, sellerId, userId, reason = 'manual_reassignment') {
  const request = getAssistedRequest(reference);
  if (!['pending', 'in_progress'].includes(request.status)) {
    throw createHttpError('Somente carrinhos pendentes ou em atendimento podem ser reatribuídos.', 400);
  }
  const seller = db.prepare('SELECT * FROM library_sellers WHERE id = ? AND active = 1').get(Number(sellerId));
  if (!seller) throw createHttpError('Vendedor ativo nao encontrado.', 404);

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE library_assisted_requests
      SET assigned_seller_id = ?, assigned_at = datetime('now', '-3 hours'), status = 'in_progress'
      WHERE id = ?
    `).run(seller.id, request.id);
    db.prepare(`
      INSERT INTO library_assignment_history (request_id, previous_seller_id, new_seller_id, reason, changed_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(request.id, request.assigned_seller_id || null, seller.id, normalizeText(reason), userId || null);
  });
  transaction();
  return getAssistedRequest(reference);
}

function listSaleItemsBySaleIds(saleIds = []) {
  const ids = saleIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return {};

  const placeholders = ids.map(() => '?').join(', ');
  const itemsBySale = {};
  db.prepare(`
    SELECT *
    FROM library_sale_items
    WHERE sale_id IN (${placeholders})
    ORDER BY sale_id ASC, id ASC
  `).all(...ids).forEach((item) => {
    if (!itemsBySale[item.sale_id]) itemsBySale[item.sale_id] = [];
    itemsBySale[item.sale_id].push({
      ...item,
      quantity: quantity(item.quantity),
      unit_price: money(item.unit_price),
      unit_cost: money(item.unit_cost),
      line_total: money(item.line_total),
      line_profit: money(item.line_profit)
    });
  });
  return itemsBySale;
}

function getSaleById(id) {
  const sale = db.prepare(`
    SELECT s.*, u.name AS sold_by_name, ls.display_name AS seller_name
    FROM library_sales s
    LEFT JOIN users u ON u.id = s.sold_by
    LEFT JOIN library_sellers ls ON ls.id = s.seller_id
    WHERE s.id = ?
  `).get(id);
  if (!sale) return null;
  sale.total = money(sale.total);
  sale.total_cost = money(sale.total_cost);
  sale.gross_profit = money(sale.gross_profit);
  sale.items = listSaleItemsBySaleIds([sale.id])[sale.id] || [];
  return sale;
}

const createSaleTransaction = db.transaction((payload, user) => {
  const idempotencyKey = normalizeText(payload.idempotency_key || payload.idempotencyKey);
  if (idempotencyKey) {
    const existing = db.prepare('SELECT id FROM library_sales WHERE idempotency_key = ?').get(idempotencyKey);
    if (existing) return existing.id;
  }

  const items = payload.items || [];
  if (!items.length) throw createHttpError('Inclua ao menos um item na venda da Livraria.', 400);

  const saleId = db.prepare(`
    INSERT INTO library_sales (payment_method, customer_name, notes, idempotency_key, assisted_request_id, seller_id, sold_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(payload.payment_method || 'manual').trim() || 'manual',
    normalizeText(payload.customer_name),
    normalizeText(payload.notes),
    idempotencyKey,
    payload.assisted_request_id || payload.assistedRequestId || null,
    payload.seller_id || payload.sellerId || null,
    user?.id || null
  ).lastInsertRowid;

  const insertItem = db.prepare(`
    INSERT INTO library_sale_items
      (sale_id, product_id, item_name, sku, quantity, unit_price, unit_cost, line_total, line_profit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let total = 0;
  let totalCost = 0;

  items.forEach((item) => {
    const productId = Number(item.product_id || item.productId);
    const itemQuantity = quantity(item.quantity || 1);
    if (!Number.isInteger(productId) || productId <= 0 || itemQuantity <= 0) {
      throw createHttpError('Item de venda invalido.', 400);
    }

    const product = db.prepare('SELECT * FROM library_products WHERE id = ? AND active = 1').get(productId);
    if (!product) throw createHttpError('Produto da Livraria nao encontrado.', 404);
    if (quantity(product.stock_quantity) < itemQuantity) {
      throw createHttpError(`${product.name} nao possui estoque suficiente.`, 400);
    }

    const before = quantity(product.stock_quantity);
    const after = quantity(before - itemQuantity);
    db.prepare('UPDATE library_products SET stock_quantity = ? WHERE id = ?').run(after, product.id);
    insertMovement({
      productId: product.id,
      movementType: 'sale',
      quantityChange: -itemQuantity,
      quantityBefore: before,
      quantityAfter: after,
      referenceType: 'library_sale',
      referenceId: saleId,
      reason: `Venda Livraria #${saleId}`,
      userId: user?.id || null
    });

    const lineTotal = money(product.price * itemQuantity);
    const lineCost = money(product.cost_price * itemQuantity);
    insertItem.run(
      saleId,
      product.id,
      product.name,
      product.sku,
      itemQuantity,
      product.price,
      product.cost_price,
      lineTotal,
      money(lineTotal - lineCost)
    );
    total += lineTotal;
    totalCost += lineCost;
  });

  db.prepare('UPDATE library_sales SET total = ?, total_cost = ?, gross_profit = ? WHERE id = ?')
    .run(money(total), money(totalCost), money(total - totalCost), saleId);
  return saleId;
});

function createSale(payload, user) {
  return getSaleById(createSaleTransaction(payload, user));
}

function listSales({ limit = 100 } = {}) {
  const sales = db.prepare(`
    SELECT s.*, u.name AS sold_by_name, ls.display_name AS seller_name
    FROM library_sales s
    LEFT JOIN users u ON u.id = s.sold_by
    LEFT JOIN library_sellers ls ON ls.id = s.seller_id
    ORDER BY datetime(s.created_at) DESC, s.id DESC
    LIMIT ?
  `).all(Math.min(Math.max(Number(limit) || 100, 1), 500)).map((sale) => ({
    ...sale,
    total: money(sale.total),
    total_cost: money(sale.total_cost),
    gross_profit: money(sale.gross_profit)
  }));
  const itemsBySale = listSaleItemsBySaleIds(sales.map((sale) => sale.id));
  return sales.map((sale) => ({ ...sale, items: itemsBySale[sale.id] || [] }));
}

function convertAssistedRequest(reference, payload = {}, user) {
  const transaction = db.transaction(() => {
    const request = getAssistedRequest(reference);
    if (request.status === 'completed' && request.sale_id) return request.sale_id;
    if (['cancelled', 'expired'].includes(request.status)) {
      throw createHttpError('Este carrinho nao pode ser convertido em venda.', 400);
    }
    if (!request.items.length) throw createHttpError('Carrinho sem itens.', 400);

    const saleId = createSaleTransaction({
      payment_method: payload.payment_method || 'manual',
      customer_name: normalizeText(payload.customer_name) || request.customer_name || `Atendimento ${request.reference}`,
      notes: normalizeText(payload.notes) || [`Pedido assistido ${request.reference}`, request.customer_contact ? `Contato: ${request.customer_contact}` : ''].filter(Boolean).join(' - '),
      idempotency_key: `library-assisted-${request.reference}`,
      assisted_request_id: request.id,
      seller_id: request.assigned_seller_id || null,
      items: request.items.map((item) => ({
        product_id: item.product_id,
        quantity: item.requested_quantity
      }))
    }, user);

    db.prepare(`
      UPDATE library_assisted_requests
      SET status = 'completed',
          sale_id = ?,
          completed_at = datetime('now', '-3 hours')
      WHERE id = ?
    `).run(saleId, request.id);

    return saleId;
  });

  return getSaleById(transaction());
}

function getSellerMonitoring() {
  const rows = db.prepare(`
    SELECT
      s.id,
      s.display_name,
      s.active,
      s.eligible,
      COALESCE(SUM(CASE WHEN date(r.assigned_at) = date('now', '-3 hours') THEN 1 ELSE 0 END), 0) AS assigned_today,
      COALESCE(SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN r.status = 'in_progress' THEN 1 ELSE 0 END), 0) AS in_progress,
      COALESCE(SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
      COALESCE(SUM(CASE WHEN r.status IN ('cancelled', 'expired') THEN 1 ELSE 0 END), 0) AS cancelled
    FROM library_sellers s
    LEFT JOIN library_assisted_requests r ON r.assigned_seller_id = s.id
    GROUP BY s.id
    ORDER BY s.active DESC, s.eligible DESC, s.display_name COLLATE NOCASE ASC
  `).all();
  const unassigned = db.prepare(`
    SELECT COUNT(*) AS total
    FROM library_assisted_requests
    WHERE assigned_seller_id IS NULL AND status IN ('pending', 'in_progress')
  `).get();
  return {
    sellers: rows.map((row) => ({
      ...row,
      active: Boolean(row.active),
      eligible: Boolean(row.eligible),
      assigned_today: Number(row.assigned_today || 0),
      pending: Number(row.pending || 0),
      in_progress: Number(row.in_progress || 0),
      completed: Number(row.completed || 0),
      cancelled: Number(row.cancelled || 0)
    })),
    unassigned_pending: Number(unassigned.total || 0)
  };
}

function normalizeDateOnly(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function dateRangeClause(alias = 's', { startDate, endDate } = {}) {
  const where = [];
  const params = {};
  if (startDate) {
    where.push(`date(${alias}.created_at) >= date(@startDate)`);
    params.startDate = startDate;
  }
  if (endDate) {
    where.push(`date(${alias}.created_at) <= date(@endDate)`);
    params.endDate = endDate;
  }
  return { where, params };
}

function calculatePreviousRange({ startDate, endDate } = {}) {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const days = Math.round((end - start) / 86400000) + 1;
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);
  return {
    startDate: previousStart.toISOString().slice(0, 10),
    endDate: previousEnd.toISOString().slice(0, 10)
  };
}

function percentChange(current, previous) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue) || previousValue === 0) return null;
  return money(((currentValue - previousValue) / previousValue) * 100);
}

function financialSummary(range = {}) {
  const { where, params } = dateRangeClause('s', range);
  const row = db.prepare(`
    SELECT
      COUNT(DISTINCT s.id) AS sales_count,
      COALESCE(SUM(i.quantity), 0) AS items_sold,
      COALESCE(SUM(i.line_total), 0) AS revenue,
      COALESCE(SUM(i.quantity * i.unit_cost), 0) AS cost,
      COALESCE(SUM(i.line_profit), 0) AS gross_profit
    FROM library_sales s
    LEFT JOIN library_sale_items i ON i.sale_id = s.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
  `).get(params);
  const revenue = money(row.revenue);
  const grossProfit = money(row.gross_profit);
  const salesCount = Number(row.sales_count || 0);
  return {
    sales_count: salesCount,
    items_sold: quantity(row.items_sold),
    revenue,
    cost: money(row.cost),
    gross_profit: grossProfit,
    margin: revenue > 0 ? money((grossProfit / revenue) * 100) : 0,
    average_ticket: salesCount > 0 ? money(revenue / salesCount) : 0
  };
}

function getPeriodGranularity({ startDate, endDate } = {}) {
  if (!startDate || !endDate || startDate === endDate) return 'hour';
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  if (days > 92) return 'month';
  return 'day';
}

function listFinancialSeries(range = {}) {
  const granularity = getPeriodGranularity(range);
  const bucket = granularity === 'month'
    ? "strftime('%Y-%m', s.created_at)"
    : granularity === 'hour'
      ? "strftime('%H:00', s.created_at)"
      : "date(s.created_at)";
  const { where, params } = dateRangeClause('s', range);
  return db.prepare(`
    SELECT
      ${bucket} AS label,
      COALESCE(SUM(i.line_total), 0) AS revenue,
      COALESCE(SUM(i.quantity * i.unit_cost), 0) AS cost,
      COALESCE(SUM(i.line_profit), 0) AS profit
    FROM library_sales s
    JOIN library_sale_items i ON i.sale_id = s.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY label
    ORDER BY MIN(datetime(s.created_at)) ASC
  `).all(params).map((row) => ({
    label: row.label,
    revenue: money(row.revenue),
    cost: money(row.cost),
    profit: money(row.profit)
  }));
}

function listProductPerformance(range = {}) {
  const { where, params } = dateRangeClause('s', range);
  return db.prepare(`
    SELECT
      i.product_id,
      i.item_name AS product_name,
      COALESCE(c.name, 'Sem categoria') AS category,
      COALESCE(SUM(i.quantity), 0) AS quantity_sold,
      COALESCE(SUM(i.line_total), 0) AS revenue,
      COALESCE(SUM(i.line_profit), 0) AS profit
    FROM library_sale_items i
    JOIN library_sales s ON s.id = i.sale_id
    LEFT JOIN library_products p ON p.id = i.product_id
    LEFT JOIN library_categories c ON c.id = p.category_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY i.product_id, i.item_name, c.name
  `).all(params).map((row) => ({
    product_id: row.product_id,
    product_name: row.product_name,
    category: row.category,
    quantity_sold: quantity(row.quantity_sold),
    revenue: money(row.revenue),
    profit: money(row.profit)
  }));
}

function listSellerPerformance(range = {}) {
  const { where, params } = dateRangeClause('s', range);
  return db.prepare(`
    SELECT
      COALESCE(ls.id, 0) AS seller_id,
      COALESCE(ls.display_name, u.name, 'Sem vendedor') AS seller_name,
      COUNT(DISTINCT s.id) AS sales_count,
      COALESCE(SUM(i.quantity), 0) AS items_sold,
      COALESCE(SUM(i.line_total), 0) AS revenue,
      COALESCE(SUM(i.line_profit), 0) AS profit
    FROM library_sales s
    LEFT JOIN library_sale_items i ON i.sale_id = s.id
    LEFT JOIN library_sellers ls ON ls.id = s.seller_id
    LEFT JOIN users u ON u.id = s.sold_by
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY seller_id, seller_name
    ORDER BY revenue DESC, sales_count DESC
  `).all(params).map((row) => {
    const salesCount = Number(row.sales_count || 0);
    const revenue = money(row.revenue);
    return {
      seller_id: row.seller_id || null,
      seller_name: row.seller_name,
      sales_count: salesCount,
      items_sold: quantity(row.items_sold),
      revenue,
      profit: money(row.profit),
      average_ticket: salesCount > 0 ? money(revenue / salesCount) : 0
    };
  });
}

function buildInventorySummary() {
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS products_count,
      COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) AS active_products_count,
      COALESCE(SUM(CASE WHEN published = 1 AND active = 1 THEN 1 ELSE 0 END), 0) AS published_count,
      COALESCE(SUM(CASE WHEN active = 1 THEN stock_quantity ELSE 0 END), 0) AS units_in_stock,
      COALESCE(SUM(CASE WHEN active = 1 THEN stock_quantity * cost_price ELSE 0 END), 0) AS inventory_value,
      COALESCE(SUM(CASE WHEN active = 1 THEN stock_quantity * price ELSE 0 END), 0) AS inventory_sale_value,
      COALESCE(SUM(CASE WHEN active = 1 AND stock_quantity <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_count
    FROM library_products
  `).get();
  const slow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM library_products p
    WHERE p.active = 1
      AND NOT EXISTS (
        SELECT 1
        FROM library_sale_items i
        JOIN library_sales s ON s.id = i.sale_id
        WHERE i.product_id = p.id
          AND date(s.created_at) >= date('now', '-3 hours', '-90 days')
      )
  `).get();
  const costValue = money(summary.inventory_value);
  const saleValue = money(summary.inventory_sale_value);
  return {
    products_count: Number(summary.products_count || 0),
    active_products_count: Number(summary.active_products_count || 0),
    published_count: Number(summary.published_count || 0),
    units_in_stock: quantity(summary.units_in_stock),
    inventory_value: costValue,
    inventory_sale_value: saleValue,
    potential_profit: money(saleValue - costValue),
    out_of_stock_count: Number(summary.out_of_stock_count || 0),
    no_movement_count: Number(slow.total || 0)
  };
}

function getDashboard({ startDate, endDate } = {}) {
  const range = {
    startDate: normalizeDateOnly(startDate),
    endDate: normalizeDateOnly(endDate)
  };
  const inventory = buildInventorySummary();
  const financial = financialSummary(range);
  const previousRange = calculatePreviousRange(range);
  const previous = previousRange ? financialSummary(previousRange) : null;
  const products = listProductPerformance(range);
  const byQuantity = [...products].sort((a, b) => b.quantity_sold - a.quantity_sold).slice(0, 8);
  const byRevenue = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const byProfit = [...products].sort((a, b) => b.profit - a.profit).slice(0, 8);
  const stockExtremes = db.prepare(`
    SELECT id, name, stock_quantity, price, cost_price
    FROM library_products
    WHERE active = 1
    ORDER BY stock_quantity ASC, name COLLATE NOCASE ASC
  `).all().map((row) => ({
    id: row.id,
    name: row.name,
    stock_quantity: quantity(row.stock_quantity),
    price: money(row.price),
    cost_price: money(row.cost_price)
  }));
  const productsWithoutSales = db.prepare(`
    SELECT p.id, p.name, COALESCE(c.name, 'Sem categoria') AS category, p.stock_quantity
    FROM library_products p
    LEFT JOIN library_categories c ON c.id = p.category_id
    WHERE p.active = 1
      AND NOT EXISTS (
        SELECT 1
        FROM library_sale_items i
        JOIN library_sales s ON s.id = i.sale_id
        WHERE i.product_id = p.id
          ${range.startDate ? "AND date(s.created_at) >= date(@startDate)" : ''}
          ${range.endDate ? "AND date(s.created_at) <= date(@endDate)" : ''}
      )
    ORDER BY p.name COLLATE NOCASE ASC
    LIMIT 8
  `).all(range).map((row) => ({ ...row, stock_quantity: quantity(row.stock_quantity) }));

  return {
    period: range,
    previous_period: previousRange,
    ...inventory,
    ...financial,
    previous,
    comparisons: previous ? {
      revenue: percentChange(financial.revenue, previous.revenue),
      gross_profit: percentChange(financial.gross_profit, previous.gross_profit),
      sales_count: percentChange(financial.sales_count, previous.sales_count),
      average_ticket: percentChange(financial.average_ticket, previous.average_ticket),
      items_sold: percentChange(financial.items_sold, previous.items_sold)
    } : {},
    series: listFinancialSeries(range),
    top_products: byQuantity,
    top_revenue_products: byRevenue,
    top_profit_products: byProfit,
    best_selling_product: byQuantity[0] || null,
    highest_revenue_product: byRevenue[0] || null,
    highest_profit_product: byProfit[0] || null,
    lowest_stock_product: stockExtremes[0] || null,
    highest_stock_product: stockExtremes[stockExtremes.length - 1] || null,
    products_without_sales: productsWithoutSales,
    seller_performance: listSellerPerformance(range)
  };
}

function normalizeSpreadsheetParams(params = {}) {
  const page = Math.max(Number(params.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(params.page_size || params.pageSize || 50), 1), 200);
  const sort = [
    'data_hora',
    'produto',
    'quantidade',
    'receita',
    'custo',
    'lucro',
    'margem'
  ].includes(params.sort) ? params.sort : 'data_hora';
  const order = String(params.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return {
    page,
    pageSize,
    sort,
    order,
    q: String(params.q || '').trim(),
    startDate: normalizeDateOnly(params.start_date || params.startDate),
    endDate: normalizeDateOnly(params.end_date || params.endDate),
    productId: params.product_id || params.productId ? Number(params.product_id || params.productId) : null,
    categoryId: params.category_id || params.categoryId ? Number(params.category_id || params.categoryId) : null,
    sellerId: params.seller_id || params.sellerId ? Number(params.seller_id || params.sellerId) : null,
    paymentMethod: String(params.payment_method || params.paymentMethod || '').trim(),
    status: String(params.status || '').trim()
  };
}

function buildSpreadsheetWhere(filters = {}) {
  const where = [];
  const params = {};
  if (filters.startDate) {
    where.push('date(s.created_at) >= date(@startDate)');
    params.startDate = filters.startDate;
  }
  if (filters.endDate) {
    where.push('date(s.created_at) <= date(@endDate)');
    params.endDate = filters.endDate;
  }
  if (filters.productId) {
    where.push('i.product_id = @productId');
    params.productId = filters.productId;
  }
  if (filters.categoryId) {
    where.push('p.category_id = @categoryId');
    params.categoryId = filters.categoryId;
  }
  if (filters.sellerId) {
    where.push('s.seller_id = @sellerId');
    params.sellerId = filters.sellerId;
  }
  if (filters.paymentMethod) {
    where.push('s.payment_method = @paymentMethod');
    params.paymentMethod = filters.paymentMethod;
  }
  if (filters.status && !['completed', 'concluida', 'concluida'].includes(filters.status)) {
    where.push('1 = 0');
  }
  if (filters.q) {
    where.push("(i.item_name LIKE @q OR CAST(s.id AS TEXT) LIKE @q OR COALESCE(ls.display_name, u.name, '') LIKE @q)");
    params.q = `%${filters.q}%`;
  }
  return { where, params };
}

function spreadsheetSelect() {
  return `
    SELECT
      i.id,
      s.created_at AS data_hora,
      date(s.created_at) AS data,
      time(s.created_at) AS hora,
      s.id AS venda_id,
      i.product_id,
      i.item_name AS produto,
      COALESCE(c.name, 'Sem categoria') AS categoria,
      i.quantity AS quantidade,
      i.unit_price AS preco_unitario,
      i.line_total AS valor_bruto,
      0 AS desconto,
      i.line_total AS valor_liquido,
      i.unit_cost AS custo_unitario,
      i.quantity * i.unit_cost AS custo_total,
      i.line_profit AS lucro,
      CASE WHEN i.line_total > 0 THEN (i.line_profit / i.line_total) * 100 ELSE 0 END AS margem,
      s.payment_method AS forma_pagamento,
      COALESCE(ls.display_name, u.name, 'Sem vendedor') AS vendedor,
      'completed' AS status
    FROM library_sale_items i
    JOIN library_sales s ON s.id = i.sale_id
    LEFT JOIN library_products p ON p.id = i.product_id
    LEFT JOIN library_categories c ON c.id = p.category_id
    LEFT JOIN library_sellers ls ON ls.id = s.seller_id
    LEFT JOIN users u ON u.id = s.sold_by
  `;
}

function mapSpreadsheetRow(row) {
  return {
    ...row,
    quantidade: quantity(row.quantidade),
    preco_unitario: money(row.preco_unitario),
    valor_bruto: money(row.valor_bruto),
    desconto: money(row.desconto),
    valor_liquido: money(row.valor_liquido),
    custo_unitario: money(row.custo_unitario),
    custo_total: money(row.custo_total),
    lucro: money(row.lucro),
    margem: money(row.margem)
  };
}

function getLibrarySpreadsheet(params = {}) {
  const filters = normalizeSpreadsheetParams(params);
  const { where, params: queryParams } = buildSpreadsheetWhere(filters);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortMap = {
    data_hora: 'datetime(data_hora)',
    produto: 'produto COLLATE NOCASE',
    quantidade: 'quantidade',
    receita: 'valor_liquido',
    custo: 'custo_total',
    lucro: 'lucro',
    margem: 'margem'
  };
  const orderBy = `${sortMap[filters.sort]} ${filters.order}, venda_id DESC, id DESC`;
  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM (${spreadsheetSelect()} ${whereSql}) report_rows
  `).get(queryParams).total;
  const rows = db.prepare(`
    SELECT *
    FROM (${spreadsheetSelect()} ${whereSql}) report_rows
    ORDER BY ${orderBy}
    LIMIT @limit OFFSET @offset
  `).all({ ...queryParams, limit: filters.pageSize, offset: (filters.page - 1) * filters.pageSize }).map(mapSpreadsheetRow);
  const allRows = db.prepare(`
    SELECT *
    FROM (${spreadsheetSelect()} ${whereSql}) report_rows
  `).all(queryParams).map(mapSpreadsheetRow);
  return {
    rows,
    summary: summarizeSpreadsheetRows(allRows),
    pagination: {
      page: filters.page,
      page_size: filters.pageSize,
      total: Number(total || 0),
      total_pages: Math.max(Math.ceil(Number(total || 0) / filters.pageSize), 1)
    }
  };
}

function normalizeStockSpreadsheetParams(params = {}) {
  const page = Math.max(Number(params.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(params.page_size || params.pageSize || 50), 1), 200);
  const sort = [
    'produto',
    'categoria',
    'quantidade',
    'custo_unitario',
    'valor_estoque',
    'preco_venda',
    'valor_potencial',
    'lucro_potencial',
    'ultima_movimentacao'
  ].includes(params.sort) ? params.sort : 'produto';
  const order = String(params.order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  return {
    page,
    pageSize,
    sort,
    order,
    q: String(params.q || '').trim(),
    categoryId: params.category_id || params.categoryId ? Number(params.category_id || params.categoryId) : null,
    active: String(params.active || '').trim(),
    published: String(params.published || '').trim(),
    stock: String(params.stock || '').trim()
  };
}

function buildStockSpreadsheetWhere(filters = {}) {
  const where = [];
  const params = {};
  if (filters.q) {
    where.push('(p.name LIKE @q OR p.sku LIKE @q)');
    params.q = `%${filters.q}%`;
  }
  if (filters.categoryId) {
    where.push('p.category_id = @categoryId');
    params.categoryId = filters.categoryId;
  }
  if (filters.active === 'active') where.push('p.active = 1');
  if (filters.active === 'inactive') where.push('p.active = 0');
  if (filters.published === 'published') where.push('p.published = 1');
  if (filters.published === 'draft') where.push('p.published = 0');
  if (filters.stock === 'in_stock') where.push('p.stock_quantity > 0');
  if (filters.stock === 'out_of_stock') where.push('p.stock_quantity <= 0');
  return { where, params };
}

function stockSpreadsheetSelect() {
  return `
    SELECT
      p.id,
      p.name AS produto,
      p.sku,
      COALESCE(c.name, 'Sem categoria') AS categoria,
      CASE WHEN p.active = 1 THEN 'Ativo' ELSE 'Inativo' END AS status,
      CASE WHEN p.published = 1 THEN 'Publicado' ELSE 'Nao publicado' END AS publicado,
      p.stock_quantity AS quantidade,
      p.cost_price AS custo_unitario,
      p.stock_quantity * p.cost_price AS valor_estoque,
      p.price AS preco_venda,
      p.stock_quantity * p.price AS valor_potencial,
      (p.stock_quantity * p.price) - (p.stock_quantity * p.cost_price) AS lucro_potencial,
      (
        SELECT MAX(m.created_at)
        FROM library_inventory_movements m
        WHERE m.product_id = p.id
      ) AS ultima_movimentacao,
      p.created_at AS cadastrado_em
    FROM library_products p
    LEFT JOIN library_categories c ON c.id = p.category_id
  `;
}

function mapStockSpreadsheetRow(row) {
  return {
    ...row,
    quantidade: quantity(row.quantidade),
    custo_unitario: money(row.custo_unitario),
    valor_estoque: money(row.valor_estoque),
    preco_venda: money(row.preco_venda),
    valor_potencial: money(row.valor_potencial),
    lucro_potencial: money(row.lucro_potencial)
  };
}

function summarizeStockRows(rows = []) {
  const activeRows = rows.filter((row) => row.status !== 'Inativo');
  const stockValue = money(activeRows.reduce((sum, row) => sum + Number(row.valor_estoque || 0), 0));
  const potentialValue = money(activeRows.reduce((sum, row) => sum + Number(row.valor_potencial || 0), 0));
  return {
    products_count: activeRows.length,
    units_in_stock: quantity(activeRows.reduce((sum, row) => sum + Number(row.quantidade || 0), 0)),
    inventory_value: stockValue,
    inventory_sale_value: potentialValue,
    potential_profit: money(potentialValue - stockValue)
  };
}

function getLibraryStockSpreadsheet(params = {}) {
  const filters = normalizeStockSpreadsheetParams(params);
  const { where, params: queryParams } = buildStockSpreadsheetWhere(filters);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortMap = {
    produto: 'produto COLLATE NOCASE',
    categoria: 'categoria COLLATE NOCASE',
    quantidade: 'quantidade',
    custo_unitario: 'custo_unitario',
    valor_estoque: 'valor_estoque',
    preco_venda: 'preco_venda',
    valor_potencial: 'valor_potencial',
    lucro_potencial: 'lucro_potencial',
    ultima_movimentacao: 'datetime(ultima_movimentacao)'
  };
  const orderBy = `${sortMap[filters.sort]} ${filters.order}, produto COLLATE NOCASE ASC, id ASC`;
  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM (${stockSpreadsheetSelect()} ${whereSql}) stock_rows
  `).get(queryParams).total;
  const rows = db.prepare(`
    SELECT *
    FROM (${stockSpreadsheetSelect()} ${whereSql}) stock_rows
    ORDER BY ${orderBy}
    LIMIT @limit OFFSET @offset
  `).all({ ...queryParams, limit: filters.pageSize, offset: (filters.page - 1) * filters.pageSize }).map(mapStockSpreadsheetRow);
  const allRows = db.prepare(`
    SELECT *
    FROM (${stockSpreadsheetSelect()} ${whereSql}) stock_rows
  `).all(queryParams).map(mapStockSpreadsheetRow);
  return {
    rows,
    summary: summarizeStockRows(allRows),
    pagination: {
      page: filters.page,
      page_size: filters.pageSize,
      total: Number(total || 0),
      total_pages: Math.max(Math.ceil(Number(total || 0) / filters.pageSize), 1)
    }
  };
}

function listLibraryStockSpreadsheetRows(params = {}) {
  const filters = normalizeStockSpreadsheetParams({ ...params, page: 1, page_size: 100000 });
  const { where, params: queryParams } = buildStockSpreadsheetWhere(filters);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db.prepare(`
    SELECT *
    FROM (${stockSpreadsheetSelect()} ${whereSql}) stock_rows
    ORDER BY produto COLLATE NOCASE ASC, id ASC
  `).all(queryParams).map(mapStockSpreadsheetRow);
}

function getLibraryStockExportData(params = {}) {
  const rows = listLibraryStockSpreadsheetRows(params);
  return {
    rows,
    summary: summarizeStockRows(rows)
  };
}

function listLibrarySpreadsheetRows(params = {}) {
  const filters = normalizeSpreadsheetParams({ ...params, page: 1, page_size: 100000 });
  const { where, params: queryParams } = buildSpreadsheetWhere(filters);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db.prepare(`
    SELECT *
    FROM (${spreadsheetSelect()} ${whereSql}) report_rows
    ORDER BY datetime(data_hora) DESC, venda_id DESC, id DESC
  `).all(queryParams).map(mapSpreadsheetRow);
}

function summarizeSpreadsheetRows(rows = []) {
  const saleIds = new Set(rows.map((row) => row.venda_id));
  const revenue = money(rows.reduce((sum, row) => sum + Number(row.valor_liquido || 0), 0));
  const cost = money(rows.reduce((sum, row) => sum + Number(row.custo_total || 0), 0));
  const profit = money(rows.reduce((sum, row) => sum + Number(row.lucro || 0), 0));
  const salesCount = saleIds.size;
  return {
    revenue,
    cost,
    gross_profit: profit,
    margin: revenue > 0 ? money((profit / revenue) * 100) : 0,
    sales_count: salesCount,
    items_sold: quantity(rows.reduce((sum, row) => sum + Number(row.quantidade || 0), 0)),
    average_ticket: salesCount > 0 ? money(revenue / salesCount) : 0
  };
}

function getLibrarySpreadsheetOptions() {
  return {
    products: db.prepare('SELECT id, name FROM library_products WHERE active = 1 ORDER BY name COLLATE NOCASE ASC').all(),
    categories: db.prepare('SELECT id, name FROM library_categories WHERE active = 1 ORDER BY name COLLATE NOCASE ASC').all(),
    sellers: db.prepare('SELECT id, display_name FROM library_sellers ORDER BY display_name COLLATE NOCASE ASC').all(),
    payment_methods: db.prepare('SELECT DISTINCT payment_method FROM library_sales ORDER BY payment_method COLLATE NOCASE ASC').all().map((row) => row.payment_method).filter(Boolean),
    statuses: ['completed']
  };
}

function getLibraryExportData(params = {}) {
  const rows = listLibrarySpreadsheetRows(params);
  const summary = summarizeSpreadsheetRows(rows);
  const productRows = rows.reduce((acc, row) => {
    const key = row.product_id;
    if (!acc[key]) acc[key] = { product_id: row.product_id, product_name: row.produto, quantity_sold: 0, revenue: 0, profit: 0 };
    acc[key].quantity_sold += Number(row.quantidade || 0);
    acc[key].revenue += Number(row.valor_liquido || 0);
    acc[key].profit += Number(row.lucro || 0);
    return acc;
  }, {});
  const sellerRows = rows.reduce((acc, row) => {
    const key = row.vendedor || 'Sem vendedor';
    if (!acc[key]) acc[key] = { seller_name: key, sales: new Set(), items_sold: 0, revenue: 0, profit: 0 };
    acc[key].sales.add(row.venda_id);
    acc[key].items_sold += Number(row.quantidade || 0);
    acc[key].revenue += Number(row.valor_liquido || 0);
    acc[key].profit += Number(row.lucro || 0);
    return acc;
  }, {});
  return {
    rows,
    summary,
    top_products: Object.values(productRows)
      .map((row) => ({ ...row, quantity_sold: quantity(row.quantity_sold), revenue: money(row.revenue), profit: money(row.profit) }))
      .sort((a, b) => b.quantity_sold - a.quantity_sold)
      .slice(0, 10),
    top_revenue_products: Object.values(productRows)
      .map((row) => ({ ...row, quantity_sold: quantity(row.quantity_sold), revenue: money(row.revenue), profit: money(row.profit) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    seller_performance: Object.values(sellerRows)
      .map((row) => {
        const salesCount = row.sales.size;
        const revenue = money(row.revenue);
        return {
          seller_name: row.seller_name,
          sales_count: salesCount,
          items_sold: quantity(row.items_sold),
          revenue,
          profit: money(row.profit),
          average_ticket: salesCount > 0 ? money(revenue / salesCount) : 0
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
  };
}

function buildWhatsAppUrl({ product, baseUrl = '', phone = '' }) {
  const configuredPhone = String(phone || '').replace(/\D/g, '');
  if (!configuredPhone) return null;
  const productUrl = product.url || (baseUrl ? `${baseUrl.replace(/\/$/, '')}/livraria/produto/${product.id}` : '');
  const message = [
    `Ola! Tenho interesse no produto ${product.name}.`,
    `Vi na Livraria Shalom por R$ ${money(product.price).toFixed(2).replace('.', ',')}.`,
    productUrl ? `Link: ${productUrl}` : '',
    'Poderia me ajudar?'
  ].filter(Boolean).join(' ');
  return `https://wa.me/${configuredPhone}?text=${encodeURIComponent(message)}`;
}

module.exports = {
  adjustStock,
  buildWhatsAppUrl,
  buildRequestWhatsAppUrl,
  cancelAssistedRequest,
  convertAssistedRequest,
  createCategory,
  createAssistedRequest,
  createSale,
  getAssistedRequest,
  getDashboard,
  getProduct,
  getLibraryExportData,
  getLibrarySpreadsheet,
  getLibrarySpreadsheetOptions,
  getLibraryStockExportData,
  getLibraryStockSpreadsheet,
  getPublicAssistedRequest,
  getPublicProduct,
  getSaleById,
  getSeller,
  getSellerMonitoring,
  listAssistedRequests,
  listCategories,
  listMovements,
  listProducts,
  listPublicProducts,
  listSales,
  listSellers,
  removeSeller,
  reassignAssistedRequest,
  saveSeller,
  saveProduct,
  updateAssistedRequestItems
};
