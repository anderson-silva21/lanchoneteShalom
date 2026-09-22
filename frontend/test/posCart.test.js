import test from 'node:test'
import assert from 'node:assert/strict'
import { addPosCartItem, changePosCartQuantity, getPosCartSummary } from '../src/utils/posCart.js'

const coffee = { id: 1, name: 'Cafe', sale_price: 5.25, stock_quantity: 3, unit: 'un' }

test('adiciona produto e incrementa item repetido sem ultrapassar estoque', () => {
  const first = addPosCartItem([], coffee)
  const second = addPosCartItem(first, coffee)
  const third = addPosCartItem(second, coffee)

  assert.equal(first[0].quantity, 1)
  assert.equal(second[0].quantity, 2)
  assert.equal(addPosCartItem(third, coffee), third)
})

test('altera quantidade e remove item quando chega a zero', () => {
  const cart = addPosCartItem(addPosCartItem([], coffee), coffee)
  assert.equal(changePosCartQuantity(cart, 'product-1', -1)[0].quantity, 1)
  assert.deepEqual(changePosCartQuantity(cart, 'product-1', -2), [])
})

test('calcula quantidade total e valor do carrinho', () => {
  const cart = [
    { quantity: 2, sale_price: 5.25 },
    { quantity: 1, sale_price: 8 }
  ]
  assert.deepEqual(getPosCartSummary(cart), { itemCount: 3, total: 18.5 })
})

test('controle do card respeita limite de estoque e sincroniza o resumo', () => {
  const fullCart = addPosCartItem(addPosCartItem(addPosCartItem([], coffee), coffee), coffee)
  assert.equal(addPosCartItem(fullCart, coffee), fullCart)
  assert.deepEqual(getPosCartSummary(fullCart), { itemCount: 3, total: 15.75 })

  const reduced = changePosCartQuantity(fullCart, 'product-1', -1)
  assert.equal(reduced[0].quantity, 2)
  assert.deepEqual(getPosCartSummary(reduced), { itemCount: 2, total: 10.5 })
})
