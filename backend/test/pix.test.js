const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

test('a rota registrada no servidor gera Pix e rejeita entradas invalidas', async (t) => {
  const source = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
  const routePath = source.match(/const pixRoutes = require\('([^']+)'\)/)[1];
  const app = express();
  app.use(express.json());
  app.use('/api/pix', require(path.resolve(__dirname, '../src', routePath)));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/pix/gerar`;
  const post = (body) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const response = await post({ amountCents: 1234 });
  assert.equal(response.status, 200);
  const { payload, txid } = await response.json();
  assert.match(txid, /^[A-Z0-9]{1,25}$/);
  const fields = {};
  let offset = 0;
  while (offset < payload.length) {
    const id = payload.slice(offset, offset + 2);
    const length = Number(payload.slice(offset + 2, offset + 4));
    assert.ok(Number.isInteger(length) && length >= 0);
    fields[id] = payload.slice(offset + 4, offset + 4 + length);
    offset += 4 + length;
  }
  assert.equal(offset, payload.length);
  assert.equal(fields['54'], '12.34');
  assert.equal(fields['62'], `05${String(txid.length).padStart(2, '0')}${txid}`);
  let crc = 0xffff;
  for (const byte of Buffer.from(payload.slice(0, -4))) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
    }
  }
  assert.equal(fields['63'], crc.toString(16).toUpperCase().padStart(4, '0'));

  for (const body of [undefined, {}, { amountCents: 0 }, { amountCents: 1.5 }, { amountCents: 100, saleId: 'invalid' }]) {
    const invalid = await post(body);
    assert.equal(invalid.status, 400);
    assert.equal(typeof (await invalid.json()).message, 'string');
  }
});
