import { BadgePercent, Minus, PackagePlus, Plus, ReceiptText, ShoppingCart, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../services/api'
import { formatQuantityWithUnit, money } from '../utils/formatters'
import { StatusPill } from './StatusPill'

function createEmptyComboDraft() {
  return {
    kind: 'promotion',
    name: '',
    sale_price: '',
    quantities: {}
  }
}

function endOfTodayIso() {
  const date = new Date()
  date.setHours(23, 59, 59, 999)
  return date.toISOString()
}

function ComboCreatorModal({ products, onClose, onCreated }) {
  const [draft, setDraft] = useState(createEmptyComboDraft)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const selectedItems = products
    .map((product) => ({ product, quantity: Number(draft.quantities[product.id] || 0) }))
    .filter((item) => item.quantity > 0)
  const regularPrice = selectedItems.reduce((sum, item) => sum + item.product.sale_price * item.quantity, 0)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  async function submit(event) {
    event.preventDefault()
    setMessage('')

    if (!selectedItems.length) {
      setMessage('Selecione ao menos um produto.')
      return
    }

    setSaving(true)
    try {
      const combo = await api.createCombo({
        name: draft.name,
        sale_price: Number(String(draft.sale_price).replace(',', '.')),
        is_promotion: draft.kind === 'promotion',
        expires_at: draft.kind === 'promotion' ? endOfTodayIso() : null,
        items: selectedItems.map(({ product, quantity }) => ({
          product_id: product.id,
          quantity
        }))
      })
      onCreated(combo)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="dashboard-modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dashboard-modal-panel mission-panel text-ink shadow-blue dark:text-slate-50" role="dialog" aria-modal="true" aria-labelledby="combo-modal-title">
        <div className="flex items-start justify-between gap-3 border-b border-line/80 p-4 dark:border-shalom-gold/10">
          <div>
            <h2 id="combo-modal-title" className="font-display text-xl font-semibold">Criar combo ou promocao</h2>
            <p className="mission-muted mt-1 text-sm">Monte uma oferta usando os produtos disponiveis no estoque.</p>
          </div>
          <button type="button" className="mission-btn border border-line/80 bg-white/70 p-2 dark:border-shalom-gold/10 dark:bg-white/10" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form className="dashboard-modal-body scrollbar-thin space-y-4 p-4" onSubmit={submit}>
          <label className="block text-sm font-medium">
            Tipo
            <select className="mission-input mt-2 w-full px-3 py-2.5" value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))}>
              <option value="promotion">Promocao rapida, expira hoje</option>
              <option value="combo">Combo permanente</option>
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Nome
              <input className="mission-input mt-2 w-full px-3 py-2.5" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Queima de salgados" required />
            </label>
            <label className="block text-sm font-medium">
              {draft.kind === 'promotion' ? 'Preco da promocao' : 'Preco do combo'}
              <input className="mission-input mt-2 w-full px-3 py-2.5" inputMode="decimal" value={draft.sale_price} onChange={(event) => setDraft((current) => ({ ...current, sale_price: event.target.value }))} placeholder="0,00" required />
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="font-display font-semibold">Produtos do combo</h3>
              <span className="mission-muted text-sm">Preco normal: {money.format(regularPrice)}</span>
            </div>
            <div className="max-h-72 divide-y divide-line/70 overflow-y-auto rounded-2xl border border-line/80 px-3 dark:divide-shalom-gold/10 dark:border-shalom-gold/10">
              {products.map((product) => (
                <label key={product.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <strong className="block truncate text-sm">{product.name}</strong>
                    <span className="mission-muted text-xs">{money.format(product.sale_price)} - {formatQuantityWithUnit(product.stock_quantity, product.unit)} disponiveis</span>
                  </span>
                  <input
                    className="mission-input w-24 px-3 py-2 text-right"
                    type="number"
                    min="0"
                    max={product.stock_quantity}
                    step="1"
                    value={draft.quantities[product.id] || ''}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      quantities: { ...current.quantities, [product.id]: event.target.value }
                    }))}
                    placeholder="Qtd."
                  />
                </label>
              ))}
            </div>
          </div>

          {message ? <p className="rounded-xl bg-shalom-wine/10 px-3 py-2 text-sm text-shalom-wine dark:text-rose-100">{message}</p> : null}

          <button type="submit" className="mission-btn mission-btn-primary flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" disabled={saving}>
            {draft.kind === 'promotion' ? <BadgePercent size={18} /> : <PackagePlus size={18} />}
            {saving ? 'Criando...' : draft.kind === 'promotion' ? 'Criar promocao rapida' : 'Criar combo'}
          </button>
        </form>
      </section>
    </div>,
    document.body
  )
}

export function SalesTerminal({ onSaleComplete }) {
  const [products, setProducts] = useState([])
  const [combos, setCombos] = useState([])
  const [cart, setCart] = useState([])
  const [notes, setNotes] = useState('')
  const [payment, setPayment] = useState('pix')
  const [customerName, setCustomerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [showComboCreator, setShowComboCreator] = useState(false)

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
    if (payment === 'pagamento_pendente' && !customerName.trim()) {
      setMessage('Informe a pessoa ou cliente do pagamento pendente.')
      setLoading(false)
      return
    }

    try {
      const payload = {
        payment_method: payment,
        customer_name: customerName.trim() || null,
        notes,
        items: cart.map((item) => item.type === 'combo'
          ? { combo_id: item.id, quantity: item.quantity }
          : { product_id: item.id, quantity: item.quantity })
      }
      const sale = await api.createSale(payload)
      setCart([])
      setNotes('')
      setCustomerName('')
      setMessage(`Venda #${sale.id} registrada: ${money.format(sale.total)}`)
      try {
        await loadData()
        onSaleComplete()
      } catch (refreshError) {
        setMessage(`Venda #${sale.id} registrada: ${money.format(sale.total)}. Nao foi possivel atualizar a tela: ${refreshError.message}`)
      }
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="space-y-5">
        <div className="mission-panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Combos e promocoes</h2>
              <p className="mission-muted text-sm">Ofertas prontas para vender</p>
            </div>
            <button type="button" className="mission-btn mission-btn-gold flex items-center gap-2 px-3 py-2 text-sm font-semibold" onClick={() => setShowComboCreator(true)}>
              <BadgePercent size={17} />
              Criar oferta
            </button>
          </div>
          {combos.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {combos.map((combo) => (
                <button
                  key={combo.id}
                  className="mission-card p-4 text-left disabled:cursor-not-allowed"
                  onClick={() => addItem(combo, 'combo')}
                  disabled={combo.max_available < 1}
                >
                  <span className="text-sm font-semibold uppercase tracking-[0.14em] text-shalom-orange dark:text-shalom-gold">{combo.is_promotion ? 'Promocao' : 'Combo'}</span>
                  <strong className="mt-1 block font-display text-lg">{combo.name}</strong>
                  <span className="mt-3 block text-xl font-semibold text-shalom-blue dark:text-shalom-gold">{money.format(combo.sale_price)}</span>
                  {combo.savings > 0 ? <span className="mt-1 block text-xs font-semibold text-shalom-orange dark:text-shalom-gold">Economize {money.format(combo.savings)}</span> : null}
                  <span className="mission-muted mt-2 block text-xs">{combo.max_available} disponiveis{combo.is_promotion ? ' - expira hoje' : ''}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-shalom-gold/50 p-6 text-center mission-muted">Nenhum combo ativo.</div>
          )}
        </div>

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
            <option value="pagamento_pendente">Pagamento pendente</option>
          </select>
        </label>

        {payment === 'pagamento_pendente' ? (
          <label className="mt-4 block text-sm font-medium">
            Pessoa/cliente
            <input
              className="mission-input mt-2 w-full px-3 py-2.5"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Nome de quem ficou pendente"
            />
          </label>
        ) : null}

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

      {showComboCreator ? (
        <ComboCreatorModal
          products={products}
          onClose={() => setShowComboCreator(false)}
          onCreated={async (combo) => {
            setShowComboCreator(false)
            setMessage(`${combo.is_promotion ? 'Promocao' : 'Combo'} ${combo.name} criado com sucesso.`)
            await loadData()
          }}
        />
      ) : null}
    </div>
  )
}
