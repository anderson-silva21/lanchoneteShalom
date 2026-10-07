import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let server
let browser
let baseUrl
before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
  await server.listen()
  baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true })
})
after(async () => {
  await browser?.close()
  await server?.close()
})

async function invalid(field) {
  await field.page().waitForFunction((element) => element.getAttribute('aria-invalid') === 'true', await field.elementHandle())
  const description = await field.getAttribute('aria-describedby')
  assert.ok(description)
  const message = await field.page().locator(`[id="${description.split(' ').at(-1)}"]`).textContent()
  assert.ok(message.trim())
  return message
}

const pendingCustomerMessage = 'Informe o nome do cliente para registrar uma venda com pagamento pendente.'

async function openPendingSale(t, { width = 390, productCount = 1, rejectCustomer = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 600 } })
  t.after(() => page.close())
  const sales = []
  const products = Array.from({ length: productCount }, (_, index) => ({ id: index + 1, name: `Produto ${index + 1}`, category: 'Alimentos', sale_price: 10, stock_quantity: 10, unit: 'unidade' }))
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/sales') && route.request().method() === 'POST') {
      sales.push(route.request().postDataJSON())
      if (rejectCustomer && sales.length === 1) await route.fulfill({ status: 400, json: { message: 'Dados invalidos.', issues: [{ code: 'custom', path: ['customer_name'], message: pendingCustomerMessage }] } })
      else await route.fulfill({ json: { id: 123, total: productCount * 10 } })
    } else await route.fulfill({ json: path.endsWith('/products') ? products : [] })
  })
  await page.goto(`${baseUrl}/e2e/pending-sale.html`)
  for (const product of products) await page.getByRole('button', { name: `Adicionar ${product.name}`, exact: true }).click()
  await page.getByRole('button', { name: 'Cliente', exact: true }).click()
  await page.getByRole('combobox').selectOption('pagamento_pendente')
  return { page, sales }
}

test('pagamento pendente: cliente vazio recebe destaque, mensagem, foco e permite correcao', async (t) => {
  const { page, sales } = await openPendingSale(t)
  const customer = page.getByPlaceholder('Nome de quem ficou pendente')
  await page.getByLabel('Observacoes', { exact: true }).fill('Manter observacao da venda')
  await page.getByRole('button', { name: /pagamento.*10,00/ }).click()
  assert.equal(sales.length, 0)
  assert.equal(await page.getByRole('dialog', { name: 'Confirmar venda' }).count(), 0)
  const highlighted = await customer.getAttribute('aria-invalid')
  await page.screenshot({ path: join(tmpdir(), `shalom-pending-sale-${highlighted === 'true' ? 'green' : 'red'}.png`), fullPage: true })
  assert.equal(highlighted, 'true', 'O nome obrigatorio deve receber aria-invalid e o destaque de erro')
  assert.equal(await invalid(customer), pendingCustomerMessage)
  assert.equal(await customer.evaluate((element) => element === document.activeElement), true)
  assert.equal(await customer.evaluate((element) => getComputedStyle(element).borderTopWidth), '2px')
  const messageId = (await customer.getAttribute('aria-describedby')).split(' ').at(-1)
  assert.equal(await page.locator(`[id="${messageId}"] svg`).count(), 1)
  await customer.fill('   ')
  assert.equal(await invalid(customer), pendingCustomerMessage)
  await customer.fill('Maria')
  await page.waitForFunction(() => !document.querySelector('[name="customer_name"]').hasAttribute('aria-invalid'))
  assert.equal(await page.locator('[name="notes"]').inputValue(), 'Manter observacao da venda')
  assert.equal(await page.getByRole('combobox').inputValue(), 'pagamento_pendente')
  await page.getByRole('button', { name: /pagamento.*10,00/ }).click()
  await page.getByRole('dialog', { name: 'Confirmar venda' }).getByRole('button', { name: 'Confirmar venda', exact: true }).click()
  await page.getByText('Venda #123 registrada:', { exact: false }).waitFor()
  assert.deepEqual(sales, [{ payment_method: 'pagamento_pendente', customer_name: 'Maria', notes: 'Manter observacao da venda', items: [{ product_id: 1, quantity: 1 }] }])
})

test('pagamento pendente: campo invalido fora da tela recebe foco e rolagem', async (t) => {
  const { page, sales } = await openPendingSale(t, { productCount: 8 })
  const customer = page.getByPlaceholder('Nome de quem ficou pendente')
  await page.evaluate(() => window.scrollTo(0, 0))
  assert.equal(await customer.evaluate((element) => element.getBoundingClientRect().top >= window.innerHeight), true)
  await page.getByRole('button', { name: /pagamento.*80,00/ }).click()
  assert.equal(await invalid(customer), pendingCustomerMessage)
  assert.equal(await customer.evaluate((element) => element === document.activeElement), true)
  const rect = await customer.boundingBox()
  assert.ok(rect.y >= 0 && rect.y + rect.height < 600, 'O campo deve ficar inteiramente dentro da tela')
  assert.equal(await customer.evaluate((element) => document.elementFromPoint(element.getBoundingClientRect().left + 10, element.getBoundingClientRect().top + 10) === element), true, 'O campo nao pode ficar coberto pela barra de acao')
  assert.equal(sales.length, 0)
  await page.screenshot({ path: join(tmpdir(), 'shalom-pending-sale-scroll.png') })
})

test('pagamento pendente: erro da API volta ao cliente e preserva a venda para tentar novamente', async (t) => {
  const { page, sales } = await openPendingSale(t, { rejectCustomer: true, width: 1280 })
  const customer = page.getByPlaceholder('Nome de quem ficou pendente')
  await customer.fill('Maria')
  await page.locator('[name="notes"]').fill('Preservar dados apos rejeicao')
  await page.getByRole('button', { name: /pagamento.*10,00/ }).click()
  await page.getByRole('dialog', { name: 'Confirmar venda' }).getByRole('button', { name: 'Confirmar venda', exact: true }).click()
  assert.equal(await invalid(customer), pendingCustomerMessage)
  assert.equal(await page.getByRole('dialog', { name: 'Confirmar venda' }).count(), 0)
  assert.equal(await customer.evaluate((element) => element === document.activeElement), true)
  assert.equal(await customer.inputValue(), 'Maria')
  assert.equal(await page.locator('[name="notes"]').inputValue(), 'Preservar dados apos rejeicao')
  await page.screenshot({ path: join(tmpdir(), 'shalom-pending-sale-api.png'), fullPage: true })
  await customer.fill('Maria Silva')
  await page.waitForFunction(() => !document.querySelector('[name="customer_name"]').hasAttribute('aria-invalid'))
  await page.getByRole('button', { name: /pagamento.*10,00/ }).click()
  await page.getByRole('dialog', { name: 'Confirmar venda' }).getByRole('button', { name: 'Confirmar venda', exact: true }).click()
  await page.getByText('Venda #123 registrada:', { exact: false }).waitFor()
  assert.equal(sales.length, 2)
  assert.deepEqual(sales[1], { ...sales[0], customer_name: 'Maria Silva' })
})

test('outras formas de pagamento continuam permitindo venda sem cliente', async (t) => {
  for (const payment of ['pix', 'dinheiro', 'cartao']) {
    const { page, sales } = await openPendingSale(t)
    await page.getByRole('button', { name: /pagamento.*10,00/ }).click()
    assert.equal(await invalid(page.getByPlaceholder('Nome de quem ficou pendente')), pendingCustomerMessage)
    await page.getByRole('combobox').selectOption(payment)
    assert.equal(await page.locator('[name="customer_name"]').count(), 0)
    await page.getByRole('button', { name: /pagamento.*10,00/ }).click()
    await page.getByRole('dialog', { name: 'Confirmar venda' }).getByRole('button', { name: 'Confirmar venda', exact: true }).click()
    await page.getByText('Venda #123 registrada:', { exact: false }).waitFor()
    assert.equal(sales.length, 1)
    assert.equal(sales[0].payment_method, payment)
    assert.equal(sales[0].customer_name, null)
  }
})
