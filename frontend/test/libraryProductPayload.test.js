import test from 'node:test'
import assert from 'node:assert/strict'
import { libraryProductPayload, libraryPublicationPayload } from '../src/utils/libraryProductPayload.js'

test('publicacao envia apenas a mudanca de visibilidade', () => {
  const product = { published: true, stock_quantity: 5, price: 10, name: 'Livro' }
  assert.deepEqual(libraryPublicationPayload(product), { published: false })
  assert.deepEqual(libraryPublicationPayload({ ...product, published: false }), { published: true })
})

test('edicao omite estoque inalterado inclusive apos digitar e restaurar o valor', () => {
  const draft = { name: 'Livro editado', stock_quantity: '5.000' }
  assert.equal(Object.hasOwn(libraryProductPayload(draft, 5), 'stock_quantity'), false)
  assert.equal(draft.stock_quantity, '5.000')
})

test('criacao e edicao intencional preservam a quantidade enviada inclusive zero', () => {
  for (const stock_quantity of ['7', '0']) {
    const draft = { name: 'Livro', stock_quantity }
    assert.equal(libraryProductPayload(draft, 5).stock_quantity, stock_quantity)
    assert.equal(libraryProductPayload(draft).stock_quantity, stock_quantity)
  }
})
