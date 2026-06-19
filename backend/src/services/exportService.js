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

module.exports = {
  toCsv,
  toXlsxBuffer,
  toPdfStream
};
