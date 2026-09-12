const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-library-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');

const errorHandler = require('../src/middleware/errorHandler');
const { signUser } = require('../src/middleware/auth');
const libraryRoutes = require('../src/routes/library');
const { db, initDatabase } = require('../src/db');
const {
  adjustStock,
  buildWhatsAppUrl,
  convertAssistedRequest,
  createAssistedRequest,
  createCategory,
  createSale,
  getAssistedRequest,
  getDashboard,
  getLibrarySpreadsheet,
  getLibraryStockSpreadsheet,
  getPublicAssistedRequest,
  getSellerMonitoring,
  listAssistedRequests,
  listSales,
  listSellers,
  listPublicProducts,
  removeSeller,
  reassignAssistedRequest,
  saveSeller,
  saveProduct
} = require('../src/services/libraryService');

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('catalogo publico exibe somente produtos ativos publicados e nao vaza custo', () => {
  initDatabase();
  const category = createCategory({ name: 'Livros' });
  const visible = saveProduct({
    name: 'Livro da Paz',
    description: 'Formacao para grupos',
    category_id: category.id,
    price: 42.9,
    cost_price: 20,
    stock_quantity: 3,
    min_stock: 1,
    published: true,
    images: [{ url: 'https://example.com/livro.jpg' }]
  });
  saveProduct({
    name: 'Camisa interna',
    category_id: category.id,
    price: 59.9,
    cost_price: 30,
    stock_quantity: 5,
    min_stock: 1,
    published: false
  });

  const products = listPublicProducts({ baseUrl: 'https://shalom.example' });

  assert.equal(products.length, 1);
  assert.equal(products[0].id, visible.id);
  assert.equal(products[0].name, 'Livro da Paz');
  assert.equal(products[0].url, `https://shalom.example/livraria/produto/${visible.id}`);
  assert.equal(Object.hasOwn(products[0], 'cost_price'), false);
  assert.equal(products[0].images[0].url, 'https://example.com/livro.jpg');
});

test('catalogo publico ordena por preco com filtros de busca e categoria', () => {
  const category = createCategory({ name: 'Ordenacao' });
  saveProduct({
    name: 'Livro Ordenacao Medio',
    category_id: category.id,
    sku: 'TEST-SORT-MEDIO',
    price: 30,
    cost_price: 10,
    stock_quantity: 4,
    min_stock: 1,
    published: true
  });
  saveProduct({
    name: 'Livro Ordenacao Barato',
    category_id: category.id,
    sku: 'TEST-SORT-BARATO',
    price: 12,
    cost_price: 4,
    stock_quantity: 4,
    min_stock: 1,
    published: true
  });
  saveProduct({
    name: 'Livro Ordenacao Caro',
    category_id: category.id,
    sku: 'TEST-SORT-CARO',
    price: 80,
    cost_price: 30,
    stock_quantity: 4,
    min_stock: 1,
    published: true
  });

  const ascending = listPublicProducts({ q: 'Ordenacao', categoryId: category.id, sort: 'price_asc' });
  const descending = listPublicProducts({ q: 'Ordenacao', categoryId: category.id, sort: 'price_desc' });

  assert.deepEqual(ascending.map((product) => product.price), [12, 30, 80]);
  assert.deepEqual(descending.map((product) => product.price), [80, 30, 12]);
});

test('ajustes e venda da Livraria atualizam estoque de forma transacional', () => {
  const category = createCategory({ name: 'Acessorios' });
  const product = saveProduct({
    name: 'Terco missionario',
    category_id: category.id,
    price: 25,
    cost_price: 10,
    stock_quantity: 1,
    min_stock: 1,
    published: true
  });

  const movement = adjustStock({
    productId: product.id,
    type: 'replenishment',
    quantityChange: 4,
    reason: 'Reposicao semanal',
    userId: 1
  });
  assert.equal(movement.quantity_after, 5);

  assert.throws(() => createSale({
    items: [{ product_id: product.id, quantity: 8 }],
    idempotency_key: 'too-much-stock'
  }, { id: 1 }), (error) => {
    assert.match(error.message, /estoque suficiente/);
    assert.equal(error.status, 400);
    return true;
  });
  assert.equal(db.prepare('SELECT stock_quantity FROM library_products WHERE id = ?').get(product.id).stock_quantity, 5);

  const sale = createSale({
    customer_name: 'Maria',
    payment_method: 'pix',
    idempotency_key: 'sale-unique-001',
    items: [{ product_id: product.id, quantity: 2 }]
  }, { id: 1 });

  assert.equal(sale.total, 50);
  assert.equal(sale.total_cost, 20);
  assert.equal(sale.gross_profit, 30);
  assert.equal(db.prepare('SELECT stock_quantity FROM library_products WHERE id = ?').get(product.id).stock_quantity, 3);

  const duplicate = createSale({
    idempotency_key: 'sale-unique-001',
    items: [{ product_id: product.id, quantity: 2 }]
  }, { id: 1 });
  assert.equal(duplicate.id, sale.id);
  assert.equal(db.prepare('SELECT stock_quantity FROM library_products WHERE id = ?').get(product.id).stock_quantity, 3);
});

test('carrinho assistido cria referencia publica, nao baixa estoque e usa round-robin persistido', () => {
  const category = createCategory({ name: 'Round Robin' });
  const product = saveProduct({
    name: 'Livro Round Robin',
    category_id: category.id,
    price: 30,
    cost_price: 12,
    stock_quantity: 10,
    min_stock: 1,
    published: true
  });
  const sellerA = saveSeller({ display_name: 'Seller A', whatsapp_phone: '5581999000001' });
  const sellerB = saveSeller({ display_name: 'Seller B', whatsapp_phone: '5581999000002' });

  const first = createAssistedRequest({
    idempotency_key: 'cart-round-001',
    customer_name: 'Cliente Round',
    customer_contact: '5581999880001',
    items: [{ product_id: product.id, quantity: 1 }]
  });
  const duplicate = createAssistedRequest({
    idempotency_key: 'cart-round-001',
    customer_name: 'Cliente Round',
    customer_contact: '5581999880001',
    items: [{ product_id: product.id, quantity: 1 }]
  });
  const second = createAssistedRequest({
    idempotency_key: 'cart-round-002',
    customer_name: 'Cliente Round Dois',
    customer_contact: '5581999880002',
    items: [{ product_id: product.id, quantity: 1 }]
  });
  const third = createAssistedRequest({
    idempotency_key: 'cart-round-003',
    customer_name: 'Cliente Round Tres',
    customer_contact: '5581999880003',
    items: [{ product_id: product.id, quantity: 1 }]
  });

  assert.match(first.reference, /^LS-[A-Z2-9]{5}$/);
  assert.equal(first.reference, duplicate.reference);
  assert.equal(first.seller.display_name, sellerA.display_name);
  assert.equal(second.seller.display_name, sellerB.display_name);
  assert.equal(third.seller.display_name, sellerA.display_name);
  assert.match(decodeURIComponent(first.whatsapp_url.split('text=')[1]), new RegExp(first.reference));
  assert.match(decodeURIComponent(first.whatsapp_url.split('text=')[1]), /Cliente Round/);
  assert.equal(db.prepare('SELECT stock_quantity FROM library_products WHERE id = ?').get(product.id).stock_quantity, 10);
});

test('geracao de referencia publica mantem formato e funciona em criacoes repetidas', () => {
  const category = createCategory({ name: 'Referencia Publica' });
  const product = saveProduct({
    name: 'Livro Referencia Publica',
    category_id: category.id,
    price: 24,
    cost_price: 8,
    stock_quantity: 40,
    min_stock: 1,
    published: true
  });
  saveSeller({ display_name: 'Seller Referencia Publica', whatsapp_phone: '5581999000301', active: true, eligible: true });

  const references = new Set();
  for (let index = 0; index < 20; index += 1) {
    const request = createAssistedRequest({
      idempotency_key: `cart-reference-repeat-${index}`,
      customer_name: `Cliente Referencia ${index}`,
      customer_contact: `55819998803${String(index).padStart(2, '0')}`,
      items: [{ product_id: product.id, quantity: 1 }]
    });
    assert.match(request.reference, /^LS-[A-Z2-9]{5}$/);
    references.add(request.reference);
  }

  assert.equal(references.size, 20);
});

test('carrinho assistido persiste dados do cliente e nao vaza no DTO publico', () => {
  const category = createCategory({ name: 'Cliente Identificado' });
  const product = saveProduct({
    name: 'Livro Cliente Identificado',
    category_id: category.id,
    price: 35,
    cost_price: 15,
    stock_quantity: 5,
    min_stock: 1,
    published: true
  });
  saveSeller({ display_name: 'Seller Cliente', whatsapp_phone: '5581999000101', active: true, eligible: true });

  const created = createAssistedRequest({
    idempotency_key: 'cart-customer-001',
    customer_name: '  Ana   Cliente  ',
    customer_contact: '(81) 99988-7766',
    items: [{ product_id: product.id, quantity: 1 }]
  });
  const adminRequest = getAssistedRequest(created.reference);
  const publicRequest = getPublicAssistedRequest(created.reference);
  const found = listAssistedRequests({ q: '999887766' });

  assert.equal(adminRequest.customer_name, 'Ana Cliente');
  assert.equal(adminRequest.customer_contact, '81999887766');
  assert.equal(found.some((request) => request.reference === created.reference), true);
  assert.equal(Object.hasOwn(publicRequest, 'customer_name'), false);
  assert.equal(Object.hasOwn(publicRequest, 'customer_contact'), false);
});

test('round-robin pula vendedor inativo e preserva carrinho sem vendedor quando nao ha elegiveis', () => {
  const category = createCategory({ name: 'Sem vendedor' });
  const product = saveProduct({
    name: 'Caderno Sem Vendedor',
    category_id: category.id,
    price: 18,
    cost_price: 8,
    stock_quantity: 5,
    min_stock: 1,
    published: true
  });

  db.prepare('UPDATE library_sellers SET active = 0, eligible = 0').run();
  const unassigned = createAssistedRequest({
    idempotency_key: 'cart-unassigned-001',
    customer_name: 'Cliente Sem Vendedor',
    customer_contact: '5581999880004',
    items: [{ product_id: product.id, quantity: 1 }]
  });
  assert.equal(unassigned.seller, null);
  assert.equal(unassigned.whatsapp_url, null);

  const active = saveSeller({ display_name: 'Seller C', whatsapp_phone: '5581999000003', active: true, eligible: true });
  const inactive = saveSeller({ display_name: 'Seller D', whatsapp_phone: '5581999000004', active: false, eligible: true });
  const assigned = createAssistedRequest({
    idempotency_key: 'cart-assigned-001',
    customer_name: 'Cliente Seller C',
    customer_contact: '5581999880005',
    items: [{ product_id: product.id, quantity: 1 }]
  });
  assert.equal(assigned.seller.display_name, active.display_name);
  assert.notEqual(assigned.seller.display_name, inactive.display_name);
});

test('conversao de carrinho assistido reutiliza venda, baixa estoque uma vez e bloqueia duplicidade', () => {
  const category = createCategory({ name: 'Conversao' });
  const product = saveProduct({
    name: 'Terco Conversao',
    category_id: category.id,
    price: 20,
    cost_price: 7,
    stock_quantity: 4,
    min_stock: 1,
    published: true
  });
  saveSeller({ display_name: 'Seller Conversion', whatsapp_phone: '5581999000005', active: true, eligible: true });
  const request = createAssistedRequest({
    idempotency_key: 'cart-convert-001',
    customer_name: 'Cliente Conversao',
    customer_contact: '5581999880006',
    items: [{ product_id: product.id, quantity: 2 }]
  });

  const sale = convertAssistedRequest(request.reference, { payment_method: 'pix' }, { id: 1 });
  const duplicate = convertAssistedRequest(request.reference, { payment_method: 'pix' }, { id: 1 });

  assert.equal(sale.id, duplicate.id);
  assert.equal(sale.customer_name, 'Cliente Conversao');
  assert.match(sale.notes, /5581999880006/);
  assert.equal(sale.total, 40);
  assert.equal(sale.assisted_request_id > 0, true);
  assert.equal(db.prepare('SELECT stock_quantity FROM library_products WHERE id = ?').get(product.id).stock_quantity, 2);
  assert.equal(db.prepare('SELECT status FROM library_assisted_requests WHERE public_reference = ?').get(request.reference).status, 'completed');
});

test('admin pode reatribuir e historico de atribuicao e preservado', () => {
  const category = createCategory({ name: 'Reatribuicao' });
  const product = saveProduct({
    name: 'Imagem Reatribuicao',
    category_id: category.id,
    price: 55,
    cost_price: 22,
    stock_quantity: 3,
    min_stock: 1,
    published: true
  });
  const seller = saveSeller({ display_name: 'Seller Reassign', whatsapp_phone: '5581999000006', active: true, eligible: true });
  const request = createAssistedRequest({
    idempotency_key: 'cart-reassign-001',
    customer_name: 'Cliente Reatribuicao',
    customer_contact: '5581999880007',
    items: [{ product_id: product.id, quantity: 1 }]
  });

  const reassigned = reassignAssistedRequest(request.reference, seller.id, 1, 'Teste');
  const history = db.prepare('SELECT COUNT(*) AS total FROM library_assignment_history WHERE request_id = ?').get(reassigned.id);
  const monitoring = getSellerMonitoring();

  assert.equal(reassigned.assigned_seller_id, seller.id);
  assert.equal(history.total >= 2, true);
  assert.equal(Array.isArray(monitoring.sellers), true);
});

test('remocao apaga vendedor sem historico e limpa referencia da rotacao', () => {
  const seller = saveSeller({ display_name: 'Seller Sem Historico', whatsapp_phone: '5581999000201', active: true, eligible: true });
  db.prepare(`
    INSERT INTO library_round_robin_state (id, last_seller_id)
    VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET last_seller_id = excluded.last_seller_id
  `).run(seller.id);

  const result = removeSeller(seller.id);

  assert.equal(result.mode, 'deleted');
  assert.equal(db.prepare('SELECT id FROM library_sellers WHERE id = ?').get(seller.id), undefined);
  assert.equal(db.prepare('SELECT last_seller_id FROM library_round_robin_state WHERE id = 1').get().last_seller_id, null);
});

test('remocao arquiva vendedor com historico, preserva atribuicoes e remove da rotacao', () => {
  db.prepare('UPDATE library_sellers SET active = 0, eligible = 0 WHERE archived_at IS NULL').run();
  db.prepare('UPDATE library_round_robin_state SET last_seller_id = NULL WHERE id = 1').run();

  const category = createCategory({ name: 'Remocao Historica' });
  const product = saveProduct({
    name: 'Livro Remocao Historica',
    category_id: category.id,
    price: 44,
    cost_price: 16,
    stock_quantity: 8,
    min_stock: 1,
    published: true
  });
  const archivedSeller = saveSeller({ display_name: 'Seller Com Historico', whatsapp_phone: '5581999000202', active: true, eligible: true });
  const activeSeller = saveSeller({ display_name: 'Seller Remocao Ativo', whatsapp_phone: '5581999000203', active: true, eligible: true });
  db.prepare('UPDATE library_sellers SET active = 0, eligible = 0 WHERE id NOT IN (?, ?)').run(archivedSeller.id, activeSeller.id);

  const request = createAssistedRequest({
    idempotency_key: 'cart-remove-history-001',
    customer_name: 'Cliente Historico',
    customer_contact: '5581999880202',
    items: [{ product_id: product.id, quantity: 1 }]
  });
  assert.equal(request.seller.display_name, archivedSeller.display_name);

  const sale = convertAssistedRequest(request.reference, { payment_method: 'pix' }, { id: 1 });
  const result = removeSeller(archivedSeller.id);
  const storedSeller = db.prepare('SELECT active, eligible, archived_at FROM library_sellers WHERE id = ?').get(archivedSeller.id);
  const storedRequest = getAssistedRequest(request.reference);
  const storedSale = listSales({ limit: 20 }).find((item) => Number(item.id) === Number(sale.id));

  assert.equal(result.mode, 'archived');
  assert.equal(storedSeller.active, 0);
  assert.equal(storedSeller.eligible, 0);
  assert.equal(Boolean(storedSeller.archived_at), true);
  assert.equal(storedRequest.seller.display_name, archivedSeller.display_name);
  assert.equal(storedSale.seller_name, archivedSeller.display_name);
  assert.equal(listSellers({ visibility: 'active' }).some((seller) => seller.id === archivedSeller.id), false);
  assert.equal(listSellers({ visibility: 'archived' }).some((seller) => seller.id === archivedSeller.id), true);

  const nextRequest = createAssistedRequest({
    idempotency_key: 'cart-remove-history-002',
    customer_name: 'Cliente Rotacao Pos Arquivo',
    customer_contact: '5581999880203',
    items: [{ product_id: product.id, quantity: 1 }]
  });
  assert.equal(nextRequest.seller.display_name, activeSeller.display_name);
});

test('remocao com atendimento ativo arquiva vendedor e mantem carrinho atribuido', () => {
  db.prepare('UPDATE library_sellers SET active = 0, eligible = 0 WHERE archived_at IS NULL').run();
  db.prepare('UPDATE library_round_robin_state SET last_seller_id = NULL WHERE id = 1').run();

  const category = createCategory({ name: 'Remocao Ativa' });
  const product = saveProduct({
    name: 'Terco Remocao Ativa',
    category_id: category.id,
    price: 28,
    cost_price: 9,
    stock_quantity: 4,
    min_stock: 1,
    published: true
  });
  const seller = saveSeller({ display_name: 'Seller Atendimento Ativo', whatsapp_phone: '5581999000204', active: true, eligible: true });
  const request = createAssistedRequest({
    idempotency_key: 'cart-remove-active-001',
    customer_name: 'Cliente Ativo',
    customer_contact: '5581999880204',
    items: [{ product_id: product.id, quantity: 1 }]
  });

  const result = removeSeller(seller.id);
  const storedRequest = getAssistedRequest(request.reference);

  assert.equal(result.mode, 'archived');
  assert.equal(result.active_assignments_count, 1);
  assert.equal(storedRequest.status, 'pending');
  assert.equal(storedRequest.assigned_seller_id, seller.id);
  assert.equal(storedRequest.seller.display_name, seller.display_name);
});

test('perfil nao autorizado nao remove vendedor pela API', async () => {
  initDatabase();
  const seller = saveSeller({ display_name: 'Seller Protegido API', whatsapp_phone: '5581999000205', active: true, eligible: true });
  const userId = db.prepare(`
    INSERT INTO users (name, username, email, password_hash, role)
    VALUES ('Financeiro Teste', 'finance-delete-test', 'finance-delete-test@example.local', 'x', 'finance')
  `).run().lastInsertRowid;
  const token = signUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
  const app = express();
  app.use(express.json());
  app.use('/api/library', libraryRoutes);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');

  try {
    const baseUrl = await new Promise((resolve) => {
      if (server.listening) return resolve(`http://127.0.0.1:${server.address().port}`);
      return server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`));
    });
    const response = await fetch(`${baseUrl}/api/library/sellers/${seller.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(response.status, 403);
    assert.equal(Boolean(db.prepare('SELECT id FROM library_sellers WHERE id = ?').get(seller.id)), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('carrinho rejeita produto inativo ou nao publicado', () => {
  const category = createCategory({ name: 'Bloqueado' });
  const product = saveProduct({
    name: 'Livro Oculto',
    category_id: category.id,
    price: 10,
    cost_price: 4,
    stock_quantity: 2,
    min_stock: 1,
    published: false
  });

  assert.throws(() => createAssistedRequest({
    idempotency_key: 'cart-hidden-001',
    customer_name: 'Cliente Bloqueado',
    customer_contact: '5581999880008',
    items: [{ product_id: product.id, quantity: 1 }]
  }), (error) => {
    assert.equal(error.status, 400);
    assert.match(error.message, /indisponivel/);
    return true;
  });
});

test('carrinho exige identificacao valida do cliente e aceita registros antigos sem dados', () => {
  const category = createCategory({ name: 'Cliente Obrigatorio' });
  const product = saveProduct({
    name: 'Livro Cliente Obrigatorio',
    category_id: category.id,
    sku: 'TEST-CUSTOMER-REQ',
    price: 22,
    cost_price: 9,
    stock_quantity: 2,
    min_stock: 1,
    published: true
  });

  assert.throws(() => createAssistedRequest({
    idempotency_key: 'cart-invalid-customer-001',
    customer_name: 'A',
    customer_contact: '123',
    items: [{ product_id: product.id, quantity: 1 }]
  }), (error) => {
    assert.equal(error.status, 400);
    return true;
  });

  db.prepare(`
    INSERT INTO library_assisted_requests (public_reference, status)
    VALUES ('LS-OLD01', 'pending')
  `).run();
  const oldRequest = getAssistedRequest('LS-OLD01');
  assert.equal(oldRequest.customer_name, null);
  assert.equal(oldRequest.customer_contact, null);
});

test('dashboard financeiro calcula receita, custo, lucro e estoque atual da Livraria sem baixo estoque', () => {
  const category = createCategory({ name: 'Papelaria' });
  saveProduct({
    name: 'Caderno vocacional',
    category_id: category.id,
    price: 18,
    cost_price: 8,
    stock_quantity: 1,
    min_stock: 2,
    published: true
  });

  const dashboard = getDashboard();

  assert.equal(dashboard.sales_count >= 1, true);
  assert.equal(dashboard.revenue >= 50, true);
  assert.equal(dashboard.cost >= 20, true);
  assert.equal(dashboard.gross_profit >= 30, true);
  assert.equal(dashboard.active_products_count >= 1, true);
  assert.equal(dashboard.units_in_stock >= 1, true);
  assert.equal(Object.hasOwn(dashboard, 'low_stock_count'), false);
});

test('dashboard avancado e planilha filtram vendas da Livraria sem misturar Lanchonete', () => {
  const category = createCategory({ name: 'Relatorios Livraria' });
  const product = saveProduct({
    name: 'Livro Relatorio Livraria',
    category_id: category.id,
    sku: 'TEST-REPORT-LIB',
    price: 40,
    cost_price: 15,
    stock_quantity: 10,
    min_stock: 1,
    published: true
  });
  const sale = createSale({
    customer_name: 'Cliente Relatorio',
    payment_method: 'pix',
    idempotency_key: 'sale-report-library-001',
    items: [{ product_id: product.id, quantity: 2 }]
  }, { id: 1 });
  const dashboard = getDashboard({ startDate: String(sale.created_at).slice(0, 10), endDate: String(sale.created_at).slice(0, 10) });
  const sheet = getLibrarySpreadsheet({ q: 'Livro Relatorio Livraria', page_size: 10 });

  assert.equal(sheet.rows.length, 1);
  assert.equal(sheet.summary.revenue, 80);
  assert.equal(sheet.summary.cost, 30);
  assert.equal(sheet.summary.gross_profit, 50);
  assert.equal(sheet.summary.sales_count, 1);
  assert.equal(dashboard.top_products.some((item) => item.product_name === 'Livro Relatorio Livraria'), true);
  assert.equal(sheet.rows.every((row) => row.produto.includes('Livraria')), true);
});

test('planilha de estoque da Livraria calcula valores e filtra sem estoque minimo', () => {
  const category = createCategory({ name: 'Estoque Planilha' });
  const product = saveProduct({
    name: 'Livro Estoque Planilha',
    category_id: category.id,
    sku: 'TEST-STOCK-SHEET',
    price: 50,
    cost_price: 20,
    stock_quantity: 3,
    min_stock: 99,
    published: true
  });
  saveProduct({
    name: 'Livro Sem Estoque Planilha',
    category_id: category.id,
    sku: 'TEST-STOCK-ZERO',
    price: 30,
    cost_price: 10,
    stock_quantity: 0,
    min_stock: 99,
    published: false
  });

  const sheet = getLibraryStockSpreadsheet({ q: 'Planilha', category_id: category.id, page_size: 10, sort: 'valor_potencial', order: 'desc' });
  const zeroStock = getLibraryStockSpreadsheet({ category_id: category.id, stock: 'out_of_stock', page_size: 10 });
  const row = sheet.rows.find((item) => item.id === product.id);

  assert.equal(Boolean(row), true);
  assert.equal(row.quantidade, 3);
  assert.equal(row.valor_estoque, 60);
  assert.equal(row.valor_potencial, 150);
  assert.equal(row.lucro_potencial, 90);
  assert.equal(Object.hasOwn(row, 'min_stock'), false);
  assert.equal(sheet.summary.inventory_value >= 60, true);
  assert.equal(zeroStock.rows.some((item) => item.produto === 'Livro Sem Estoque Planilha'), true);
});

test('financeiro visualiza cliente e contato dos atendimentos mas nao edita', async () => {
  const category = createCategory({ name: 'Financeiro Atendimento' });
  const product = saveProduct({
    name: 'Livro Financeiro Atendimento',
    category_id: category.id,
    sku: 'TEST-FIN-REQ',
    price: 33,
    cost_price: 12,
    stock_quantity: 5,
    min_stock: 1,
    published: true
  });
  saveSeller({ display_name: 'Seller Financeiro Atendimento', whatsapp_phone: '5581999000401', active: true, eligible: true });
  const request = createAssistedRequest({
    idempotency_key: 'cart-finance-read-001',
    customer_name: 'Cliente Financeiro',
    customer_contact: '5581999880401',
    items: [{ product_id: product.id, quantity: 1 }]
  });
  const userId = db.prepare(`
    INSERT INTO users (name, username, email, password_hash, role)
    VALUES ('Financeiro Atendimento', 'finance-request-read', 'finance-request-read@example.local', 'x', 'finance')
  `).run().lastInsertRowid;
  const token = signUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
  const app = express();
  app.use(express.json());
  app.use('/api/library', libraryRoutes);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');

  try {
    const baseUrl = await new Promise((resolve) => {
      if (server.listening) return resolve(`http://127.0.0.1:${server.address().port}`);
      return server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`));
    });
    const readResponse = await fetch(`${baseUrl}/api/library/requests/${request.reference}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const readPayload = await readResponse.json();
    const writeResponse = await fetch(`${baseUrl}/api/library/requests/${request.reference}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(readResponse.status, 200);
    assert.equal(readPayload.customer_name, 'Cliente Financeiro');
    assert.equal(readPayload.customer_contact, '5581999880401');
    assert.equal(writeResponse.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('link de WhatsApp usa telefone configurado e mensagem codificada', () => {
  const product = {
    id: 99,
    name: 'Biblia de Estudos',
    price: 120,
    url: 'https://shalom.example/livraria/produto/99'
  };

  const url = buildWhatsAppUrl({ product, phone: '5581999999999' });

  assert.match(url, /^https:\/\/wa\.me\/5581999999999\?text=/);
  const message = decodeURIComponent(url.split('text=')[1]);
  assert.match(message, /Biblia de Estudos/);
  assert.match(message, /R\$ 120,00/);
  assert.match(message, /https:\/\/shalom\.example\/livraria\/produto\/99/);
});
