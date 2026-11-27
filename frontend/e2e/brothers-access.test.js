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

async function openApp(user, path = '/gestao-irmaos', viewport = { width: 390, height: 844 }, home = {}, overview = {}) {
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
    if (url.pathname.endsWith('/pastoral/home')) return route.fulfill({ json: home })
    if (url.pathname.endsWith('/pastoral/overview')) return route.fulfill({ json: overview })
    if (url.pathname.endsWith('/pastoral/calendar')) return route.fulfill({ json: overview?.upcoming || [] })
    if (url.pathname.endsWith('/pastoral/appointments') || url.pathname.endsWith('/pastoral/users') || url.pathname.endsWith('/pastoral/sheep')) return route.fulfill({ json: [] })
    if (url.pathname.endsWith('/pastoral/orgchart')) return route.fulfill({ json: { coordinator: { id: 4, full_name: 'Coordenador Shalom' }, pastors: [{ id: 5, full_name: 'Pastora Ana', sheep_count: 1, sheep: [{ id: 10, full_name: 'Ovelha Exemplo', preferred_name: 'Ana' }] }] } })
    if (url.pathname.endsWith('/brothers/groups') || url.pathname.endsWith('/brothers/ministries')) return route.fulfill({ json: [] })
    if (url.pathname.endsWith('/brothers/1/followups')) return user.role === 'admin' ? route.fulfill({ json: [] }) : route.fulfill({ status: 403, json: { message: 'Acesso restrito.' } })
    if (url.pathname.endsWith('/brothers/1')) return route.fulfill({ json: {
      id: 1, full_name: 'IrmÃ£ Exemplo', preferred_name: 'Maria Exemplo', birth_date: '1988-05-14',
      phone: '(11) 99999-9999', email: 'maria@example.test', status: 'active', groups: [], ministries: [], history: []
    } })
    if (url.pathname.endsWith('/brothers')) return route.fulfill({ json: {
      items: [{ id: 1, full_name: 'IrmÃ£ Exemplo', preferred_name: 'Maria Exemplo', status: 'active', groups: '', ministries: '' }],
      pagination: { page: 1, page_size: 25, total: 1, total_pages: 1 }
    } })
    if (url.pathname.endsWith('/analytics/dashboard')) return route.fulfill({ status: 503, json: { message: 'Dashboard indisponivel durante este teste.' } })
    return route.fulfill({ json: {} })
  })
  await page.goto(`${baseUrl}${path}`)
  return page
}

async function selectBrothersSection(page, label) {
  await page.getByRole('navigation', { name: 'Areas da Gestao de Irmaos' }).getByRole('tab', { name: label, exact: true }).click()
}

test('permissao explicita mostra navegacao e abre o perfil sem expor acompanhamentos', async (t) => {
  const page = await openApp({ id: 8, name: 'Maria', role: 'cashier', roles: ['cashier'], brother_permissions: ['brothers:read'] })
  t.after(() => page.close())
  await page.getByRole('heading', { name: 'Gestao de Irmaos' }).first().waitFor()
  await selectBrothersSection(page, 'Irmaos')
  assert.ok(await page.getByRole('navigation', { name: 'Navegacao principal' }).getByRole('button').count() >= 2)
  assert.equal(await page.getByText('11999999999').count(), 0)
  const brotherRow = page.locator('main').getByRole('button', { name: /Maria Exemplo/ })
  assert.equal(await brotherRow.isEnabled(), true)
  await brotherRow.click()
  await page.getByText('(11) 99999-9999').waitFor({ timeout: 2000 })
  assert.equal(await page.getByRole('heading', { name: 'Acompanhamentos' }).count(), 0)
  assert.match(page.url(), /\/gestao-irmaos\/1$/)
})

test('perfil abre em viewport desktop', async (t) => {
  const page = await openApp({ id: 8, name: 'Maria', role: 'cashier', roles: ['cashier'], brother_permissions: ['brothers:read'] }, '/gestao-irmaos/1', { width: 1440, height: 900 })
  t.after(() => page.close())
  await page.getByText('(11) 99999-9999').waitFor({ timeout: 2000 })
  assert.match(page.url(), /\/gestao-irmaos\/1$/)
})

test('Admin acessa o modulo mesmo sem permissoes individuais', async (t) => {
  const page = await openApp({ id: 1, name: 'Admin', role: 'admin', roles: ['admin'], brother_permissions: [] }, '/gestao-irmaos', { width: 1440, height: 900 })
  t.after(() => page.close())
  await page.getByRole('heading', { name: 'Gestao de Irmaos' }).first().waitFor()
  await page.getByRole('tab', { name: 'Irmaos', exact: true }).click()
  assert.equal(await page.locator('aside nav button').filter({ hasText: 'Gestao de Irmaos' }).count(), 1)
  assert.equal(await page.locator('main').getByRole('button', { name: /Maria Exemplo/ }).count(), 1)
})

test('desktop mantem o menu lateral e mobile usa abas como as categorias do PDV', async (t) => {
  const admin = { id: 1, name: 'Admin', role: 'admin', roles: ['admin'], brother_permissions: [] }
  const desktop = await openApp(admin, '/gestao-irmaos', { width: 1440, height: 900 })
  t.after(() => desktop.close())
  await desktop.getByRole('heading', { name: 'Gestao de Irmaos' }).first().waitFor()
  assert.equal(await desktop.locator('aside').isVisible(), true)
  assert.equal(await desktop.locator('aside nav').getByRole('button', { name: 'Gestao de Irmaos' }).isVisible(), true)
  assert.equal(await desktop.getByRole('navigation', { name: 'Areas da Gestao de Irmaos' }).getByRole('tab', { name: 'Irmaos', exact: true }).isVisible(), true)

  const mobile = await openApp(admin, '/gestao-irmaos', { width: 390, height: 844 })
  t.after(() => mobile.close())
  await mobile.getByRole('heading', { name: 'Gestao de Irmaos' }).first().waitFor()
  const moduleNav = mobile.getByRole('navigation', { name: 'Areas da Gestao de Irmaos' })
  assert.equal(await moduleNav.getByRole('tab', { name: 'Irmaos', exact: true }).isVisible(), true)
  assert.equal(await moduleNav.getByRole('tab').count(), 8)
  const mobileTabs = mobile.locator('.brothers-mobile-tabs')
  const tabLayout = await mobileTabs.evaluate((element) => {
    const buttons = [...element.querySelectorAll('[role="tab"]')]
    return { width: element.clientWidth, scrollWidth: element.scrollWidth, tops: buttons.map((button) => Math.round(button.getBoundingClientRect().top)) }
  })
  assert.ok(tabLayout.scrollWidth > tabLayout.width, `menu mobile deveria transbordar a viewport do menu: ${JSON.stringify(tabLayout)}`)
  assert.equal(new Set(tabLayout.tops).size, 1, 'abas do menu mobile devem ficar em uma unica fileira')
  await mobileTabs.evaluate((element) => { element.scrollLeft = element.scrollWidth })
  const lastTabBounds = await moduleNav.getByRole('tab', { name: 'Acessos', exact: true }).evaluate((button) => {
    const tablist = button.closest('[role="tablist"]')
    const buttonRect = button.getBoundingClientRect()
    const tablistRect = tablist.getBoundingClientRect()
    return { scrollLeft: tablist.scrollLeft, left: buttonRect.left - tablistRect.left, right: buttonRect.right - tablistRect.left, width: tablist.clientWidth }
  })
  assert.ok(lastTabBounds.scrollLeft > 0, 'menu deve responder ao gesto de rolagem horizontal')
  assert.ok(lastTabBounds.left >= 0 && lastTabBounds.right <= lastTabBounds.width, 'a ultima aba deve ficar visivel apos deslizar')
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390)
})

test('perfil tecnico exclusivo da Gestao de Irmaos nao recebe outros modulos', async (t) => {
  const page = await openApp({ id: 12, name: 'Pastoral', role: 'brothers', roles: ['brothers'], brother_permissions: [] }, '/gestao-irmaos', { width: 390, height: 844 })
  t.after(() => page.close())
  await page.getByRole('heading', { name: 'Gestao de Irmaos' }).first().waitFor()
  assert.equal(await page.getByRole('navigation', { name: 'Navegacao principal' }).getByRole('button').count(), 1)
  assert.equal(await page.getByRole('button', { name: 'PDV' }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Livraria' }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Sistema' }).count(), 0)
})

test('inÃ­cio do pastor prioriza suas ovelhas e cabe na largura do celular', async (t) => {
  const pastor = {
    id: 19, name: 'Pastor Exemplo', role: 'brothers', roles: ['brothers'],
    brother_permissions: ['brothers:calendar:read', 'brothers:followups:create', 'brothers:followups:read', 'brothers:self:access']
  }
  const home = {
    role: 'pastor', profile: { id: 9, full_name: 'Pastor Exemplo', preferred_name: 'Pastor' },
    sheep: [{ id: 10, full_name: 'Ovelha Exemplo', preferred_name: 'Ana' }],
    upcoming_appointments: [{ id: 1, brother_id: 10, full_name: 'Ovelha Exemplo', preferred_name: 'Ana', occurred_on: '2026-11-28', start_time: '15:00' }],
    completed_followups: [], groups: [], community_events: [], own_appointments: []
  }
  const page = await openApp(pastor, '/gestao-irmaos', { width: 390, height: 844 }, home)
  t.after(() => page.close())
  await page.getByText('Bem-vindo, Pastor').waitFor()
  await selectBrothersSection(page, 'Minhas ovelhas')
  await page.getByText('Ana', { exact: true }).waitFor()
  const dimensions = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  assert.ok(dimensions.page <= dimensions.viewport, `largura da pÃ¡gina ${dimensions.page} excedeu o viewport ${dimensions.viewport}`)
})

test('navegacao global no celular ocupa uma linha e mantem os outros modulos em Mais', async (t) => {
  const page = await openApp({ id: 1, name: 'Admin', role: 'admin', roles: ['admin'], brother_permissions: [] })
  t.after(() => page.close())
  const nav = page.getByRole('navigation', { name: 'Navegacao principal' })
  await nav.getByRole('button', { name: 'Mais' }).click()
  await page.getByRole('menuitem', { name: 'Produtos' }).waitFor()
  const dimensions = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth, navHeight: document.querySelector('.mobile-bottom-nav').getBoundingClientRect().height }))
  assert.equal(dimensions.page, dimensions.viewport)
  assert.ok(dimensions.navHeight < 80, `navegacao tem ${dimensions.navHeight}px e deveria ser uma linha compacta`)
})

test('Gestao de Irmaos cabe na viewport e mantem todas as secoes acessiveis', async (t) => {
  const admin = { id: 1, name: 'Admin', role: 'admin', roles: ['admin'], brother_permissions: [] }
  const sections = [
    ['overview', 'Visao geral'], ['people', 'Irmaos'], ['ministries', 'Servicos'], ['groups', 'Grupos'],
    ['org', 'Organograma'], ['calendar', 'Calendario'], ['appointments', 'Acompanhamentos'], ['users', 'Acessos']
  ]
  const widths = [320, 360, 375, 390, 414, 768, 1024, 1440]
  const page = await openApp(admin, '/gestao-irmaos', { width: widths[0], height: 844 }, {}, {
    totals: { brothers: 125, pastors: 10, services: 6, groups: 9, group_members: 42 },
    upcoming: [{ id: 8, occurrence_date: '2026-11-28', title: 'Encontro comunitario', start_time: '15:00', event_type: 'work' }]
  })
  t.after(() => page.close())
  await page.getByRole('heading', { name: 'Gestao de Irmaos' }).first().waitFor()
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 })
    for (const [key, label] of sections) {
      await selectBrothersSection(page, label)
      if (key === 'overview') {
        assert.equal(await page.getByText('Ovelhas vinculadas', { exact: true }).count(), 0)
        const separators = await page.locator('main dl > div').evaluateAll((cells) => cells.map((cell, index) => ({ index, borderLeft: getComputedStyle(cell).borderLeftWidth, borderTop: getComputedStyle(cell).borderTopWidth })))
        const columns = width < 640 ? 2 : 3
        assert.equal(separators.length, 5, `quantidade de indicadores incorreta em ${width}px`)
        assert.deepEqual(separators.filter((cell) => cell.borderLeft !== '0px').map((cell) => cell.index), separators.map((_, index) => index).filter((index) => index % columns !== 0), `divisores verticais desalinhados em ${width}px`)
        assert.deepEqual(separators.filter((cell) => cell.borderTop !== '0px').map((cell) => cell.index), separators.map((_, index) => index).filter((index) => index >= columns), `divisores horizontais desalinhados em ${width}px`)
      }
      if (key === 'calendar') {
        assert.equal(await page.getByRole('grid', { name: 'Calendario mensal' }).isVisible(), true, `calendario oculto em ${width}px`)
      }
      const dimensions = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth
        const outside = [...document.querySelectorAll('body *')].map((element) => {
          const rect = element.getBoundingClientRect()
          return { tag: element.tagName.toLowerCase(), parent: element.parentElement?.className || '', className: typeof element.className === 'string' ? element.className : '', right: Math.round(rect.right), width: Math.round(rect.width), display: getComputedStyle(element).display, hiddenDetails: Boolean(element.closest('details:not([open])')), scrollTabs: Boolean(element.closest('.brothers-mobile-tabs')) }
        }).filter((element) => element.width > 0 && element.display !== 'none' && !element.hiddenDetails && !element.scrollTabs && element.right > viewport + 1).slice(0, 5)
        return { viewport, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, main: { width: document.querySelector('main').clientWidth, scrollWidth: document.querySelector('main').scrollWidth }, outside }
      })
      assert.equal(dimensions.document, width, `${key} em ${width}px: documento ${dimensions.document}px; elementos fora da tela: ${JSON.stringify(dimensions.outside)}`)
      assert.ok(dimensions.main.scrollWidth <= dimensions.main.width + 1, `${key} em ${width}px: main ${dimensions.main.scrollWidth}px maior que ${dimensions.main.width}px`)
      assert.deepEqual(dimensions.outside, [], `${key} em ${width}px tem elementos fora da tela`)
    }
  }
})

test('cadastro e perfil de irmao cabem nas larguras de smartphone', async (t) => {
  const admin = { id: 1, name: 'Admin', role: 'admin', roles: ['admin'], brother_permissions: [] }
  for (const width of [320, 360, 375, 390, 414]) {
    const page = await openApp(admin, '/gestao-irmaos', { width, height: 844 })
    t.after(() => page.close())
    await page.getByRole('heading', { name: 'Gestao de Irmaos' }).first().waitFor()
    await selectBrothersSection(page, 'Irmaos')
    await page.getByRole('button', { name: /Novo irmao/ }).click()
    await page.getByRole('heading', { name: 'Dados pessoais' }).waitFor()
    let dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, main: document.querySelector('main').clientWidth, content: document.querySelector('main').scrollWidth }))
    assert.equal(dimensions.document, width, `cadastro em ${width}px ultrapassou a viewport`)
    assert.ok(dimensions.content <= dimensions.main + 1, `cadastro em ${width}px excedeu o conteudo disponivel`)

    await page.goto(new URL('/gestao-irmaos/1', page.url()).toString())
    await page.getByText('(11) 99999-9999').waitFor()
    dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, main: document.querySelector('main').clientWidth, content: document.querySelector('main').scrollWidth }))
    assert.equal(dimensions.document, width, `perfil em ${width}px ultrapassou a viewport`)
    assert.ok(dimensions.content <= dimensions.main + 1, `perfil em ${width}px excedeu o conteudo disponivel`)
  }
})
