const test = require('node:test');
const assert = require('node:assert/strict');
const { filterSheetRows } = require('../src/routes/spreadsheet');

test('filtros da planilha de vendas combinam busca, periodo e campos do dominio', () => {
  const rows = [
    { venda_id: 1, data_hora: '2026-09-20 10:00:00', operador: 'Anderson', pagamento: 'pix', status_pagamento: 'pago', cliente: 'Maria' },
    { venda_id: 2, data_hora: '2026-09-22 11:00:00', operador: 'Danielle', pagamento: 'dinheiro', status_pagamento: 'pago', cliente: 'Joao' },
    { venda_id: 3, data_hora: '2026-08-10 09:00:00', operador: 'Anderson', pagamento: 'pix', status_pagamento: 'pendente', cliente: 'Clara' }
  ];

  const result = filterSheetRows('vendas', rows, {
    q: 'maria',
    start_date: '2026-09-01',
    end_date: '2026-09-30',
    operador: 'Anderson',
    pagamento: 'pix',
    status_pagamento: 'pago'
  });

  assert.deepEqual(result.map((row) => row.venda_id), [1]);
});

test('filtros de estoque usam somente campos suportados pela aba', () => {
  const rows = [
    { id: 1, produto: 'Coxinha', categoria: 'Salgados', status_estoque: 'normal', status_validade: 'ok' },
    { id: 2, produto: 'Suco', categoria: 'Bebidas', status_estoque: 'atencao', status_validade: 'vence_7_dias' }
  ];

  assert.deepEqual(filterSheetRows('produtos', rows, { categoria: 'Bebidas' }).map((row) => row.id), [2]);
  assert.equal(filterSheetRows('produtos', rows, { operador: 'Anderson' }).length, 2);
});

test('itens vendidos podem ser filtrados pelo contexto da venda', () => {
  const rows = [
    { id: 1, venda_id: 10, item: 'Coxinha', operador: 'Anderson', pagamento: 'pix', status_pagamento: 'pago' },
    { id: 2, venda_id: 11, item: 'Suco', operador: 'Danielle', pagamento: 'dinheiro', status_pagamento: 'pago' }
  ];

  const result = filterSheetRows('itens_vendidos', rows, { operador: 'Danielle', pagamento: 'dinheiro' });
  assert.deepEqual(result.map((row) => row.id), [2]);
});
