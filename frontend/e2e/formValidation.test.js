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

async function open(t, screen = '', width = 1280) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  t.after(() => page.close())
  await page.goto(`${baseUrl}/e2e/forms.html?screen=${screen}`)
  return page
}

async function invalid(field) {
  await field.page().waitForFunction((element) => element.getAttribute('aria-invalid') === 'true', await field.elementHandle())
  const description = await field.getAttribute('aria-describedby')
  assert.ok(description)
  const message = await field.page().locator(`[id="${description.split(' ').at(-1)}"]`).textContent()
  assert.ok(message.trim())
  return message
}

test('login: obrigatorios, foco, preservacao e correcao por campo', async (t) => {
  const page = await open(t, 'login')
  const username = page.locator('[name="username"]')
  const password = page.locator('[name="password"]')
  await password.fill('senha-preenchida')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  assert.match(await invalid(username), /Preencha Usuario/)
  assert.equal(await username.evaluate((element) => element === document.activeElement), true)
  assert.equal(await password.inputValue(), 'senha-preenchida')
  await username.fill('anderson')
  await page.waitForFunction(() => !document.querySelector('[name="username"]').hasAttribute('aria-invalid'))
  await username.fill('   ')
  assert.match(await invalid(username), /Preencha/)
})

test('senha: tamanho, confirmacao, dependencia e erro do servidor', async (t) => {
  const page = await open(t, 'password')
  const current = page.locator('[name="current_password"]')
  const next = page.locator('[name="new_password"]')
  const confirm = page.locator('[name="confirm_password"]')
  await current.fill('temporaria')
  await next.fill('123')
  await confirm.fill('diferente')
  await page.getByRole('button', { name: 'Salvar nova senha' }).click()
  assert.match(await invalid(next), /6 caracteres/)
  assert.match(await invalid(confirm), /Repita/)
  await next.fill('diferente')
  await page.waitForFunction(() => document.querySelectorAll('[aria-invalid="true"]').length === 0)
  await page.getByRole('button', { name: 'Salvar nova senha' }).click()
  assert.match(await invalid(current), /senha temporaria/)
  assert.equal(await current.evaluate((element) => element === document.activeElement), true)
  await next.fill('outrovalor')
  assert.match(await invalid(confirm), /Repita/)
  assert.equal(await current.getAttribute('aria-invalid'), 'true')
  await current.fill('corrigida')
  await page.waitForFunction(() => !document.querySelector('[name="current_password"]').hasAttribute('aria-invalid'))
})

for (const width of [1280, 390]) {
  test(`campos: select, numero, URL, mensagens e layout em ${width}px`, async (t) => {
    const page = await open(t, '', width)
    const name = page.locator('[name="name"]')
    const category = page.locator('[name="category"]')
    const quantity = page.locator('[name="quantity"]')
    const image = page.locator('[name="images.0.url"]')
    await name.fill('A')
    await quantity.fill('-1')
    await image.fill('nao-e-url')
    await page.getByRole('button', { name: 'Salvar', exact: true }).click()
    assert.match(await invalid(name), /2 caracteres/)
    assert.match(await invalid(category), /Preencha Categoria/)
    assert.match(await invalid(quantity), /maior ou igual a 0.001/)
    assert.match(await invalid(image), /URL completa/)
    assert.equal(await name.evaluate((element) => element === document.activeElement), true)
    assert.equal(await name.evaluate((element) => getComputedStyle(element).borderTopWidth), '2px')
    assert.ok((await image.getAttribute('aria-describedby')).includes('image-hint'))
    await page.screenshot({ path: join(tmpdir(), `shalom-validation-${width}.png`), fullPage: true })
    await name.fill('Produto')
    await category.selectOption('Livros')
    await quantity.fill('1.0005')
    assert.match(await invalid(quantity), /incrementos/)
    await quantity.fill('2')
    await image.fill('ftp://exemplo.com/imagem.jpg')
    assert.match(await invalid(image), /HTTP ou HTTPS/)
    await image.fill('https://exemplo.com/imagem.jpg')
    await page.waitForFunction(() => document.querySelectorAll('[aria-invalid="true"]').length === 0)
    await page.getByRole('button', { name: 'Salvar', exact: true }).click()
    await page.getByRole('status').waitFor()
    assert.equal(await quantity.inputValue(), '2')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  })
}

test('servidor: caminhos Zod aninhados e correcao independente', async (t) => {
  const page = await open(t)
  await page.locator('[name="name"]').fill('Duplicado')
  await page.locator('[name="category"]').selectOption('Livros')
  await page.locator('[name="quantity"]').fill('2')
  await page.locator('[name="images.0.url"]').fill('https://exemplo.com/a.jpg')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  assert.match(await invalid(page.locator('[name="name"]')), /ja existe/)
  assert.match(await invalid(page.locator('[name="images.0.url"]')), /URL/)
  await page.locator('[name="notes"]').fill('Valores preservados')
  assert.equal(await page.locator('[name="name"]').getAttribute('aria-invalid'), 'true')
  await page.locator('[name="name"]').fill('Unico')
  await page.waitForFunction(() => !document.querySelector('[name="name"]').hasAttribute('aria-invalid'))
  assert.equal(await page.locator('[name="images.0.url"]').getAttribute('aria-invalid'), 'true')
})

test('livraria: contato invalido e resposta real da API junto ao campo', async (t) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  t.after(() => page.close())
  await page.addInitScript(() => localStorage.setItem('shalom_library_cart_v1', JSON.stringify({ items: [{ product_id: 1, name: 'Livro', price: 20, quantity: 1 }], requestKey: 'validation-request-001' })))
  let requests = 0
  await page.route('**/api/public/library/**', async (route) => {
    if (route.request().method() === 'POST') {
      requests++
      await route.fulfill({ status: 400, json: { message: 'Dados invalidos.', issues: [{ path: ['customer_contact'], code: 'custom', message: 'Confira o DDD deste contato.' }] } })
    } else await route.fulfill({ json: [] })
  })
  await page.goto(`${baseUrl}/e2e/forms.html?screen=storefront`)
  await page.locator('header button:visible').click()
  await page.getByRole('button', { name: 'Continuar pelo WhatsApp' }).click()
  await page.getByRole('button', { name: 'Falar com a Livraria' }).click()
  const name = page.locator('[name="customer_name"]')
  const contact = page.locator('[name="customer_contact"]')
  assert.match(await invalid(name), /Preencha/)
  assert.equal(await name.evaluate((element) => element === document.activeElement), true)
  await name.fill('Maria')
  await contact.fill('abcdefghijk')
  assert.match(await invalid(contact), /numeros/)
  assert.equal(requests, 0)
  await contact.fill('(11) 99999-9999')
  await page.getByRole('button', { name: 'Falar com a Livraria' }).click()
  assert.match(await invalid(contact), /Confira o DDD/)
  assert.equal(await contact.evaluate((element) => element === document.activeElement), true)
  assert.equal(await name.inputValue(), 'Maria')
  assert.equal(await contact.inputValue(), '(11) 99999-9999')
  await contact.fill('(21) 99999-9999')
  await page.waitForFunction(() => !document.querySelector('[name="customer_contact"]').hasAttribute('aria-invalid'))
  await page.screenshot({ path: join(tmpdir(), 'shalom-storefront-validation.png'), fullPage: true })
})

test('produto real: protocolo da imagem, unidade e erro do servidor', async (t) => {
  const page = await open(t, 'product', 390)
  const image = page.locator('[name="image_url"]')
  const unit = page.locator('[name="unit"]')
  await image.fill('ftp://exemplo.com/imagem.jpg')
  await unit.fill('')
  await page.getByRole('button', { name: 'Salvar produto' }).click()
  assert.match(await invalid(image), /HTTP ou HTTPS/)
  assert.match(await invalid(unit), /Preencha Unidade/)
  assert.equal(await page.locator('[name="name"]').inputValue(), 'Produto')
  await image.fill('https://exemplo.com/imagem.jpg')
  await unit.fill('unidade')
  await page.getByRole('button', { name: 'Salvar produto' }).click()
  assert.match(await invalid(unit), /nao esta disponivel/)
  assert.equal(await unit.evaluate((element) => element === document.activeElement), true)
  await unit.fill('kg')
  await page.waitForFunction(() => !document.querySelector('[name="unit"]').hasAttribute('aria-invalid'))
})

test('cadastro real: URL HTTP e erro da API associados a imagem', async (t) => {
  const page = await open(t, 'create-product')
  const image = page.locator('[name="image_url"]')
  await image.fill('ftp://exemplo.com/imagem.jpg')
  await page.getByRole('button', { name: 'Cadastrar', exact: true }).click()
  assert.match(await invalid(image), /HTTP ou HTTPS/)
  assert.equal(await image.evaluate((element) => element === document.activeElement), true)
  await image.fill('https://exemplo.com/imagem.jpg')
  await page.waitForFunction(() => !document.querySelector('[name="image_url"]').hasAttribute('aria-invalid'))
  await page.getByRole('button', { name: 'Cadastrar', exact: true }).click()
  assert.match(await invalid(image), /Informe outra URL/)
  assert.equal(await image.evaluate((element) => getComputedStyle(element).borderTopWidth), '2px')
  assert.equal(await page.locator('[name="name"]').inputValue(), 'Produto')
  await image.fill('https://exemplo.com/outra.jpg')
  await page.waitForFunction(() => !document.querySelector('[name="image_url"]').hasAttribute('aria-invalid'))
})

test('estoque real: lote obrigatorio e correcao sem perder quantidade', async (t) => {
  const page = await open(t, 'stock', 390)
  await page.getByRole('button', { name: 'Salvar movimento' }).click()
  const batch = page.locator('[name="batch_id"]')
  assert.match(await invalid(batch), /Preencha Lote/)
  assert.equal(await batch.evaluate((element) => element === document.activeElement), true)
  assert.equal(await page.locator('[name="quantity"]').inputValue(), '1')
  await batch.selectOption('1')
  await page.getByRole('button', { name: 'Salvar movimento' }).click()
  await page.locator('form[data-saved="true"]').waitFor()
})

async function mockAdminApi(page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let payload = []
    if (path.endsWith('/spreadsheet/options')) payload = { products: [], categories: [], sellers: [], payment_methods: [], statuses: [] }
    else if (path.endsWith('/spreadsheet')) payload = { rows: [], summary: {}, pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 } }
    else if (path.endsWith('/seller-monitoring')) payload = { sellers: [], unassigned_pending: 0 }
    else if (path.endsWith('/dashboard') || path.includes('/system/')) payload = {}
    if (route.request().method() === 'POST') await route.fulfill({ status: 409, json: { message: 'Usuario existente.', fieldErrors: { username: 'Este usuario ja existe. Escolha outro.' } } })
    else await route.fulfill({ json: payload })
  })
}

test('filtro real: todos os produtos continua sendo opcional', async (t) => {
  const page = await browser.newPage()
  t.after(() => page.close())
  await mockAdminApi(page)
  await page.goto(`${baseUrl}/e2e/forms.html?screen=filters`)
  await page.locator('[name="start_date"]').fill('2026-10-01')
  assert.equal(await page.locator('[name="product_id"]').inputValue(), '')
  await page.getByRole('button', { name: 'Aplicar filtros' }).click()
  await page.getByRole('tablist', { name: 'Planilhas da Livraria' }).waitFor()
  assert.equal(await page.locator('[aria-invalid="true"]').count(), 0)
})

test('usuarios real: formato, erro da API e correcao', async (t) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  t.after(() => page.close())
  await mockAdminApi(page)
  await page.goto(`${baseUrl}/e2e/forms.html?screen=settings`)
  await page.locator('[name="name"]').fill('Maria')
  const username = page.locator('[name="username"]')
  await username.fill('usuario invalido')
  await page.getByRole('button', { name: 'Criar', exact: true }).click()
  assert.match(await invalid(username), /letras minusculas/)
  await username.fill('MARIA')
  assert.equal(await username.inputValue(), 'maria')
  await page.waitForFunction(() => !document.querySelector('[name="username"]').hasAttribute('aria-invalid'))
  await page.getByRole('button', { name: 'Criar', exact: true }).click()
  assert.match(await invalid(username), /ja existe/)
  assert.equal(await page.locator('[name="name"]').inputValue(), 'Maria')
  await username.fill('maria2')
  await page.waitForFunction(() => !document.querySelector('[name="username"]').hasAttribute('aria-invalid'))
})

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
  await page.goto(`${baseUrl}/e2e/forms.html?screen=sales`)
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
