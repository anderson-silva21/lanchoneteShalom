const path = require('path');

const args = new Set(process.argv.slice(2));
const defaultDevDbPath = path.resolve(__dirname, '../../database/lanchonete.dev.sqlite');
const mainDbPath = path.resolve(__dirname, '../../database/lanchonete.sqlite');
const selectedDbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : defaultDevDbPath;

if (process.env.NODE_ENV === 'production') {
  console.error('Seed demo da Livraria bloqueado com NODE_ENV=production.');
  process.exit(1);
}

if (selectedDbPath === mainDbPath) {
  console.error('Seed demo da Livraria bloqueado no banco principal database/lanchonete.sqlite.');
  console.error('Use o banco dedicado database/lanchonete.dev.sqlite ou informe outro DB_PATH de desenvolvimento.');
  process.exit(1);
}

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DB_PATH = selectedDbPath;
process.env.BACKUP_BEFORE_MIGRATIONS = process.env.BACKUP_BEFORE_MIGRATIONS || 'false';
process.env.LIBRARY_WHATSAPP_PHONE = process.env.LIBRARY_WHATSAPP_PHONE || '5581999999999';
process.env.PUBLIC_STOREFRONT_URL = process.env.PUBLIC_STOREFRONT_URL || 'http://localhost:5173';

const { compactDatabase, db, dbPath, initDatabase } = require('../src/db');
const { createSale } = require('../src/services/libraryService');
const { brazilDate } = require('../src/utils/time');

const seedVersion = 'library-demo-v1';
const demoSalePrefix = 'library-demo-sale-';
const demoSkuPrefix = 'DEMO-LIB-';

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function timestampDaysAgo(days, time = '14:30:00') {
  return `${dateDaysAgo(days)} ${time}`;
}

function ensureCategory({ name, description }) {
  const existing = db.prepare('SELECT id FROM library_categories WHERE name = ?').get(name);
  if (existing) {
    db.prepare('UPDATE library_categories SET description = ?, active = 1 WHERE id = ?')
      .run(description || null, existing.id);
    return existing.id;
  }

  return db.prepare(`
    INSERT INTO library_categories (name, description, active)
    VALUES (?, ?, 1)
  `).run(name, description || null).lastInsertRowid;
}

function deletePreviousDemoSales() {
  const saleIds = db.prepare(`
    SELECT id
    FROM library_sales
    WHERE idempotency_key LIKE ?
  `).all(`${demoSalePrefix}%`).map((sale) => sale.id);

  if (!saleIds.length) return;
  const placeholders = saleIds.map(() => '?').join(', ');

  db.prepare(`
    DELETE FROM library_inventory_movements
    WHERE reference_type = 'library_sale'
      AND reference_id IN (${placeholders})
  `).run(...saleIds);

  db.prepare(`DELETE FROM library_sale_items WHERE sale_id IN (${placeholders})`).run(...saleIds);
  db.prepare(`DELETE FROM library_sales WHERE id IN (${placeholders})`).run(...saleIds);
}

function replaceProductImages(productId, images) {
  db.prepare('DELETE FROM library_product_images WHERE product_id = ?').run(productId);
  const insert = db.prepare(`
    INSERT INTO library_product_images (product_id, url, alt_text, position)
    VALUES (?, ?, ?, ?)
  `);
  images.forEach((image, index) => {
    insert.run(productId, image.url, image.alt_text || null, index);
  });
}

function upsertProduct(product, categoryIds) {
  const payload = {
    ...product,
    category_id: categoryIds[product.category],
    description: product.description || null,
    active: product.active ? 1 : 0,
    published: product.published ? 1 : 0
  };

  const existing = db.prepare('SELECT id FROM library_products WHERE sku = ?').get(product.sku);
  let productId;

  if (existing) {
    productId = existing.id;
    db.prepare(`
      UPDATE library_products
      SET name = @name,
          description = @description,
          category_id = @category_id,
          price = @price,
          cost_price = @cost_price,
          stock_quantity = @stock_quantity,
          min_stock = @min_stock,
          active = @active,
          published = @published
      WHERE id = @id
    `).run({ ...payload, id: productId });
  } else {
    productId = db.prepare(`
      INSERT INTO library_products
        (name, description, category_id, sku, price, cost_price, stock_quantity, min_stock, active, published)
      VALUES
        (@name, @description, @category_id, @sku, @price, @cost_price, @stock_quantity, @min_stock, @active, @published)
    `).run(payload).lastInsertRowid;
  }

  db.prepare(`
    DELETE FROM library_inventory_movements
    WHERE product_id = ?
      AND reference_type = 'library_demo_seed'
  `).run(productId);

  db.prepare(`
    INSERT INTO library_inventory_movements
      (product_id, type, quantity_change, quantity_before, quantity_after, reference_type, reason, created_by)
    VALUES
      (?, 'replenishment', ?, 0, ?, 'library_demo_seed', 'Estoque inicial ficticio da Livraria', NULL)
  `).run(productId, product.stock_quantity, product.stock_quantity);

  replaceProductImages(productId, product.images || []);
  return productId;
}

const categories = [
  { key: 'books', name: 'Livros', description: 'Livros formativos e espiritualidade catolica ficticios.' },
  { key: 'shirts', name: 'Camisas', description: 'Camisas e vestuario institucional ficticio.' },
  { key: 'rosaries', name: 'Tercos e Rosarios', description: 'Itens devocionais ficticios para demonstracao.' },
  { key: 'images', name: 'Imagens Religiosas', description: 'Imagens e artigos religiosos ficticios.' },
  { key: 'notebooks', name: 'Cadernos e Acessorios', description: 'Papelaria e acessorios da Shalom Store ficticios.' }
];

const products = [
  {
    key: 'book_prayer',
    category: 'books',
    name: 'Livro Caminho de Oracao Demo',
    sku: `${demoSkuPrefix}BOOK-001`,
    description: 'Livro ficticio de espiritualidade para acompanhar momentos de oracao pessoal e grupos de partilha.',
    price: 42.9,
    cost_price: 21.4,
    stock_quantity: 12,
    min_stock: 4,
    active: true,
    published: true,
    images: [{ url: '/shalom.png', alt_text: 'Capa ficticia do Livro Caminho de Oracao Demo' }]
  },
  {
    key: 'book_formation',
    category: 'books',
    name: 'Formacao Shalom para Jovens Demo',
    sku: `${demoSkuPrefix}BOOK-002`,
    description: 'Material ficticio para encontros de jovens, com roteiros, meditacoes e propostas de aprofundamento.',
    price: 56,
    cost_price: 28,
    stock_quantity: 3,
    min_stock: 5,
    active: true,
    published: true,
    images: [{ url: '/shalom.png', alt_text: 'Capa ficticia do livro de formacao demo' }]
  },
  {
    key: 'shirt_blue',
    category: 'shirts',
    name: 'Camisa Shalom Azul Demo',
    sku: `${demoSkuPrefix}SHIRT-001`,
    description: 'Camisa ficticia em malha azul com estampa Shalom Store para testar produtos de vestuario.',
    price: 69.9,
    cost_price: 34.5,
    stock_quantity: 8,
    min_stock: 3,
    active: true,
    published: true,
    images: [{ url: '/shalom.png', alt_text: 'Camisa azul ficticia Shalom Demo' }]
  },
  {
    key: 'shirt_event',
    category: 'shirts',
    name: 'Camisa Evento Especial Demo',
    sku: `${demoSkuPrefix}SHIRT-002`,
    description: 'Modelo ficticio nao publicado, usado para avaliar controle interno de catalogo.',
    price: 74.9,
    cost_price: 38,
    stock_quantity: 10,
    min_stock: 4,
    active: true,
    published: false,
    images: [{ url: '/shalom.png', alt_text: 'Camisa ficticia de evento especial' }]
  },
  {
    key: 'rosary_wood',
    category: 'rosaries',
    name: 'Terco de Madeira Demo',
    sku: `${demoSkuPrefix}ROSARY-001`,
    description: 'Terco ficticio de madeira clara com crucifixo simples para demonstracao de artigo devocional.',
    price: 32,
    cost_price: 13.5,
    stock_quantity: 15,
    min_stock: 6,
    active: true,
    published: true,
    images: [{ url: '/shalom.png', alt_text: 'Terco de madeira ficticio' }]
  },
  {
    key: 'rosary_pearl',
    category: 'rosaries',
    name: 'Rosario Perolado Demo',
    sku: `${demoSkuPrefix}ROSARY-002`,
    description: 'Rosario ficticio perolado para testar variacao de preco, custo e estoque zerado.',
    price: 48,
    cost_price: 24,
    stock_quantity: 0,
    min_stock: 4,
    active: true,
    published: true,
    images: [{ url: '/shalom.png', alt_text: 'Rosario perolado ficticio' }]
  },
  {
    key: 'image_family',
    category: 'images',
    name: 'Imagem Sagrada Familia Demo',
    sku: `${demoSkuPrefix}IMAGE-001`,
    description: 'Imagem religiosa ficticia em resina para avaliar fotos, descricao e disponibilidade.',
    price: 89.9,
    cost_price: 47,
    stock_quantity: 4,
    min_stock: 2,
    active: true,
    published: true,
    images: [{ url: '/shalom.png', alt_text: 'Imagem ficticia da Sagrada Familia' }]
  },
  {
    key: 'image_inactive',
    category: 'images',
    name: 'Imagem Fora de Linha Demo',
    sku: `${demoSkuPrefix}IMAGE-002`,
    description: 'Produto ficticio inativo para validar filtros administrativos e ausencia na vitrine.',
    price: 64.9,
    cost_price: 31,
    stock_quantity: 2,
    min_stock: 2,
    active: false,
    published: false,
    images: [{ url: '/shalom.png', alt_text: 'Imagem religiosa ficticia inativa' }]
  },
  {
    key: 'notebook',
    category: 'notebooks',
    name: 'Caderno Vocacional Demo',
    sku: `${demoSkuPrefix}NOTE-001`,
    description: 'Caderno ficticio pautado para anotacoes de retiro, direcao espiritual e formacoes.',
    price: 24.9,
    cost_price: 9.8,
    stock_quantity: 2,
    min_stock: 8,
    active: true,
    published: true,
    images: [{ url: '/shalom.png', alt_text: 'Caderno vocacional ficticio' }]
  },
  {
    key: 'bookmark',
    category: 'notebooks',
    name: 'Marcador de Pagina Shalom Demo',
    sku: `${demoSkuPrefix}ACC-001`,
    description: 'Acessorio ficticio de baixo valor para testar vendas com multiplos itens.',
    price: 6.5,
    cost_price: 1.75,
    stock_quantity: 40,
    min_stock: 12,
    active: true,
    published: true,
    images: [{ url: '/shalom.png', alt_text: 'Marcador de pagina ficticio' }]
  }
];

const sales = [
  {
    key: '001',
    daysAgo: 12,
    time: '10:18:00',
    customer_name: 'Cliente Demo Ana',
    payment_method: 'pix',
    notes: 'Venda ficticia para avaliacao do dashboard.',
    items: [
      ['book_prayer', 1],
      ['bookmark', 2]
    ]
  },
  {
    key: '002',
    daysAgo: 7,
    time: '16:45:00',
    customer_name: 'Cliente Demo Paulo',
    payment_method: 'cartao',
    notes: 'Atendimento ficticio apos contato pelo WhatsApp.',
    items: [
      ['shirt_blue', 1],
      ['rosary_wood', 1]
    ]
  },
  {
    key: '003',
    daysAgo: 2,
    time: '19:05:00',
    customer_name: 'Cliente Demo Lucia',
    payment_method: 'dinheiro',
    notes: 'Venda ficticia de artigo religioso.',
    items: [
      ['image_family', 1],
      ['book_formation', 1]
    ]
  },
  {
    key: '004',
    daysAgo: 0,
    time: '11:35:00',
    customer_name: 'Cliente Demo Rafael',
    payment_method: 'pix',
    notes: 'Venda ficticia do dia atual.',
    items: [
      ['notebook', 1],
      ['bookmark', 4]
    ]
  }
];

function seedSales(productIds) {
  const seller = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();

  sales.forEach((sale) => {
    const created = createSale({
      customer_name: sale.customer_name,
      payment_method: sale.payment_method,
      notes: sale.notes,
      idempotency_key: `${demoSalePrefix}${sale.key}`,
      items: sale.items.map(([productKey, itemQuantity]) => ({
        product_id: productIds[productKey],
        quantity: itemQuantity
      }))
    }, { id: seller?.id || null });

    const createdAt = sale.daysAgo === 0 ? `${brazilDate()} ${sale.time}` : timestampDaysAgo(sale.daysAgo, sale.time);
    db.prepare('UPDATE library_sales SET created_at = ? WHERE id = ?').run(createdAt, created.id);
    db.prepare(`
      UPDATE library_inventory_movements
      SET created_at = ?
      WHERE reference_type = 'library_sale' AND reference_id = ?
    `).run(createdAt, created.id);
  });
}

function seedLibraryDemo() {
  initDatabase();

  const shouldReset = args.has('--reset');
  const existingMarker = db.prepare("SELECT value FROM app_settings WHERE key = 'library_demo_seed_version'").get();

  if (!shouldReset && existingMarker?.value === seedVersion) {
    console.log(JSON.stringify({
      message: 'Demo da Livraria ja esta atualizado.',
      dbPath,
      hint: 'Use npm run seed:library:dev -- --reset para recriar os dados ficticios da Livraria.'
    }, null, 2));
    return;
  }

  const categoryIds = Object.fromEntries(categories.map((category) => [category.key, ensureCategory(category)]));

  const transaction = db.transaction(() => {
    deletePreviousDemoSales();

    const productIds = {};
    products.forEach((product) => {
      productIds[product.key] = upsertProduct(product, categoryIds);
    });

    seedSales(productIds);

    db.prepare(`
      INSERT INTO app_settings (key, value)
      VALUES ('library_demo_seed_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(seedVersion);
  });

  transaction();
  compactDatabase();

  const counts = {
    categories: db.prepare('SELECT COUNT(*) AS total FROM library_categories WHERE active = 1').get().total,
    demo_products: db.prepare('SELECT COUNT(*) AS total FROM library_products WHERE sku LIKE ?').get(`${demoSkuPrefix}%`).total,
    demo_sales: db.prepare('SELECT COUNT(*) AS total FROM library_sales WHERE idempotency_key LIKE ?').get(`${demoSalePrefix}%`).total,
    public_products: db.prepare(`
      SELECT COUNT(*) AS total
      FROM library_products
      WHERE sku LIKE ?
        AND active = 1
        AND published = 1
        AND stock_quantity > 0
    `).get(`${demoSkuPrefix}%`).total
  };

  console.log(JSON.stringify({
    message: 'Demo da Livraria populado com dados ficticios.',
    dbPath,
    seedVersion,
    counts
  }, null, 2));
}

try {
  seedLibraryDemo();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  db.close();
}
