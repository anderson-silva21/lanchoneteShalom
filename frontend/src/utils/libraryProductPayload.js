export function libraryProductPayload(draft, initialStockQuantity) {
  const payload = {
    ...draft,
    category_id: draft.category_id || null,
    images: draft.image_removed ? [] : draft.image_url ? [{ url: draft.image_url, alt_text: draft.name }] : []
  }
  if (initialStockQuantity !== undefined && Number(draft.stock_quantity) === Number(initialStockQuantity)) {
    delete payload.stock_quantity
  }
  return payload
}

export function libraryPublicationPayload(product) {
  return {
    published: !product.published
  }
}
