import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedViewsForRole, canAccessView, defaultViewForRole } from '../src/access.js'

test('caixa nao visualiza nem acessa Financeiro', () => {
  assert.equal(canAccessView('cashier', 'payments'), false)
  assert.equal(allowedViewsForRole('cashier').includes('payments'), false)
  assert.equal(defaultViewForRole('cashier'), 'sales')
})

test('financeiro e admin continuam acessando Financeiro', () => {
  assert.equal(canAccessView('finance', 'payments'), true)
  assert.equal(canAccessView('admin', 'payments'), true)
})
