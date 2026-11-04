import assert from 'node:assert/strict'
import { test } from 'node:test'
import { productFormData } from '../src/utils/productFormData.js'

test('serializa produto e imagem como multipart sem vazar campos internos', () => {
  const file = new File(['imagem'], 'produto.png', { type: 'image/png' })
  const form = productFormData({
    name: 'Produto',
    published: false,
    category_id: null,
    images: [{ url: 'https://example.com/atual.webp' }],
    image_file: file,
    image_removed: false
  })

  assert.equal(form.get('name'), 'Produto')
  assert.equal(form.get('published'), 'false')
  assert.equal(form.get('category_id'), '')
  assert.deepEqual(JSON.parse(form.get('images')), [{ url: 'https://example.com/atual.webp' }])
  assert.equal(form.get('remove_image'), 'false')
  assert.equal(form.get('image').name, 'produto.png')
  assert.equal(form.has('image_file'), false)
  assert.equal(form.has('image_removed'), false)
})
