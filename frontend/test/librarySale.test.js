import test from 'node:test'
import assert from 'node:assert/strict'
import { cartFromLibraryRequest, filterLibrarySaleProducts, normalizeLibrarySaleProducts } from '../src/utils/librarySale.js'

const products = normalizeLibrarySaleProducts([
  { id: 1, name: 'Livro Caminho de Oracao', sku: 'LIV-001', category: 'Livros', price: 42.9, images: [{ url: '/livro.jpg' }] },
  { id: 2, name: 'Camisa Shalom', sku: 'CAM-002', category: 'Camisas', price: 59.9, images: [] }
])

test('normaliza preco e imagem do catalogo da Livraria', () => {
  assert.equal(products[0].sale_price, 42.9)
  assert.equal(products[0].image_url, '/livro.jpg')
  assert.equal(products[1].image_url, '')
})

test('busca produtos por nome ou SKU e filtra por categoria', () => {
  assert.deepEqual(filterLibrarySaleProducts(products, 'caminho', 'Todos').map((item) => item.id), [1])
  assert.deepEqual(filterLibrarySaleProducts(products, 'cam-002', 'Todos').map((item) => item.id), [2])
  assert.deepEqual(filterLibrarySaleProducts(products, '', 'Livros').map((item) => item.id), [1])
})

test('transforma carrinho recebido sem misturar estoque ou identificadores', () => {
  const cart = cartFromLibraryRequest({ items: [{ product_id: 7, product_name: 'Devocionario', current_price: 25, requested_quantity: 2, stock_quantity: 4 }] })
  assert.deepEqual(cart, [{ key: 'product-7', type: 'product', id: 7, name: 'Devocionario', sale_price: 25, quantity: 2, stockLimit: 4, unit: 'un' }])
})
