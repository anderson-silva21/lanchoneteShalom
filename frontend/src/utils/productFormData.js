export function productFormData(product) {
  const formData = new FormData()

  for (const [key, value] of Object.entries(product || {})) {
    if (key === 'image_file' || key === 'image_removed' || value === undefined) continue
    if (Array.isArray(value) || (value && typeof value === 'object')) {
      formData.append(key, JSON.stringify(value))
    } else {
      formData.append(key, value === null ? '' : String(value))
    }
  }

  if (product?.image_removed !== undefined) {
    formData.set('remove_image', String(Boolean(product.image_removed)))
  }
  if (product?.image_file) {
    formData.set('image', product.image_file, product.image_file.name)
  }

  return formData
}
