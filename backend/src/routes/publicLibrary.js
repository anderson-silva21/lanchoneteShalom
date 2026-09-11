const express = require('express');
const {
  buildWhatsAppUrl,
  getPublicProduct,
  listCategories,
  listPublicProducts
} = require('../services/libraryService');

const router = express.Router();

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
  const whatsapp_url = buildWhatsAppUrl({
    product,
    baseUrl: baseUrlFromRequest(req),
    phone: process.env.LIBRARY_WHATSAPP_PHONE
  });
  if (!whatsapp_url) return res.status(503).json({ message: 'Contato da Livraria nao configurado.' });
  return res.json({ whatsapp_url });
});

module.exports = router;
