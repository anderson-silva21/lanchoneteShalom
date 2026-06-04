const express = require('express');
const { db } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const sheets = {
  produtos: {
    label: 'Produtos',
    query: 'SELECT * FROM v_products_sheet ORDER BY categoria, produto'
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

router.use(authenticate);

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

router.patch('/produtos/:id', requireRole('admin', 'manager'), (req, res) => {
  const allowed = {
    produto: 'name',
    categoria: 'category',
    unidade: 'unit',
    custo: 'cost_price',
    preco: 'sale_price',
    estoque: 'stock_quantity',
    estoque_minimo: 'min_stock',
    fornecedor: 'supplier',
    validade: 'expiration_date',
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

  if (!assignments.length) return res.status(400).json({ message: 'Nenhum campo editavel enviado.' });

  const nonnegativeColumns = ['cost_price', 'sale_price', 'stock_quantity', 'min_stock'];
  const invalidNumber = nonnegativeColumns.some((column) => params[column] !== undefined && Number(params[column]) < 0);
  if (invalidNumber) return res.status(400).json({ message: 'Valores numericos nao podem ser negativos.' });

  if (params.expiration_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(params.expiration_date))) {
    return res.status(400).json({ message: 'Validade invalida.' });
  }

  params.id = Number(req.params.id);
  db.prepare(`UPDATE products SET ${assignments.join(', ')} WHERE id = @id`).run(params);
  return res.json(db.prepare('SELECT * FROM v_products_sheet WHERE id = ?').get(req.params.id));
});

module.exports = router;
