import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium } from 'playwright'
import { createServer } from 'vite'

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

async function openApp(user, path = '/gestao-irmaos', viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  await page.addInitScript((currentUser) => {
    localStorage.setItem('lanchonete_token', 'test-token')
    localStorage.setItem('lanchonete_user', JSON.stringify(currentUser))
  }, user)
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { user } })
    if (url.pathname.endsWith('/brothers/groups') || url.pathname.endsWith('/brothers/ministries')) return route.fulfill({ json: [] })
    if (url.pathname.endsWith('/brothers/1/followups')) return route.fulfill({ status: 403, json: { message: 'Acesso restrito.' } })
    if (url.pathname.endsWith('/brothers/1')) return route.fulfill({ json: {
      id: 1, full_name: 'Irmã Exemplo', preferred_name: 'Maria Exemplo', birth_date: '1988-05-14',
      phone: '(11) 99999-9999', email: 'maria@example.test', status: 'active', groups: [], ministries: [], history: []
    } })
    if (url.pathname.endsWith('/brothers')) return route.fulfill({ json: {
      items: [{ id: 1, full_name: 'Irmã Exemplo', preferred_name: 'Maria Exemplo', status: 'active', groups: '', ministries: '' }],
      pagination: { page: 1, page_size: 25, total: 1, total_pages: 1 }
    } })
    if (url.pathname.endsWith('/analytics/dashboard')) return route.fulfill({ status: 503, json: { message: 'Dashboard indisponivel durante este teste.' } })
    return route.fulfill({ json: {} })
  })
  await page.goto(`${baseUrl}${path}`)
  return page
}

test('permissao explicita mostra navegacao e abre o perfil sem expor acompanhamentos', async (t) => {
  const page = await openApp({ id: 8, name: 'Maria', role: 'cashier', roles: ['cashier'], brother_permissions: ['brothers:read'] })
  t.after(() => page.close())
  await page.getByRole('heading', { name: 'Gestao de Irmaos' }).first().waitFor()
  assert.equal(await page.getByRole('button', { name: 'Gestao de Irmaos' }).count(), 1)
  assert.equal(await page.getByText('11999999999').count(), 0)
  const brotherRow = page.locator('main').getByRole('button', { name: /Maria Exemplo/ })
  assert.equal(await brotherRow.isEnabled(), true)
  await brotherRow.click()
  await page.getByText('(11) 99999-9999').waitFor({ timeout: 2000 })
  await page.setViewportSize({ width: 1440, height: 900 })
  assert.equal(await page.getByText('(11) 99999-9999').count(), 1)
  assert.equal(await page.getByRole('heading', { name: 'Acompanhamentos' }).count(), 0)
  assert.match(page.url(), /\/gestao-irmaos\/1$/)
})

test('Admin sem permissao explicita nao ve o modulo e o acesso direto redireciona', async (t) => {
  const page = await openApp({ id: 1, name: 'Admin', role: 'admin', roles: ['admin'], brother_permissions: [] }, '/gestao-irmaos', { width: 1440, height: 900 })
  t.after(() => page.close())
  await page.waitForURL(/\/dashboard$/)
  assert.equal(await page.getByRole('button', { name: 'Gestao de Irmaos' }).count(), 0)
})
