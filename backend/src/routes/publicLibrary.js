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

function requestOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function baseUrlFromRequest(req) {
  const configured = String(process.env.PUBLIC_STOREFRONT_URL || '').trim();
  if (configured) return configured;

  const browserOrigin = String(req.get('origin') || '').trim();
  if (browserOrigin) {
    try {
      const parsed = new URL(browserOrigin);
      if (['http:', 'https:'].includes(parsed.protocol) && parsed.hostname === req.hostname) {
        return parsed.origin;
      }
    } catch {
      // Ignora origens invalidas e usa o host da requisicao.
    }
  }

  return requestOrigin(req);
}

function shareUrlFromRequest(req, product) {
  const url = new URL(`${requestOrigin(req)}${req.baseUrl}/products/${product.id}/share`);
  url.searchParams.set('to', product.url);
  return url.toString();
}

function withShareUrl(req, product) {
  return { ...product, share_url: shareUrlFromRequest(req, product) };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

function shareTargetFromRequest(req) {
  const productPath = `/livraria/produto/${req.params.id}`;
  const configured = String(process.env.PUBLIC_STOREFRONT_URL || '').trim();

  if (configured) return new URL(productPath, `${configured.replace(/\/$/, '')}/`);

  try {
    const requested = new URL(String(req.query.to || ''));
    if (
      ['http:', 'https:'].includes(requested.protocol)
      && requested.hostname === req.hostname
      && requested.pathname === productPath
    ) {
      requested.search = '';
      requested.hash = '';
      return requested;
    }
  } catch {
    // Um destino invalido cai no endereco publico derivado da requisicao.
  }

  return new URL(productPath, `${requestOrigin(req)}/`);
}

function renderSharePreview(product, canonicalUrl, destinationUrl) {
  const title = product.name;
  const description = product.description || `${product.name} na Livraria Shalom.`;
  const imageUrl = new URL(product.images?.[0]?.url || '/shalom.png', canonicalUrl.origin).toString();
  const imageAlt = product.images?.[0]?.alt_text || product.name;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} | Livraria Shalom</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Livraria Shalom">
    <meta property="og:locale" content="pt_BR">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta property="og:image" content="${escapeHtml(imageUrl)}">
    <meta property="og:image:alt" content="${escapeHtml(imageAlt)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
    <meta http-equiv="refresh" content="0;url=${escapeHtml(destinationUrl)}">
  </head>
  <body>
    <p>Redirecionando para <a href="${escapeHtml(destinationUrl)}">${escapeHtml(title)}</a>...</p>
  </body>
</html>`;
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
  return res.json(products.map((product) => withShareUrl(req, product)));
});

router.get('/products/:id', (req, res) => {
  const product = getPublicProduct(req.params.id, baseUrlFromRequest(req));
  if (!product) return res.status(404).json({ message: 'Produto nao encontrado.' });
  return res.json(withShareUrl(req, product));
});

router.get('/products/:id/share', (req, res) => {
  const canonicalUrl = shareTargetFromRequest(req);
  const product = getPublicProduct(req.params.id, canonicalUrl.origin);
  if (!product) return res.status(404).type('html').send('<h1>Produto nao encontrado.</h1>');

  const destinationUrl = new URL(canonicalUrl);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach((parameter) => {
    const value = String(req.query[parameter] || '').trim();
    if (value) destinationUrl.searchParams.set(parameter, value);
  });

  res.set('Cache-Control', 'public, max-age=300');
  return res.type('html').send(renderSharePreview(product, canonicalUrl, destinationUrl));
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
