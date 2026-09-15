const express = require('express');
const { z } = require('zod');
const {
  createAssistedRequest,
  getPublicAssistedRequest,
  getPublicProduct,
  listCategories,
  listPublicProducts
} = require('../services/libraryService');

const router = express.Router();

const assistedRequestSchema = z.object({
  idempotency_key: z.string().trim().min(8).max(120).optional().nullable(),
  customer_name: z.string().trim().min(2).max(120),
  customer_contact: z.string().trim().min(10).max(24),
  customer_note: z.string().trim().max(500).optional().nullable(),
  items: z.array(z.object({
    product_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().finite().positive()
  })).min(1).max(40)
});

function baseUrlFromRequest(req) {
  const configured = String(process.env.PUBLIC_STOREFRONT_URL || '').trim();
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`;
}

router.get('/categories', (req, res) => {
  const categories = listCategories()
    .filter((category) => category.products_count > 0)
    .map(({ id, name, description, products_count }) => ({ id, name, description, products_count }));
  return res.json(categories);
});

router.get('/products', (req, res) => {
  const products = listPublicProducts({
    q: req.query.q,
    categoryId: req.query.category_id,
    includeUnavailable: req.query.include_unavailable === '1' || req.query.include_unavailable === 'true',
    sort: req.query.sort,
    baseUrl: baseUrlFromRequest(req)
  });
  return res.json(products);
});

router.get('/products/:id', (req, res) => {
  const product = getPublicProduct(req.params.id, baseUrlFromRequest(req));
  if (!product) return res.status(404).json({ message: 'Produto nao encontrado.' });
  return res.json(product);
});

router.get('/products/:id/whatsapp', (req, res) => {
  const product = getPublicProduct(req.params.id, baseUrlFromRequest(req));
  if (!product) return res.status(404).json({ message: 'Produto nao encontrado.' });
  return res.status(410).json({ message: 'Use o carrinho da Livraria para solicitar atendimento.' });
});

router.post('/requests', (req, res) => {
  const request = createAssistedRequest(assistedRequestSchema.parse(req.body));
  return res.status(201).json(request);
});

router.get('/requests/:reference', (req, res) => {
  const request = getPublicAssistedRequest(req.params.reference);
  if (!request) return res.status(404).json({ message: 'Carrinho nao encontrado.' });
  return res.json(request);
});

module.exports = router;
