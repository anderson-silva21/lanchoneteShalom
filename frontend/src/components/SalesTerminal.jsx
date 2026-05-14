import { Minus, Plus, ReceiptText, ShoppingCart, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { formatQuantityWithUnit, money } from '../utils/formatters'
import { StatusPill } from './StatusPill'

export function SalesTerminal({ onSaleComplete }) {
  const [products, setProducts] = useState([])
  const [combos, setCombos] = useState([])
  const [cart, setCart] = useState([])
  const [notes, setNotes] = useState('')
  const [payment, setPayment] = useState('pix')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
    const [productData, comboData] = await Promise.all([
      api.products({ q: '', status: '' }),
      api.combos()
    ])
    setProducts(productData.filter((product) => product.sale_price > 0))
    setCombos(comboData)
  }, [])

  useEffect(() => {
    loadData().catch((err) => setMessage(err.message))
  }, [loadData])

  const categories = useMemo(() => {
    return products.reduce((acc, product) => {
      acc[product.category] = acc[product.category] || []
      acc[product.category].push(product)
      return acc
    }, {})
  }, [products])

  const total = cart.reduce((sum, item) => sum + item.sale_price * item.quantity, 0)

  function addItem(item, type = 'product') {
    const key = `${type}-${item.id}`
    setCart((current) => {
      const existing = current.find((cartItem) => cartItem.key === key)
      if (existing) {
        return current.map((cartItem) => cartItem.key === key ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem)
      }
      return [...current, { key, type, id: item.id, name: item.name, sale_price: item.sale_price, quantity: 1 }]
    })
  }

  function changeQty(key, delta) {
    setCart((current) => current
      .map((item) => item.key === key ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0))
  }

  async function finishSale() {
    setLoading(true)
    setMessage('')
    try {
      const payload = {
        payment_method: payment,
        notes,
        items: cart.map((item) => item.type === 'combo'
          ? { combo_id: item.id, quantity: item.quantity }
          : { product_id: item.id, quantity: item.quantity })
      }
      const sale = await api.createSale(payload)
      setCart([])
      setNotes('')
      setMessage(`Venda #${sale.id} registrada: ${money.format(sale.total)}`)
      await loadData()
      onSaleComplete()
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="space-y-5">
        {combos.length ? (
          <div className="mission-panel p-4">
            <h2 className="mb-4 font-display text-lg font-semibold">Combos</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {combos.map((combo) => (
                <button
                  key={combo.id}
                  className="mission-card p-4 text-left"
                  onClick={() => addItem(combo, 'combo')}
                >
                  <span className="text-sm font-semibold uppercase tracking-[0.14em] text-shalom-orange dark:text-shalom-gold">Combo</span>
                  <strong className="mt-1 block font-display text-lg">{combo.name}</strong>
                  <span className="mt-3 block text-xl font-semibold text-shalom-blue dark:text-shalom-gold">{money.format(combo.sale_price)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {Object.entries(categories).map(([category, items]) => (
          <div key={category} className="mission-panel p-4">
            <h2 className="mb-4 font-display text-lg font-semibold">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((product) => (
                <button
                  key={product.id}
                  className="mission-card min-h-32 p-4 text-left"
                  onClick={() => addItem(product)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <strong className="font-display text-lg">{product.name}</strong>
                    <StatusPill status={product.stock_status} />
                  </div>
                  <span className="mt-3 block text-2xl font-semibold text-shalom-blue dark:text-shalom-gold">{money.format(product.sale_price)}</span>
                  <span className="mission-muted mt-1 block text-sm">
                    {formatQuantityWithUnit(product.stock_quantity, product.unit)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <aside className="mission-panel p-4 xl:sticky xl:top-24 xl:self-start">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Venda atual</h2>
            <p className="mission-muted text-sm">{cart.length} itens</p>
          </div>
          <ShoppingCart size={22} />
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
          {cart.length ? cart.map((item) => (
            <div key={item.key} className="mission-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="mission-muted text-sm">{money.format(item.sale_price)}</p>
                </div>
                <button className="mission-btn p-1 text-shalom-wine hover:bg-shalom-wine/10" onClick={() => changeQty(item.key, -item.quantity)} title="Remover">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button className="mission-btn border border-line/80 p-1.5 dark:border-shalom-gold/20" onClick={() => changeQty(item.key, -1)} title="Diminuir">
                    <Minus size={15} />
                  </button>
                  <span className="w-8 text-center font-semibold">{item.quantity}</span>
                  <button className="mission-btn border border-line/80 p-1.5 dark:border-shalom-gold/20" onClick={() => changeQty(item.key, 1)} title="Aumentar">
                    <Plus size={15} />
                  </button>
                </div>
                <strong>{money.format(item.sale_price * item.quantity)}</strong>
              </div>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-shalom-gold/50 p-8 text-center mission-muted">
              Nenhum item
            </div>
          )}
        </div>

        <label className="mt-4 block text-sm font-medium">
          Pagamento
          <select className="mission-input mt-2 w-full px-3 py-2.5" value={payment} onChange={(event) => setPayment(event.target.value)}>
            <option value="pix">Pix</option>
            <option value="cartao">Cartao</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="delivery">Delivery</option>
          </select>
        </label>

        <label className="mt-4 block text-sm font-medium">
          Observacoes
          <textarea className="mission-input mt-2 min-h-20 w-full px-3 py-2.5" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>

        {message ? <p className="mt-4 rounded-2xl bg-shalom-cream/70 px-3 py-2 text-sm text-shalom-deep dark:bg-white/10 dark:text-shalom-gold">{message}</p> : null}

        <div className="mt-5 flex items-center justify-between border-t border-shalom-gold/40 pt-4 dark:border-shalom-gold/10">
          <span className="mission-muted text-sm">Total</span>
          <strong className="font-display text-2xl text-shalom-blue dark:text-shalom-gold">{money.format(total)}</strong>
        </div>

        <button
          className="mission-btn mission-btn-primary mt-4 flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold"
          disabled={!cart.length || loading}
          onClick={finishSale}
        >
          <ReceiptText size={18} />
          {loading ? 'Registrando...' : 'Finalizar venda'}
        </button>
      </aside>
    </div>
  )
}
