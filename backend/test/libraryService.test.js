const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-library-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');

const { db, initDatabase } = require('../src/db');
const {
  adjustStock,
  buildWhatsAppUrl,
  convertAssistedRequest,
  createAssistedRequest,
  createCategory,
  createSale,
  getDashboard,
  getSellerMonitoring,
  listAssistedRequests,
  listPublicProducts,
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
    items: [{ product_id: product.id, quantity: 1 }]
  });
  const duplicate = createAssistedRequest({
    idempotency_key: 'cart-round-001',
    items: [{ product_id: product.id, quantity: 1 }]
  });
  const second = createAssistedRequest({
    idempotency_key: 'cart-round-002',
    items: [{ product_id: product.id, quantity: 1 }]
  });
  const third = createAssistedRequest({
    idempotency_key: 'cart-round-003',
    items: [{ product_id: product.id, quantity: 1 }]
  });

  assert.match(first.reference, /^LS-[A-Z2-9]{5}$/);
  assert.equal(first.reference, duplicate.reference);
  assert.equal(first.seller.display_name, sellerA.display_name);
  assert.equal(second.seller.display_name, sellerB.display_name);
  assert.equal(third.seller.display_name, sellerA.display_name);
  assert.match(decodeURIComponent(first.whatsapp_url.split('text=')[1]), new RegExp(first.reference));
  assert.equal(db.prepare('SELECT stock_quantity FROM library_products WHERE id = ?').get(product.id).stock_quantity, 10);
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
    items: [{ product_id: product.id, quantity: 1 }]
  });
  assert.equal(unassigned.seller, null);
  assert.equal(unassigned.whatsapp_url, null);

  const active = saveSeller({ display_name: 'Seller C', whatsapp_phone: '5581999000003', active: true, eligible: true });
  const inactive = saveSeller({ display_name: 'Seller D', whatsapp_phone: '5581999000004', active: false, eligible: true });
  const assigned = createAssistedRequest({
    idempotency_key: 'cart-assigned-001',
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
    items: [{ product_id: product.id, quantity: 2 }]
  });

  const sale = convertAssistedRequest(request.reference, { customer_name: 'Cliente Teste', payment_method: 'pix' }, { id: 1 });
  const duplicate = convertAssistedRequest(request.reference, { customer_name: 'Cliente Teste', payment_method: 'pix' }, { id: 1 });

  assert.equal(sale.id, duplicate.id);
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
    items: [{ product_id: product.id, quantity: 1 }]
  });

  const reassigned = reassignAssistedRequest(request.reference, seller.id, 1, 'Teste');
  const history = db.prepare('SELECT COUNT(*) AS total FROM library_assignment_history WHERE request_id = ?').get(reassigned.id);
  const monitoring = getSellerMonitoring();

  assert.equal(reassigned.assigned_seller_id, seller.id);
  assert.equal(history.total >= 2, true);
  assert.equal(Array.isArray(monitoring.sellers), true);
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
    items: [{ product_id: product.id, quantity: 1 }]
  }), (error) => {
    assert.equal(error.status, 400);
    assert.match(error.message, /indisponivel/);
    return true;
  });
});

test('dashboard financeiro calcula receita, custo, lucro e alertas da Livraria', () => {
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
  assert.equal(dashboard.low_stock_count >= 1, true);
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
