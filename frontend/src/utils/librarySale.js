export function normalizeLibrarySaleProducts(products) {
  return products.map((product) => ({
    ...product,
    sale_price: Number(product.price || 0),
    image_url: product.images?.[0]?.url || ''
  }))
}

export function filterLibrarySaleProducts(products, query, category) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('pt-BR')
  return products.filter((product) => {
    const matchesCategory = category === 'Todos' || product.category === category
    const searchable = `${product.name} ${product.sku || ''}`.toLocaleLowerCase('pt-BR')
    return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery))
  })
}

export function cartFromLibraryRequest(request) {
  return request.items.map((item) => ({
    key: `product-${item.product_id}`,
    type: 'product',
    id: item.product_id,
    name: item.product_name,
    sale_price: Number(item.current_price || item.unit_price_snapshot || 0),
    quantity: Number(item.requested_quantity || 0),
    stockLimit: Math.floor(Math.max(0, Number(item.stock_quantity || 0))),
    unit: 'un'
  })).filter((item) => item.quantity > 0)
}
