const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-pos-admin-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');
process.env.JWT_SECRET = 'pos-admin-routes-test-secret';
process.env.PRODUCT_UPLOAD_DIR = path.join(tempDir, 'product-uploads');

const { db, initDatabase } = require('../src/db');
const { signUser } = require('../src/middleware/auth');
const comboRoutes = require('../src/routes/combos');
const productRoutes = require('../src/routes/products');
const errorHandler = require('../src/middleware/errorHandler');
const salesRoutes = require('../src/routes/sales');

initDatabase();
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.id = 'pos-admin-test'; next(); });
app.use('/api/combos', comboRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', salesRoutes);
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

test('API identifica customer_name quando pagamento pendente esta sem cliente', async () => {
  for (const customerName of [undefined, null, '', '   ']) {
    const response = await fetch(`${baseUrl}/sales`, {
      method: 'POST', headers: auth('cashier'), body: JSON.stringify({
        payment_method: 'pagamento_pendente', customer_name: customerName,
        notes: 'Dados devem ser preservados', items: [{ product_id: productId, quantity: 1 }]
      })
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.deepEqual(body.issues?.map(({ path, message }) => ({ path, message })), [{
      path: ['customer_name'], message: 'Informe o nome do cliente para registrar uma venda com pagamento pendente.'
    }]);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sales').get().count, 0);
  assert.equal(db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(productId).stock_quantity, 20);
});

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

test('cadastro de produto normaliza upload valido para WebP com nome seguro', async () => {
  const form = new FormData();
  Object.entries({
    name: 'Produto com imagem',
    category: 'Bebidas',
    cost_price: '2',
    is_donation: 'false',
    sale_price: '6',
    stock_quantity: '0',
    min_stock: '0',
    supplier: '',
    unit: 'unidade',
    expiration_date: '',
    visible_in_pos: 'true',
    active: '1'
  }).forEach(([key, value]) => form.set(key, value));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  form.set('image', new Blob([png], { type: 'image/png' }), '../../produto.png');

  const response = await fetch(`${baseUrl}/products`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tokens.finance}` },
    body: form
  });
  const created = await response.json();

  assert.equal(response.status, 201);
  assert.equal(created.is_donation, 0);
  assert.match(created.image_url, /^http:\/\/127\.0\.0\.1:\d+\/api\/products\/images\/[0-9a-f-]{36}\.webp$/);
  assert.equal(created.image_url.includes('produto.png'), false);

  const storedImage = await fetch(created.image_url);
  const bytes = Buffer.from(await storedImage.arrayBuffer());
  assert.equal(storedImage.status, 200);
  assert.equal(storedImage.headers.get('content-type'), 'image/webp');
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  const filename = created.image_url.split('/').at(-1);
  const backupCopy = db.prepare('SELECT content FROM product_image_files WHERE filename = ?').get(filename);
  assert.deepEqual(backupCopy.content, bytes, 'o SQLite deve manter uma copia recuperavel para backups');
  fs.unlinkSync(path.join(process.env.PRODUCT_UPLOAD_DIR, filename));
  assert.equal((await fetch(created.image_url)).status, 200, 'a copia do SQLite deve atender uma restauracao sem o cache em disco');

  const duplicateResponse = await fetch(`${baseUrl}/products`, {
    method: 'POST',
    headers: auth('finance'),
    body: JSON.stringify({
      name: 'Produto com imagem compartilhada', category: 'Bebidas', cost_price: 2, sale_price: 6,
      stock_quantity: 0, min_stock: 0, supplier: null, unit: 'unidade', expiration_date: null,
      image_url: `${created.image_url}?v=1#catalogo`, active: 1
    })
  });
  const duplicate = await duplicateResponse.json();
  assert.equal(duplicateResponse.status, 201);

  const removeOriginal = await fetch(`${baseUrl}/products/${created.id}`, {
    method: 'PATCH', headers: auth('finance'), body: JSON.stringify({ image_url: null })
  });
  assert.equal(removeOriginal.status, 200);
  assert.equal((await fetch(created.image_url)).status, 200, 'a referencia compartilhada deve preservar o arquivo');

  const removeLastReference = await fetch(`${baseUrl}/products/${duplicate.id}`, {
    method: 'PATCH', headers: auth('finance'), body: JSON.stringify({ image_url: null })
  });
  assert.equal(removeLastReference.status, 200);
  assert.equal((await fetch(created.image_url)).status, 404);
  assert.equal(db.prepare('SELECT 1 FROM product_image_files WHERE filename = ?').get(filename), undefined);

  const orphanFilename = '22222222-2222-4222-8222-222222222222.webp';
  fs.writeFileSync(path.join(process.env.PRODUCT_UPLOAD_DIR, orphanFilename), bytes);
  assert.equal(
    (await fetch(`${new URL(created.image_url).origin}/api/products/images/${orphanFilename}`)).status,
    404,
    'o cache em disco nao deve sobreviver como fonte autoritativa apos uma restauracao'
  );
  fs.unlinkSync(path.join(process.env.PRODUCT_UPLOAD_DIR, orphanFilename));
});

test('edicao de produto troca e remove a imagem armazenada', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const replaceForm = new FormData();
  replaceForm.set('image', new Blob([png], { type: 'image/png' }), 'troca.png');

  const replacedResponse = await fetch(`${baseUrl}/products/${productId}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${tokens.finance}` },
    body: replaceForm
  });
  const replaced = await replacedResponse.json();

  assert.equal(replacedResponse.status, 200);
  assert.match(replaced.image_url, /\/api\/products\/images\/[0-9a-f-]{36}\.webp$/);
  assert.equal((await fetch(replaced.image_url)).status, 200);

  const removeForm = new FormData();
  removeForm.set('remove_image', 'true');
  const removedResponse = await fetch(`${baseUrl}/products/${productId}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${tokens.finance}` },
    body: removeForm
  });

  assert.equal(removedResponse.status, 200);
  assert.equal((await removedResponse.json()).image_url, null);
  assert.equal((await fetch(replaced.image_url)).status, 404);
});

test('upload rejeita assinatura falsa, MIME inconsistente e arquivo acima de 2 MB', async () => {
  const validPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const cases = [
    { name: 'falso.png', type: 'image/png', bytes: Buffer.from('<script>alert(1)</script>'), message: /conteudo do arquivo/i },
    { name: 'inconsistente.jpg', type: 'image/jpeg', bytes: validPng, message: /conteudo do arquivo/i },
    { name: 'grande.png', type: 'image/png', bytes: Buffer.alloc((2 * 1024 * 1024) + 1), message: /maximo 2 MB/i }
  ];

  for (const [index, item] of cases.entries()) {
    const form = new FormData();
    Object.entries({
      name: `Upload invalido ${index}`,
      category: 'Bebidas',
      cost_price: '2',
      sale_price: '6',
      stock_quantity: '0',
      min_stock: '0',
      unit: 'unidade'
    }).forEach(([key, value]) => form.set(key, value));
    form.set('image', new Blob([item.bytes], { type: item.type }), item.name);

    const response = await fetch(`${baseUrl}/products`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokens.finance}` },
      body: form
    });
    const payload = await response.json();

    assert.equal(response.status, 400, item.name);
    assert.match(payload.message, item.message, item.name);
  }

  const invalidProducts = db.prepare("SELECT COUNT(*) AS count FROM products WHERE name LIKE 'Upload invalido %'").get();
  assert.equal(invalidProducts.count, 0);
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
