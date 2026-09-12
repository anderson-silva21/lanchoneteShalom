const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (/[",\n;]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const header = columns.map(escapeCsv).join(';');
  const body = rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(';'));
  return [header, ...body].join('\n');
}

async function toXlsxBuffer(rows, sheetName) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Lanchonete Estoque';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(sheetName);

  if (rows.length) {
    worksheet.columns = Object.keys(rows[0]).map((key) => ({
      header: key,
      key,
      width: Math.min(Math.max(key.length + 6, 14), 34)
    }));
    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: Object.keys(rows[0]).length }
    };
  }

  return workbook.xlsx.writeBuffer();
}

function addSummaryRows(worksheet, title, summary = {}) {
  worksheet.addRow([title]);
  worksheet.getCell('A1').font = { bold: true, size: 16 };
  worksheet.addRow([]);
  [
    ['Receita', summary.revenue || 0],
    ['Custo', summary.cost || 0],
    ['Lucro bruto', summary.gross_profit || 0],
    ['Margem', (summary.margin || 0) / 100],
    ['Vendas', summary.sales_count || 0],
    ['Itens vendidos', summary.items_sold || 0],
    ['Ticket medio', summary.average_ticket || 0]
  ].forEach((row) => worksheet.addRow(row));
  worksheet.getColumn(1).width = 24;
  worksheet.getColumn(2).width = 18;
  ['B3', 'B4', 'B5', 'B8'].forEach((cell) => {
    worksheet.getCell(cell).numFmt = '"R$"#,##0.00';
  });
  worksheet.getCell('B6').numFmt = '0.00%';
}

function addRankedTable(worksheet, title, rows, columns) {
  worksheet.addRow([]);
  const titleRow = worksheet.addRow([title]);
  titleRow.font = { bold: true };
  const header = worksheet.addRow(columns.map((column) => column.header));
  header.font = { bold: true };
  rows.forEach((row) => {
    worksheet.addRow(columns.map((column) => row[column.key]));
  });
}

async function toLibraryReportXlsxBuffer({ rows = [], summary = {}, top_products = [], top_revenue_products = [], seller_performance = [], period = {} }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Shalom Store';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Resumo');
  addSummaryRows(summarySheet, 'SHALOM STORE - Relatorio da Livraria', summary);
  summarySheet.addRow([]);
  summarySheet.addRow(['Periodo', [period.start_date, period.end_date].filter(Boolean).join(' a ') || 'Todos']);
  addRankedTable(summarySheet, 'Produtos mais vendidos', top_products, [
    { header: 'Produto', key: 'product_name' },
    { header: 'Quantidade', key: 'quantity_sold' },
    { header: 'Receita', key: 'revenue' },
    { header: 'Lucro', key: 'profit' }
  ]);
  addRankedTable(summarySheet, 'Produtos com maior faturamento', top_revenue_products, [
    { header: 'Produto', key: 'product_name' },
    { header: 'Receita', key: 'revenue' },
    { header: 'Quantidade', key: 'quantity_sold' },
    { header: 'Lucro', key: 'profit' }
  ]);
  addRankedTable(summarySheet, 'Vendas por vendedor', seller_performance, [
    { header: 'Vendedor', key: 'seller_name' },
    { header: 'Vendas', key: 'sales_count' },
    { header: 'Itens', key: 'items_sold' },
    { header: 'Receita', key: 'revenue' },
    { header: 'Ticket medio', key: 'average_ticket' },
    { header: 'Lucro', key: 'profit' }
  ]);

  const salesSheet = workbook.addWorksheet('Vendas');
  const columns = [
    ['data_hora', 'Data/hora', 20],
    ['venda_id', 'Venda', 10],
    ['produto', 'Produto', 32],
    ['categoria', 'Categoria', 20],
    ['quantidade', 'Quantidade', 14],
    ['preco_unitario', 'Preco unitario', 16],
    ['valor_bruto', 'Valor bruto', 16],
    ['desconto', 'Desconto', 14],
    ['valor_liquido', 'Valor liquido', 16],
    ['custo_unitario', 'Custo unitario', 16],
    ['custo_total', 'Custo total', 16],
    ['lucro', 'Lucro', 16],
    ['margem', 'Margem', 12],
    ['forma_pagamento', 'Pagamento', 18],
    ['vendedor', 'Vendedor', 22],
    ['status', 'Status', 14]
  ];
  salesSheet.columns = columns.map(([key, header, width]) => ({ key, header, width }));
  rows.forEach((row) => salesSheet.addRow({
    ...row,
    data_hora: row.data_hora ? new Date(String(row.data_hora).replace(' ', 'T')) : null,
    margem: Number(row.margem || 0) / 100
  }));
  salesSheet.getRow(1).font = { bold: true };
  salesSheet.views = [{ state: 'frozen', ySplit: 1 }];
  salesSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  ['F', 'G', 'H', 'I', 'J', 'K', 'L'].forEach((column) => {
    salesSheet.getColumn(column).numFmt = '"R$"#,##0.00';
  });
  salesSheet.getColumn('M').numFmt = '0.00%';

  return workbook.xlsx.writeBuffer();
}

async function toLibraryStockXlsxBuffer({ rows = [], summary = {} }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Shalom Store';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Resumo');
  summarySheet.addRow(['SHALOM STORE - Relatorio de Estoque da Livraria']);
  summarySheet.getCell('A1').font = { bold: true, size: 16 };
  summarySheet.addRow([]);
  [
    ['Produtos', summary.products_count || 0],
    ['Unidades em estoque', summary.units_in_stock || 0],
    ['Valor em estoque', summary.inventory_value || 0],
    ['Valor potencial', summary.inventory_sale_value || 0],
    ['Lucro potencial', summary.potential_profit || 0]
  ].forEach((row) => summarySheet.addRow(row));
  summarySheet.getColumn(1).width = 24;
  summarySheet.getColumn(2).width = 18;
  ['B5', 'B6', 'B7'].forEach((cell) => {
    summarySheet.getCell(cell).numFmt = '"R$"#,##0.00';
  });

  const stockSheet = workbook.addWorksheet('Estoque');
  const columns = [
    ['produto', 'Produto', 32],
    ['sku', 'SKU', 18],
    ['categoria', 'Categoria', 20],
    ['status', 'Status', 14],
    ['publicado', 'Publicado', 18],
    ['quantidade', 'Quantidade', 14],
    ['custo_unitario', 'Custo unitario', 16],
    ['valor_estoque', 'Valor em estoque', 18],
    ['preco_venda', 'Preco de venda', 16],
    ['valor_potencial', 'Valor potencial', 18],
    ['lucro_potencial', 'Lucro potencial', 18],
    ['ultima_movimentacao', 'Ultima movimentacao', 22],
    ['cadastrado_em', 'Cadastrado em', 22]
  ];
  stockSheet.columns = columns.map(([key, header, width]) => ({ key, header, width }));
  rows.forEach((row) => stockSheet.addRow({
    ...row,
    ultima_movimentacao: row.ultima_movimentacao ? new Date(String(row.ultima_movimentacao).replace(' ', 'T')) : null,
    cadastrado_em: row.cadastrado_em ? new Date(String(row.cadastrado_em).replace(' ', 'T')) : null
  }));
  stockSheet.getRow(1).font = { bold: true };
  stockSheet.views = [{ state: 'frozen', ySplit: 1 }];
  stockSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  ['G', 'H', 'I', 'J', 'K'].forEach((column) => {
    stockSheet.getColumn(column).numFmt = '"R$"#,##0.00';
  });

  return workbook.xlsx.writeBuffer();
}

function toPdfStream(rows, title) {
  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
  doc.fontSize(16).text(title, { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor('#555').text(`Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  doc.moveDown();

  if (!rows.length) {
    doc.fontSize(12).fillColor('#111').text('Nenhum registro encontrado.');
    doc.end();
    return doc;
  }

  const columns = Object.keys(rows[0]).slice(0, 7);
  doc.fontSize(8).fillColor('#111');
  doc.text(columns.join(' | '));
  doc.moveDown(0.4);
  doc.fillColor('#333');

  rows.slice(0, 45).forEach((row) => {
    const line = columns.map((column) => String(row[column] ?? '').slice(0, 28)).join(' | ');
    doc.text(line, { continued: false });
  });

  if (rows.length > 45) {
    doc.moveDown().fillColor('#666').text(`+ ${rows.length - 45} registros no arquivo completo CSV/XLSX.`);
  }

  doc.end();
  return doc;
}

function toLibraryReportPdfStream({ rows = [], summary = {}, top_products = [], seller_performance = [], period = {} }) {
  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
  doc.fontSize(16).fillColor('#111').text('SHALOM STORE');
  doc.fontSize(12).text('Relatorio da Livraria');
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor('#555').text(`Periodo: ${[period.start_date, period.end_date].filter(Boolean).join(' a ') || 'Todos'}`);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  doc.moveDown();

  doc.fillColor('#111').fontSize(10).text([
    `Receita: R$ ${Number(summary.revenue || 0).toFixed(2)}`,
    `Custo: R$ ${Number(summary.cost || 0).toFixed(2)}`,
    `Lucro: R$ ${Number(summary.gross_profit || 0).toFixed(2)}`,
    `Margem: ${Number(summary.margin || 0).toFixed(2)}%`,
    `Vendas: ${summary.sales_count || 0}`,
    `Itens: ${summary.items_sold || 0}`,
    `Ticket medio: R$ ${Number(summary.average_ticket || 0).toFixed(2)}`
  ].join(' | '));
  doc.moveDown();

  doc.fontSize(11).text('Produtos mais vendidos', { underline: true });
  top_products.slice(0, 8).forEach((item) => {
    doc.fontSize(8).text(`${item.product_name} | Qtd ${item.quantity_sold} | Receita R$ ${Number(item.revenue || 0).toFixed(2)} | Lucro R$ ${Number(item.profit || 0).toFixed(2)}`);
  });
  doc.moveDown();
  doc.fontSize(11).text('Vendas por vendedor', { underline: true });
  seller_performance.slice(0, 8).forEach((item) => {
    doc.fontSize(8).text(`${item.seller_name} | ${item.sales_count} vendas | ${item.items_sold} itens | Receita R$ ${Number(item.revenue || 0).toFixed(2)}`);
  });
  doc.moveDown();
  doc.fontSize(11).text('Vendas detalhadas', { underline: true });
  if (!rows.length) {
    doc.fontSize(9).text('Nenhum registro encontrado para os filtros selecionados.');
  } else {
    rows.slice(0, 60).forEach((row) => {
      doc.fontSize(7).text(`#${row.venda_id} | ${row.data_hora} | ${String(row.produto || '').slice(0, 34)} | Qtd ${row.quantidade} | Receita R$ ${Number(row.valor_liquido || 0).toFixed(2)} | Lucro R$ ${Number(row.lucro || 0).toFixed(2)} | ${row.vendedor}`);
    });
    if (rows.length > 60) doc.moveDown().fontSize(8).fillColor('#666').text(`+ ${rows.length - 60} registros no arquivo completo CSV/XLSX.`);
  }
  doc.end();
  return doc;
}

function toLibraryStockPdfStream({ rows = [], summary = {} }) {
  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
  doc.fontSize(16).fillColor('#111').text('SHALOM STORE');
  doc.fontSize(12).text('Relatorio de Estoque da Livraria');
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor('#555').text(`Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  doc.moveDown();
  doc.fillColor('#111').fontSize(10).text([
    `Produtos: ${summary.products_count || 0}`,
    `Unidades: ${summary.units_in_stock || 0}`,
    `Valor em estoque: R$ ${Number(summary.inventory_value || 0).toFixed(2)}`,
    `Valor potencial: R$ ${Number(summary.inventory_sale_value || 0).toFixed(2)}`,
    `Lucro potencial: R$ ${Number(summary.potential_profit || 0).toFixed(2)}`
  ].join(' | '));
  doc.moveDown();
  doc.fontSize(11).text('Estoque atual', { underline: true });

  if (!rows.length) {
    doc.fontSize(9).text('Nenhum produto encontrado para os filtros selecionados.');
  } else {
    rows.slice(0, 70).forEach((row) => {
      doc.fontSize(7).text(`${String(row.produto || '').slice(0, 34)} | ${row.categoria} | Qtd ${row.quantidade} | Custo R$ ${Number(row.custo_unitario || 0).toFixed(2)} | Estoque R$ ${Number(row.valor_estoque || 0).toFixed(2)} | Preco R$ ${Number(row.preco_venda || 0).toFixed(2)} | Potencial R$ ${Number(row.valor_potencial || 0).toFixed(2)}`);
    });
    if (rows.length > 70) doc.moveDown().fontSize(8).fillColor('#666').text(`+ ${rows.length - 70} produtos no arquivo completo CSV/XLSX.`);
  }

  doc.end();
  return doc;
}

module.exports = {
  toCsv,
  toLibraryReportPdfStream,
  toLibraryReportXlsxBuffer,
  toLibraryStockPdfStream,
  toLibraryStockXlsxBuffer,
  toXlsxBuffer,
  toPdfStream
};
