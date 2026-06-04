const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const { toCsv, toXlsxBuffer, toPdfStream } = require('../services/exportService');
const { formatQuantityWithUnit } = require('../utils/unitFormatter');

const router = express.Router();

const reportQueries = {
  products: {
    title: 'Produtos e estoque',
    query: 'SELECT * FROM v_products_sheet ORDER BY categoria, produto'
  },
  sales: {
    title: 'Historico de vendas',
    query: 'SELECT * FROM v_sales_sheet ORDER BY data_hora DESC'
  },
  movements: {
    title: 'Movimentacao de estoque',
    query: `
      SELECT
        m.id,
        m.created_at AS data_hora,
        p.internal_code AS codigo_produto,
        p.name AS produto,
        p.unit AS unidade,
        m.type AS tipo,
        m.quantity_change AS quantidade,
        m.quantity_before AS antes,
        m.quantity_after AS depois,
        m.expiration_date AS validade,
        m.notes AS observacoes
      FROM inventory_movements m
      JOIN products p ON p.id = m.product_id
      ORDER BY m.created_at DESC
    `
  },
  post_event_inventory: {
    title: 'Inventario pos-evento',
    query: 'SELECT * FROM v_post_event_inventory_sheet ORDER BY registrado_em DESC, categoria, produto'
  },
  sale_items: {
    title: 'Itens vendidos',
    query: `
      SELECT
        s.created_at AS data_hora,
        si.item_name AS item,
        COALESCE(p.unit, 'unidade') AS unidade,
        si.quantity AS quantidade,
        si.unit_price AS preco_unitario,
        si.line_total AS faturamento,
        si.line_profit AS lucro_estimado,
        s.payment_method AS pagamento
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      ORDER BY s.created_at DESC
    `
  }
};

function formatReportRows(type, rows) {
  if (type === 'products') {
    return rows.map((row) => ({
      id: row.id,
      codigo: row.codigo,
      produto: row.produto,
      categoria: row.categoria,
      estoque: row.estoque,
      unidade: row.unidade,
      estoque_formatado: formatQuantityWithUnit(row.estoque, row.unidade),
      estoque_minimo: row.estoque_minimo,
      estoque_minimo_formatado: formatQuantityWithUnit(row.estoque_minimo, row.unidade),
      custo: row.custo,
      preco: row.preco,
      fornecedor: row.fornecedor,
      validade: row.validade,
      status_estoque: row.status_estoque,
      status_validade: row.status_validade,
      atualizado_em: row.atualizado_em
    }));
  }

  if (type === 'movements') {
    return rows.map((row) => ({
      id: row.id,
      data_hora: row.data_hora,
      codigo_produto: row.codigo_produto,
      produto: row.produto,
      tipo: row.tipo,
      quantidade: row.quantidade,
      quantidade_formatada: formatQuantityWithUnit(row.quantidade, row.unidade),
      unidade: row.unidade,
      antes: row.antes,
      antes_formatado: formatQuantityWithUnit(row.antes, row.unidade),
      depois: row.depois,
      depois_formatado: formatQuantityWithUnit(row.depois, row.unidade),
      validade: row.validade,
      observacoes: row.observacoes
    }));
  }

  if (type === 'post_event_inventory') {
    return rows.map((row) => ({
      inventario_id: row.inventario_id,
      evento: row.evento,
      data_evento: row.data_evento,
      registrado_em: row.registrado_em,
      registrado_por: row.registrado_por,
      codigo_produto: row.codigo_produto,
      produto: row.produto,
      categoria: row.categoria,
      quantidade_sistema: row.quantidade_sistema,
      quantidade_sistema_formatada: formatQuantityWithUnit(row.quantidade_sistema, row.unidade),
      quantidade_inventario: row.quantidade_inventario,
      quantidade_inventario_formatada: formatQuantityWithUnit(row.quantidade_inventario, row.unidade),
      diferenca: row.diferenca,
      diferenca_formatada: formatQuantityWithUnit(row.diferenca, row.unidade),
      quantidade_consumida: row.quantidade_consumida,
      quantidade_consumida_formatada: formatQuantityWithUnit(row.quantidade_consumida, row.unidade),
      unidade: row.unidade,
      ajuste_estoque: row.ajuste_estoque,
      observacoes: row.observacoes
    }));
  }

  if (type === 'sale_items') {
    return rows.map((row) => ({
      data_hora: row.data_hora,
      item: row.item,
      quantidade: row.quantidade,
      unidade: row.unidade,
      quantidade_formatada: formatQuantityWithUnit(row.quantidade, row.unidade),
      preco_unitario: row.preco_unitario,
      faturamento: row.faturamento,
      lucro_estimado: row.lucro_estimado,
      pagamento: row.pagamento
    }));
  }

  return rows;
}

router.use(authenticate);

router.get('/export', async (req, res, next) => {
  try {
    const type = req.query.type || 'sales';
    const format = req.query.format || 'csv';
    const report = reportQueries[type];

    if (!report) return res.status(400).json({ message: 'Relatorio invalido.' });

    const rows = formatReportRows(type, db.prepare(report.query).all());
    const filename = `${type}-${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(toCsv(rows));
    }

    if (format === 'xlsx') {
      const buffer = await toXlsxBuffer(rows, report.title);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      return res.send(Buffer.from(buffer));
    }

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      return toPdfStream(rows, report.title).pipe(res);
    }

    return res.status(400).json({ message: 'Formato invalido.' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
