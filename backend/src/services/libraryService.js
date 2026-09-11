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
  const bytes = crypto.randomBytes(5);
  return `LS-${Array.from(bytes).map((byte) => alphabet[byte % alphabet.length]).join('')}`;
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

function listPublicProducts({ q = '', categoryId = '', includeUnavailable = false, baseUrl = '' } = {}) {
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

  const products = attachImages(db.prepare(`
    SELECT p.*, c.name AS category
    FROM library_products p
    LEFT JOIN library_categories c ON c.id = p.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY c.name COLLATE NOCASE ASC, p.name COLLATE NOCASE ASC
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
  if (status === 'low') where.push('p.stock_quantity <= p.min_stock');
  if (status === 'inactive') where.push('p.active = 0');
  if (status !== 'inactive') where.push('p.active = 1');

  return attachImages(db.prepare(`
    SELECT
      p.*,
      c.name AS category,
      CASE
        WHEN p.stock_quantity <= 0 THEN 'empty'
        WHEN p.stock_quantity <= p.min_stock THEN 'low'
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
    user_id: row.user_id,
    user_name: row.user_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function listSellers({ includeInactive = true } = {}) {
  const where = includeInactive ? '' : 'WHERE s.active = 1';
  return db.prepare(`
    SELECT s.*, u.name AS user_name
    FROM library_sellers s
    LEFT JOIN users u ON u.id = s.user_id
    ${where}
    ORDER BY s.active DESC, s.eligible DESC, s.display_name COLLATE NOCASE ASC
  `).all().map(sellerDto);
}

function getSeller(id) {
  return sellerDto(db.prepare(`
    SELECT s.*, u.name AS user_name
    FROM library_sellers s
    LEFT JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(id));
}

function saveSeller(payload, id = null) {
  let sellerId = id ? Number(id) : null;
  const current = sellerId ? getSeller(sellerId) : null;
  if (sellerId && !current) throw createHttpError('Vendedor da Livraria nao encontrado.', 404);

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

function selectNextSeller() {
  const sellers = db.prepare(`
    SELECT id, display_name, whatsapp_phone
    FROM library_sellers
    WHERE active = 1 AND eligible = 1
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
      (public_reference, status, assigned_seller_id, assigned_at, customer_note, idempotency_key)
    VALUES (?, 'pending', ?, ${seller ? "datetime('now', '-3 hours')" : 'NULL'}, ?, ?)
  `).run(reference, seller?.id || null, normalizeText(payload.customer_note || payload.customerNote), idempotencyKey).lastInsertRowid;

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
    where.push('r.public_reference LIKE ?');
    params.push(`%${String(q).trim().toUpperCase()}%`);
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
      customer_name: normalizeText(payload.customer_name) || `Atendimento ${request.reference}`,
      notes: normalizeText(payload.notes) || `Pedido assistido ${request.reference}`,
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

function getDashboard() {
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS products_count,
      COALESCE(SUM(stock_quantity), 0) AS units_in_stock,
      COALESCE(SUM(stock_quantity * cost_price), 0) AS inventory_value,
      COALESCE(SUM(CASE WHEN stock_quantity <= min_stock THEN 1 ELSE 0 END), 0) AS low_stock_count,
      COALESCE(SUM(CASE WHEN published = 1 AND active = 1 THEN 1 ELSE 0 END), 0) AS published_count
    FROM library_products
    WHERE active = 1
  `).get();

  const financial = db.prepare(`
    SELECT
      COUNT(*) AS sales_count,
      COALESCE(SUM(total), 0) AS revenue,
      COALESCE(SUM(total_cost), 0) AS cost,
      COALESCE(SUM(gross_profit), 0) AS gross_profit
    FROM library_sales
  `).get();

  return {
    products_count: Number(summary.products_count || 0),
    units_in_stock: quantity(summary.units_in_stock),
    inventory_value: money(summary.inventory_value),
    low_stock_count: Number(summary.low_stock_count || 0),
    published_count: Number(summary.published_count || 0),
    sales_count: Number(financial.sales_count || 0),
    revenue: money(financial.revenue),
    cost: money(financial.cost),
    gross_profit: money(financial.gross_profit),
    margin: financial.revenue > 0 ? money((financial.gross_profit / financial.revenue) * 100) : 0
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
  reassignAssistedRequest,
  saveSeller,
  saveProduct,
  updateAssistedRequestItems
};
