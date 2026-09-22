const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-pos-admin-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');
process.env.JWT_SECRET = 'pos-admin-routes-test-secret';

const { db, initDatabase } = require('../src/db');
const { signUser } = require('../src/middleware/auth');
const comboRoutes = require('../src/routes/combos');
const productRoutes = require('../src/routes/products');
const errorHandler = require('../src/middleware/errorHandler');

initDatabase();
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.id = 'pos-admin-test'; next(); });
app.use('/api/combos', comboRoutes);
app.use('/api/products', productRoutes);
app.use(errorHandler);
const server = app.listen(0, '127.0.0.1');
let baseUrl;
let productId;
const tokens = {};

function auth(role) {
  return { authorization: `Bearer ${tokens[role]}`, 'content-type': 'application/json' };
}

test.before(async () => {
  if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  db.exec('DELETE FROM combo_items; DELETE FROM combos; DELETE FROM products; DELETE FROM users;');
  for (const role of ['admin', 'finance', 'cashier']) {
    const result = db.prepare('INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(role, role, `${role}@test.local`, 'x', role);
    tokens[role] = signUser(db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid));
  }
  const result = db.prepare(`INSERT INTO products (name, category, cost_price, sale_price, stock_quantity, min_stock, internal_code, unit) VALUES ('Cafe', 'Bebidas', 2, 5, 20, 1, 'BEB-001', 'unidade')`).run();
  productId = result.lastInsertRowid;
});

test.after(() => { server.close(); db.close(); fs.rmSync(tempDir, { recursive: true, force: true }); });

test('caixa visualiza combos para vender mas nao administra', async () => {
  const payload = { name: 'Combo Cafe', sale_price: 4, is_promotion: true, expires_at: null, active: true, items: [{ product_id: productId, quantity: 1 }] };
  const getResponse = await fetch(`${baseUrl}/combos`, { headers: auth('cashier') });
  assert.equal(getResponse.status, 200);
  for (const [method, url] of [['POST', '/combos'], ['PATCH', '/combos/1'], ['DELETE', '/combos/1']]) {
    const response = await fetch(`${baseUrl}${url}`, { method, headers: auth('cashier'), body: JSON.stringify(payload) });
    assert.equal(response.status, 403, `${method} ${url}`);
  }
});

test('financeiro cria e edita oferta que aparece no PDV', async () => {
  const createPayload = { name: 'Oferta Cafe', sale_price: 4, is_promotion: true, expires_at: null, active: true, items: [{ product_id: productId, quantity: 1 }] };
  const createdResponse = await fetch(`${baseUrl}/combos`, { method: 'POST', headers: auth('finance'), body: JSON.stringify(createPayload) });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  const updatedResponse = await fetch(`${baseUrl}/combos/${created.id}`, { method: 'PATCH', headers: auth('finance'), body: JSON.stringify({ ...createPayload, name: 'Oferta Cafe Editada' }) });
  assert.equal(updatedResponse.status, 200);
  assert.equal((await updatedResponse.json()).name, 'Oferta Cafe Editada');
  const active = await fetch(`${baseUrl}/combos`, { headers: auth('cashier') }).then((response) => response.json());
  assert.ok(active.some((combo) => combo.id === created.id));

  const adminResponse = await fetch(`${baseUrl}/combos`, { method: 'POST', headers: auth('admin'), body: JSON.stringify({ ...createPayload, name: 'Combo Admin', is_promotion: false, sale_price: 5 }) });
  assert.equal(adminResponse.status, 201);
});

test('produto persiste, retorna e remove URL de imagem e rejeita protocolo invalido', async () => {
  const baseProduct = { name: 'Suco', category: 'Bebidas', cost_price: 2, sale_price: 6, stock_quantity: 0, min_stock: 0, supplier: null, unit: 'unidade', expiration_date: null, active: 1 };
  const createdResponse = await fetch(`${baseUrl}/products`, { method: 'POST', headers: auth('finance'), body: JSON.stringify({ ...baseProduct, image_url: 'https://example.com/suco.jpg' }) });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.image_url, 'https://example.com/suco.jpg');
  const listed = await fetch(`${baseUrl}/products`, { headers: auth('cashier') }).then((response) => response.json());
  assert.equal(listed.find((product) => product.id === created.id).image_url, 'https://example.com/suco.jpg');
  const removed = await fetch(`${baseUrl}/products/${created.id}`, { method: 'PATCH', headers: auth('finance'), body: JSON.stringify({ image_url: null }) });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).image_url, null);
  const invalid = await fetch(`${baseUrl}/products/${created.id}`, { method: 'PATCH', headers: auth('finance'), body: JSON.stringify({ image_url: 'javascript:alert(1)' }) });
  assert.equal(invalid.status, 400);
});

test('visibilidade no PDV tem default visivel e RBAC dedicado', async () => {
  const baseProduct = { name: 'Bolo', category: 'Lanches', cost_price: 3, sale_price: 8, stock_quantity: 2, min_stock: 0, supplier: null, unit: 'unidade', expiration_date: null, active: 1 };
  const createdResponse = await fetch(`${baseUrl}/products`, { method: 'POST', headers: auth('finance'), body: JSON.stringify(baseProduct) });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.visible_in_pos, 1);

  const cashierAttempt = await fetch(`${baseUrl}/products/${created.id}/pos-visibility`, { method: 'PATCH', headers: auth('cashier'), body: JSON.stringify({ visible_in_pos: false }) });
  assert.equal(cashierAttempt.status, 403);

  const hiddenResponse = await fetch(`${baseUrl}/products/${created.id}/pos-visibility`, { method: 'PATCH', headers: auth('finance'), body: JSON.stringify({ visible_in_pos: false }) });
  assert.equal(hiddenResponse.status, 200);
  assert.equal((await hiddenResponse.json()).visible_in_pos, 0);

  const administrative = await fetch(`${baseUrl}/products`, { headers: auth('finance') }).then((response) => response.json());
  assert.ok(administrative.some((product) => product.id === created.id));
  const catalog = await fetch(`${baseUrl}/products?catalog=pos`, { headers: auth('cashier') }).then((response) => response.json());
  assert.ok(!catalog.some((product) => product.id === created.id));

  const visibleResponse = await fetch(`${baseUrl}/products/${created.id}/pos-visibility`, { method: 'PATCH', headers: auth('admin'), body: JSON.stringify({ visible_in_pos: true }) });
  assert.equal(visibleResponse.status, 200);
  const refreshedCatalog = await fetch(`${baseUrl}/products?catalog=pos`, { headers: auth('cashier') }).then((response) => response.json());
  assert.ok(refreshedCatalog.some((product) => product.id === created.id));
});

test('produto sem preco nao e elegivel para o catalogo e preserva a preferencia de visibilidade', async () => {
  const baseProduct = { name: 'Item sem preco', category: 'Outros', cost_price: 5, sale_price: 0, stock_quantity: 4, min_stock: 0, supplier: null, unit: 'unidade', expiration_date: null, active: 1 };
  const createdResponse = await fetch(`${baseUrl}/products`, { method: 'POST', headers: auth('admin'), body: JSON.stringify(baseProduct) });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.visible_in_pos, 1);

  const initialCatalog = await fetch(`${baseUrl}/products?catalog=pos`, { headers: auth('cashier') }).then((response) => response.json());
  assert.ok(!initialCatalog.some((product) => product.id === created.id));
  const enableWithoutPrice = await fetch(`${baseUrl}/products/${created.id}/pos-visibility`, { method: 'PATCH', headers: auth('finance'), body: JSON.stringify({ visible_in_pos: true }) });
  assert.equal(enableWithoutPrice.status, 400);

  const pricedResponse = await fetch(`${baseUrl}/products/${created.id}`, { method: 'PATCH', headers: auth('finance'), body: JSON.stringify({ sale_price: 9 }) });
  assert.equal(pricedResponse.status, 200);
  const catalogWithPrice = await fetch(`${baseUrl}/products?catalog=pos`, { headers: auth('cashier') }).then((response) => response.json());
  assert.ok(catalogWithPrice.some((product) => product.id === created.id));

  const unpricedResponse = await fetch(`${baseUrl}/products/${created.id}`, { method: 'PATCH', headers: auth('finance'), body: JSON.stringify({ sale_price: 0 }) });
  assert.equal(unpricedResponse.status, 200);
  assert.equal((await unpricedResponse.json()).visible_in_pos, 1);
  const catalogWithoutPrice = await fetch(`${baseUrl}/products?catalog=pos`, { headers: auth('cashier') }).then((response) => response.json());
  assert.ok(!catalogWithoutPrice.some((product) => product.id === created.id));
});
