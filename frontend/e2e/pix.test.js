import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import process from 'node:process'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const { gerarPix } = createRequire(import.meta.url)('../../backend/src/utils/pix.js')

test('Pix usa a API configurada, mostra o QR Code e preserva o foco ao fechar', async (t) => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
  t.after(() => server.close())
  await server.listen()
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
  t.after(() => browser.close())
  const page = await browser.newPage()
  const requests = []
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/pix/gerar')) {
      requests.push(request)
      await route.fulfill({ json: gerarPix(request.postDataJSON().amountCents) })
    } else {
      await route.fulfill({ json: path.endsWith('/products')
        ? [{ id: 1, name: 'Produto Pix', sale_price: 12.34, stock_quantity: 10, unit: 'unidade' }]
        : [] })
    }
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/e2e/pending-sale.html`)
  await page.getByRole('button', { name: 'Adicionar Produto Pix', exact: true }).click()
  await page.getByRole('button', { name: 'Cliente', exact: true }).click()
  await page.getByRole('combobox').selectOption('pix')
  await page.getByRole('button', { name: /pagamento.*12,34/ }).click()
  const trigger = page.getByRole('button', { name: 'Abrir QR Code do Pix' })
  await trigger.click()
  const image = page.getByAltText('QR Code para pagamento Pix')
  await image.waitFor()
  assert.match(await image.getAttribute('src'), /^data:image\/png;base64,/)
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0].postDataJSON(), { amountCents: 1234 })
  assert.equal(new URL(requests[0].url()).port, '4000')
  const close = page.getByRole('button', { name: 'Fechar QR Code', exact: true })
  assert.equal(await close.evaluate((element) => element === document.activeElement), true)
  await page.keyboard.press('Tab')
  assert.equal(await close.evaluate((element) => element === document.activeElement), true)
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog', { name: 'Confirmar venda' }).count(), 1)
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true)
})
