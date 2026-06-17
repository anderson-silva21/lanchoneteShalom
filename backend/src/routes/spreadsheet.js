const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { confirmSalePayment } = require('../services/salesService');
const { roundQuantity, sameQuantity, setProductStock } = require('../services/stockService');

const router = express.Router();

const sheets = {
  produtos: {
    label: 'Produtos',
    query: 'SELECT * FROM v_products_sheet ORDER BY categoria, produto'
  },
  lotes: {
    label: 'Lotes',
    query: 'SELECT * FROM v_stock_batches_sheet ORDER BY produto, date(validade), lote_id'
  },
  vendas: {
    label: 'Vendas',
    query: 'SELECT * FROM v_sales_sheet ORDER BY data_hora DESC LIMIT 1000'
  },
  itens_vendidos: {
    label: 'Itens vendidos',
    query: `
      SELECT
        si.id,
        s.created_at AS data_hora,
        si.item_name AS item,
        si.quantity AS quantidade,
        si.unit_price AS preco_unitario,
        si.unit_cost AS custo_unitario,
        si.line_total AS total,
        si.line_profit AS lucro
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      ORDER BY s.created_at DESC
      LIMIT 1000
    `
  },
  movimentacoes: {
    label: 'Movimentacoes',
    query: 'SELECT * FROM v_movements_sheet ORDER BY data_hora DESC LIMIT 1000'
  },
  inventarios_evento: {
    label: 'Inventarios',
    query: 'SELECT * FROM v_post_event_inventory_sheet ORDER BY registrado_em DESC LIMIT 1000'
  },
  indicadores: {
    label: 'Indicadores',
    query: `
      SELECT 'faturamento_total' AS metrica, COALESCE(SUM(total), 0) AS valor FROM sales
      UNION ALL
      SELECT 'lucro_estimado_total', COALESCE(SUM(estimated_profit), 0) FROM sales
      UNION ALL
      SELECT 'produtos_ativos', COUNT(*) FROM products WHERE active = 1
      UNION ALL
      SELECT 'itens_estoque_baixo', COUNT(*) FROM products WHERE active = 1 AND stock_quantity <= min_stock
    `
  }
};

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getRequestedNotes(body) {
  if (hasOwn(body, 'observacoes')) return body.observacoes;
  if (hasOwn(body, 'notes')) return body.notes;
  return undefined;
}

function normalizeNotes(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim() || null;
}

function requireAdminForNotes(req, res) {
  if (req.user.role === 'admin') return true;
  res.status(403).json({ message: 'Somente administradores podem alterar observacoes.' });
  return false;
}

router.use(authenticate, requireScreen('sheet'));

router.get('/sheets', (req, res) => {
  return res.json(Object.entries(sheets).map(([key, sheet]) => ({
    key,
    label: sheet.label
  })));
});

router.get('/:sheet', (req, res) => {
  const sheet = sheets[req.params.sheet];
  if (!sheet) return res.status(404).json({ message: 'Aba nao encontrada.' });
  return res.json(db.prepare(sheet.query).all());
});

router.patch('/produtos/:id', requireScreen('products'), (req, res) => {
  const allowed = {
    produto: 'name',
    categoria: 'category',
    unidade: 'unit',
    custo: 'cost_price',
    preco: 'sale_price',
    estoque_minimo: 'min_stock',
    fornecedor: 'supplier',
    codigo: 'internal_code'
  };

  const assignments = [];
  const params = {};

  Object.entries(req.body).forEach(([key, value]) => {
    const column = allowed[key];
    if (!column) return;
    assignments.push(`${column} = @${column}`);
    params[column] = value;
  });

  const requestedStock = req.body.estoque !== undefined && req.body.estoque !== ''
    ? roundQuantity(req.body.estoque)
    : null;

  if (!assignments.length && requestedStock === null) {
    return res.status(400).json({ message: 'Nenhum campo editavel enviado.' });
  }

  const nonnegativeColumns = ['cost_price', 'sale_price', 'min_stock'];
  const invalidNumber = nonnegativeColumns.some((column) => params[column] !== undefined && Number(params[column]) < 0);
  if (invalidNumber || (requestedStock !== null && requestedStock < 0)) return res.status(400).json({ message: 'Valores numericos nao podem ser negativos.' });

  if (req.body.validade && !/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.validade))) {
    return res.status(400).json({ message: 'Validade invalida.' });
  }

  params.id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(params.id);
  if (!current) return res.status(404).json({ message: 'Produto nao encontrado.' });

  const transaction = db.transaction(() => {
    if (assignments.length) {
      db.prepare(`UPDATE products SET ${assignments.join(', ')} WHERE id = @id`).run(params);
    }

    if (requestedStock !== null && !sameQuantity(requestedStock, current.stock_quantity)) {
      setProductStock({
        productId: params.id,
        physicalQuantity: requestedStock,
        expectedQuantity: current.stock_quantity,
        referenceType: 'spreadsheet',
        notes: 'Ajuste pela planilha central',
        userId: req.user.id,
        expirationDate: req.body.validade || null
      });
    }
  });

  transaction();
  return res.json(db.prepare('SELECT * FROM v_products_sheet WHERE id = ?').get(req.params.id));
});

router.patch('/vendas/:id', requireScreen('sales'), (req, res) => {
  const requestedNotes = getRequestedNotes(req.body);
  const hasNotesUpdate = requestedNotes !== undefined;
  const hasPaymentUpdate = hasOwn(req.body, 'pagamento') || hasOwn(req.body, 'payment_method') || hasOwn(req.body, 'status_pagamento') || hasOwn(req.body, 'payment_status');

  if (!hasNotesUpdate && !hasPaymentUpdate) {
    return res.status(400).json({ message: 'Nenhum campo editavel enviado.' });
  }

  if (hasNotesUpdate) {
    if (!requireAdminForNotes(req, res)) return undefined;
    const result = db.prepare('UPDATE sales SET notes = ? WHERE id = ?').run(normalizeNotes(requestedNotes), req.params.id);
    if (!result.changes) return res.status(404).json({ message: 'Venda nao encontrada.' });
  }

  if (!hasPaymentUpdate) {
    return res.json(db.prepare('SELECT * FROM v_sales_sheet WHERE venda_id = ?').get(req.params.id));
  }

  const paymentMethod = String(req.body.pagamento || req.body.payment_method || '').trim();
  const paymentStatus = String(req.body.status_pagamento || req.body.payment_status || '').trim();

  if (paymentStatus && !['pago', 'paid'].includes(paymentStatus)) {
    return res.status(400).json({ message: 'Altere o status da venda para pago antes de confirmar.' });
  }

  confirmSalePayment(Number(req.params.id), paymentMethod, req.user.id);
  return res.json(db.prepare('SELECT * FROM v_sales_sheet WHERE venda_id = ?').get(req.params.id));
});

router.patch('/movimentacoes/:id', (req, res) => {
  const requestedNotes = getRequestedNotes(req.body);
  if (requestedNotes === undefined) return res.status(400).json({ message: 'Nenhum campo editavel enviado.' });
  if (!requireAdminForNotes(req, res)) return undefined;

  const result = db.prepare('UPDATE inventory_movements SET notes = ? WHERE id = ?').run(normalizeNotes(requestedNotes), req.params.id);
  if (!result.changes) return res.status(404).json({ message: 'Movimentacao nao encontrada.' });

  return res.json(db.prepare('SELECT * FROM v_movements_sheet WHERE id = ?').get(req.params.id));
});

module.exports = router;
