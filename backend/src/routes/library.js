const express = require('express');
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/accessControl');
const { recordAudit } = require('../services/auditService');
const {
  adjustStock,
  cancelAssistedRequest,
  convertAssistedRequest,
  createCategory,
  createSale,
  getAssistedRequest,
  getDashboard,
  getProduct,
  getSaleById,
  getSellerMonitoring,
  listCategories,
  listAssistedRequests,
  listMovements,
  listProducts,
  listSales,
  listSellers,
  reassignAssistedRequest,
  saveSeller,
  saveProduct,
  updateAssistedRequestItems
} = require('../services/libraryService');

const router = express.Router();

function hideOperationalSensitiveForFinance(req, payload) {
  if (req.user?.role !== 'finance') return payload;
  const sanitizeRequest = (request) => ({
    ...request,
    customer_name: undefined,
    customer_contact: undefined,
    seller: request.seller ? { ...request.seller, whatsapp_phone: undefined } : request.seller
  });
  if (Array.isArray(payload)) return payload.map(sanitizeRequest);
  if (payload?.items && payload?.reference) return sanitizeRequest(payload);
  if (Array.isArray(payload?.sellers)) return { ...payload, sellers: payload.sellers.map((seller) => ({ ...seller, whatsapp_phone: undefined })) };
  return payload;
}

const imageSchema = z.object({
  url: z.string().trim().url(),
  alt_text: z.string().trim().optional().nullable(),
  position: z.coerce.number().int().nonnegative().optional()
});

const productSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().optional().nullable(),
  category_id: z.preprocess((value) => value === '' || value === undefined || value === null ? null : value, z.coerce.number().int().positive().nullable()),
  sku: z.string().trim().min(2).optional(),
  price: z.coerce.number().finite().nonnegative(),
  cost_price: z.coerce.number().finite().nonnegative().default(0),
  stock_quantity: z.coerce.number().finite().nonnegative().default(0),
  min_stock: z.coerce.number().finite().nonnegative().default(0),
  active: z.coerce.boolean().default(true),
  published: z.coerce.boolean().default(false),
  images: z.array(imageSchema).default([])
});

const categorySchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().optional().nullable(),
  active: z.coerce.boolean().default(true)
});

const stockSchema = z.object({
  product_id: z.coerce.number().int().positive(),
  type: z.enum(['replenishment', 'adjustment']).default('adjustment'),
  operation: z.enum(['in', 'out']).default('in'),
  quantity: z.coerce.number().finite().positive(),
  reason: z.string().trim().min(3)
});

const saleSchema = z.object({
  payment_method: z.string().trim().min(2).default('manual'),
  customer_name: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  idempotency_key: z.string().trim().min(8).max(120).optional().nullable(),
  items: z.array(z.object({
    product_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().finite().positive()
  })).min(1)
});

const sellerSchema = z.object({
  display_name: z.string().trim().min(2),
  whatsapp_phone: z.string().trim().min(10),
  active: z.coerce.boolean().default(true),
  eligible: z.coerce.boolean().default(true),
  user_id: z.preprocess((value) => value === '' || value === undefined || value === null ? null : value, z.coerce.number().int().positive().nullable()).optional()
});

const assistedItemsSchema = z.object({
  items: z.array(z.object({
    product_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().finite().positive()
  })).min(1)
});

const convertRequestSchema = z.object({
  payment_method: z.string().trim().min(2).default('manual'),
  customer_name: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable()
});

router.use(authenticate, requirePermission('library:read'));

router.get('/dashboard', (req, res) => {
  return res.json(getDashboard());
});

router.get('/sellers', (req, res) => {
  const sellers = listSellers().map((seller) => req.user.role === 'finance' ? { ...seller, whatsapp_phone: undefined } : seller);
  return res.json(sellers);
});

router.post('/sellers', requirePermission('library:sellers:manage'), (req, res) => {
  const seller = saveSeller(sellerSchema.parse(req.body));
  recordAudit({
    req,
    action: 'library.seller.create',
    entityType: 'library_seller',
    entityId: seller.id,
    summary: `Vendedor da Livraria criado: ${seller.display_name}`,
    metadata: seller
  });
  return res.status(201).json(seller);
});

router.patch('/sellers/:id', requirePermission('library:sellers:manage'), (req, res) => {
  const seller = saveSeller(sellerSchema.partial().parse(req.body), req.params.id);
  recordAudit({
    req,
    action: 'library.seller.update',
    entityType: 'library_seller',
    entityId: seller.id,
    summary: `Vendedor da Livraria atualizado: ${seller.display_name}`,
    metadata: seller
  });
  return res.json(seller);
});

router.get('/seller-monitoring', (req, res) => {
  return res.json(hideOperationalSensitiveForFinance(req, getSellerMonitoring()));
});

router.get('/requests', (req, res) => {
  return res.json(hideOperationalSensitiveForFinance(req, listAssistedRequests({
    status: req.query.status,
    sellerId: req.query.seller_id,
    q: req.query.q,
    limit: req.query.limit
  })));
});

router.get('/requests/:reference', (req, res) => {
  return res.json(hideOperationalSensitiveForFinance(req, getAssistedRequest(req.params.reference)));
});

router.patch('/requests/:reference/items', requirePermission('library:write'), (req, res) => {
  const request = updateAssistedRequestItems(req.params.reference, assistedItemsSchema.parse(req.body).items);
  recordAudit({
    req,
    action: 'library.request.items.update',
    entityType: 'library_assisted_request',
    entityId: request.id,
    summary: `Carrinho assistido atualizado: ${request.reference}`,
    metadata: { reference: request.reference, items: request.items.length }
  });
  return res.json(request);
});

router.patch('/requests/:reference/cancel', requirePermission('library:write'), (req, res) => {
  const request = cancelAssistedRequest(req.params.reference);
  recordAudit({
    req,
    action: 'library.request.cancel',
    entityType: 'library_assisted_request',
    entityId: request.id,
    summary: `Carrinho assistido cancelado: ${request.reference}`,
    metadata: { reference: request.reference }
  });
  return res.json(request);
});

router.patch('/requests/:reference/reassign', requirePermission('library:requests:reassign'), (req, res) => {
  const payload = z.object({
    seller_id: z.coerce.number().int().positive(),
    reason: z.string().trim().optional().nullable()
  }).parse(req.body);
  const request = reassignAssistedRequest(req.params.reference, payload.seller_id, req.user.id, payload.reason);
  recordAudit({
    req,
    action: 'library.request.reassign',
    entityType: 'library_assisted_request',
    entityId: request.id,
    summary: `Carrinho assistido reatribuido: ${request.reference}`,
    metadata: { reference: request.reference, seller_id: payload.seller_id }
  });
  return res.json(request);
});

router.post('/requests/:reference/convert', requirePermission('library:write'), (req, res) => {
  const sale = convertAssistedRequest(req.params.reference, convertRequestSchema.parse(req.body), req.user);
  recordAudit({
    req,
    action: 'library.request.convert',
    entityType: 'library_sale',
    entityId: sale.id,
    summary: `Carrinho assistido convertido: ${req.params.reference}`,
    metadata: { sale_id: sale.id, total: sale.total }
  });
  return res.status(201).json(sale);
});

router.get('/categories', (req, res) => {
  return res.json(listCategories({ includeInactive: req.query.include_inactive === '1' }));
});

router.post('/categories', requirePermission('library:write'), (req, res) => {
  const category = createCategory(categorySchema.parse(req.body));
  recordAudit({
    req,
    action: 'library.category.create',
    entityType: 'library_category',
    entityId: category.id,
    summary: `Categoria da Livraria criada: ${category.name}`,
    metadata: category
  });
  return res.status(201).json(category);
});

router.get('/products', (req, res) => {
  return res.json(listProducts({
    q: req.query.q,
    categoryId: req.query.category_id,
    status: req.query.status
  }));
});

router.get('/products/:id', (req, res) => {
  return res.json(getProduct(req.params.id));
});

router.post('/products', requirePermission('library:write'), (req, res) => {
  const product = saveProduct({ ...productSchema.parse(req.body), user_id: req.user.id });
  recordAudit({
    req,
    action: 'library.product.create',
    entityType: 'library_product',
    entityId: product.id,
    summary: `Produto da Livraria criado: ${product.name}`,
    metadata: product
  });
  return res.status(201).json(product);
});

router.patch('/products/:id', requirePermission('library:write'), (req, res) => {
  const current = getProduct(req.params.id);
  const payload = productSchema.partial().parse(req.body);
  const product = saveProduct({
    ...current,
    ...payload,
    images: payload.images !== undefined ? payload.images : current.images,
    category_id: payload.category_id !== undefined ? payload.category_id : current.category_id,
    user_id: req.user.id
  }, req.params.id);
  recordAudit({
    req,
    action: 'library.product.update',
    entityType: 'library_product',
    entityId: product.id,
    summary: `Produto da Livraria atualizado: ${product.name}`,
    metadata: { before: current, after: product }
  });
  return res.json(product);
});

router.get('/movements', (req, res) => {
  return res.json(listMovements({ limit: req.query.limit }));
});

router.post('/movements', requirePermission('library:write'), (req, res) => {
  const payload = stockSchema.parse(req.body);
  const movement = adjustStock({
    productId: payload.product_id,
    type: payload.type,
    quantityChange: payload.operation === 'out' ? -payload.quantity : payload.quantity,
    reason: payload.reason,
    userId: req.user.id
  });
  recordAudit({
    req,
    action: 'library.inventory.adjust',
    entityType: 'library_product',
    entityId: movement.product_id,
    summary: `Estoque da Livraria ajustado: ${movement.product_name}`,
    metadata: movement
  });
  return res.status(201).json(movement);
});

router.get('/sales', (req, res) => {
  return res.json(listSales({ limit: req.query.limit }));
});

router.get('/sales/:id', (req, res) => {
  const sale = getSaleById(req.params.id);
  if (!sale) return res.status(404).json({ message: 'Venda da Livraria nao encontrada.' });
  return res.json(sale);
});

router.post('/sales', requirePermission('library:write'), (req, res) => {
  const sale = createSale(saleSchema.parse(req.body), req.user);
  recordAudit({
    req,
    action: 'library.sale.create',
    entityType: 'library_sale',
    entityId: sale.id,
    summary: `Venda da Livraria registrada: #${sale.id}`,
    metadata: { total: sale.total, gross_profit: sale.gross_profit, items: sale.items.length }
  });
  return res.status(201).json(sale);
});

module.exports = router;
