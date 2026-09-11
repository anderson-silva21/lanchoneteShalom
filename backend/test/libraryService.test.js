const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-library-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');
process.env.LIBRARY_WHATSAPP_PHONE = '5581999999999';

const { db, initDatabase } = require('../src/db');
const {
  adjustStock,
  buildWhatsAppUrl,
  createCategory,
  createSale,
  getDashboard,
  listPublicProducts,
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

  const url = buildWhatsAppUrl({ product });

  assert.match(url, /^https:\/\/wa\.me\/5581999999999\?text=/);
  const message = decodeURIComponent(url.split('text=')[1]);
  assert.match(message, /Biblia de Estudos/);
  assert.match(message, /R\$ 120,00/);
  assert.match(message, /https:\/\/shalom\.example\/livraria\/produto\/99/);
});
