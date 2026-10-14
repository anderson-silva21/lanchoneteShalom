import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedViewsForRole, canAccessView, defaultViewForRole } from '../src/access.js'

test('Caixa + Livraria usa uma navegacao unica sem privilegios extras', () => {
  const user = { role: 'cashier', roles: ['cashier', 'library'] }
  assert.deepEqual(allowedViewsForRole(user), ['sales', 'sheet', 'library'])
  assert.equal(canAccessView(user, 'library'), true)
  assert.equal(canAccessView(user, 'payments'), false)
  assert.equal(canAccessView(user, 'settings'), false)
  assert.equal(defaultViewForRole(user), 'sales')
})

test('caixa nao visualiza nem acessa Financeiro', () => {
  assert.equal(canAccessView('cashier', 'payments'), false)
  assert.equal(allowedViewsForRole('cashier').includes('payments'), false)
  assert.equal(defaultViewForRole('cashier'), 'sales')
})

test('uniao evita duplicados, preserva carga inicial e prioriza roles atuais sobre o campo legado', () => {
  assert.deepEqual(allowedViewsForRole(['cashier', 'finance']), ['sales', 'sheet', 'dashboard', 'payments', 'products', 'library'])
  assert.equal(canAccessView({ role: 'admin', roles: ['library'] }, 'settings'), false)
  assert.deepEqual(allowedViewsForRole({ role: 'admin', roles: [] }), [])
  assert.equal(defaultViewForRole({ roles: ['library'] }), 'library')
  assert.equal(canAccessView(['cashier', 'manager'], 'setup'), false)
  assert.equal(canAccessView(['cashier', 'manager'], 'setup', { setupEnabled: true }), true)
})

test('financeiro e admin continuam acessando Financeiro', () => {
  assert.equal(canAccessView('finance', 'payments'), true)
  assert.equal(canAccessView('admin', 'payments'), true)
})

test('telas legadas de inventario e relatorios nao fazem parte da navegacao', () => {
  for (const role of ['cashier', 'manager', 'finance', 'admin', 'library']) {
    assert.equal(allowedViewsForRole(role).includes('inventory'), false)
    assert.equal(allowedViewsForRole(role).includes('reports'), false)
  }
  assert.equal(canAccessView('admin', 'settings'), true)
  assert.equal(canAccessView('finance', 'settings'), false)
})
