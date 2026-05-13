const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const { toCsv, toXlsxBuffer, toPdfStream } = require('../services/exportService');

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
    query: 'SELECT * FROM v_movements_sheet ORDER BY data_hora DESC'
  },
  sale_items: {
    title: 'Itens vendidos',
    query: `
      SELECT
        s.created_at AS data_hora,
        si.item_name AS item,
        si.quantity AS quantidade,
        si.unit_price AS preco_unitario,
        si.line_total AS faturamento,
        si.line_profit AS lucro_estimado,
        s.payment_method AS pagamento
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      ORDER BY s.created_at DESC
    `
  }
};

router.use(authenticate);

router.get('/export', async (req, res, next) => {
  try {
    const type = req.query.type || 'sales';
    const format = req.query.format || 'csv';
    const report = reportQueries[type];

    if (!report) return res.status(400).json({ message: 'Relatorio invalido.' });

    const rows = db.prepare(report.query).all();
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
