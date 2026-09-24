export function addPosCartItem(cart, item, type = 'product') {
  const key = `${type}-${item.id}`
  const stockLimit = Math.floor(Math.max(0, Number(type === 'combo' ? item.max_available : item.stock_quantity) || 0))
  const existing = cart.find((cartItem) => cartItem.key === key)

  if (stockLimit <= 0 || (existing?.quantity || 0) >= stockLimit) return cart

  if (existing) {
    return cart.map((cartItem) => cartItem.key === key
      ? { ...cartItem, quantity: cartItem.quantity + 1 }
      : cartItem)
  }

  return [...cart, {
    key,
    type,
    id: item.id,
    name: item.name,
    sale_price: item.sale_price,
    quantity: 1,
    stockLimit,
    unit: item.unit
  }]
}

export function changePosCartQuantity(cart, key, delta) {
  return cart
    .map((item) => {
      if (item.key !== key) return item
      const quantity = Math.min(item.stockLimit, item.quantity + delta)
      return { ...item, quantity }
    })
    .filter((item) => item.quantity > 0)
}

export function getPosCartSummary(cart) {
  return cart.reduce((summary, item) => ({
    itemCount: summary.itemCount + item.quantity,
    total: summary.total + item.sale_price * item.quantity
  }), { itemCount: 0, total: 0 })
}
