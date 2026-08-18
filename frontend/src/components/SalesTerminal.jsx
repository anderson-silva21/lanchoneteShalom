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
        <div className="flex min-w-0 items-start justify-between gap-3 border-b border-line/80 p-4 dark:border-shalom-gold/10">
          <div className="min-w-0">
            <h2 id="combo-modal-title" className="font-display text-xl font-semibold">Criar combo ou promocao</h2>
            <p className="mission-muted mt-1 text-sm">Monte uma oferta usando os produtos disponiveis no estoque.</p>
          </div>
          <button type="button" className="mission-btn shrink-0 border border-line/80 bg-white/70 p-2 dark:border-shalom-gold/10 dark:bg-white/10" onClick={onClose} aria-label="Fechar">
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

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="mb-2 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-display font-semibold">Produtos do combo</h3>
              <span className="mission-muted break-words text-sm">Preco normal: {money.format(regularPrice)}</span>
            </div>
            <div className="max-h-72 divide-y divide-line/70 overflow-y-auto rounded-2xl border border-line/80 px-3 dark:divide-shalom-gold/10 dark:border-shalom-gold/10">
              {products.map((product) => (
                <label key={product.id} className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <strong className="block break-words text-sm">{product.name}</strong>
                    <span className="mission-muted block break-words text-xs">{money.format(product.sale_price)} - {formatQuantityWithUnit(product.stock_quantity, product.unit)} disponiveis</span>
                  </span>
                  <input
                    className="mission-input w-full px-3 py-2 text-right sm:w-24"
                    type="number"
                    inputMode="numeric"
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
  const [deletingComboId, setDeletingComboId] = useState('')

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
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  function getAvailableQuantity(item, type = 'product') {
    const value = type === 'combo' ? item.max_available : item.stock_quantity
    return Math.max(0, Number(value || 0))
  }

  function getSaleQuantityLimit(item, type = 'product') {
    return Math.floor(getAvailableQuantity(item, type))
  }

  function getCartLimitLabel(item) {
    if (item.type === 'combo') return `${item.stockLimit} disponiveis`
    return formatQuantityWithUnit(item.stockLimit, item.unit)
  }

  function addItem(item, type = 'product') {
    const key = `${type}-${item.id}`
    const stockLimit = getSaleQuantityLimit(item, type)
    const existingQuantity = cart.find((cartItem) => cartItem.key === key)?.quantity || 0

    if (stockLimit <= 0) {
      setMessage(`${item.name} esta indisponivel no estoque.`)
      return
    }

    if (existingQuantity + 1 > stockLimit) {
      setMessage(`${item.name} ja atingiu o limite disponivel (${type === 'combo' ? `${stockLimit} disponiveis` : formatQuantityWithUnit(stockLimit, item.unit)}).`)
      return
    }

    setMessage('')
    setCart((current) => {
      const existing = current.find((cartItem) => cartItem.key === key)
      if (existing) {
        if (existing.quantity + 1 > stockLimit) return current
        return current.map((cartItem) => cartItem.key === key ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem)
      }
      return [...current, {
        key,
        type,
        id: item.id,
        name: item.name,
        sale_price: item.sale_price,
        quantity: 1,
        stockLimit,
        unit: item.unit
      }]
    })
  }

  function changeQty(key, delta) {
    setCart((current) => current
      .map((item) => {
        if (item.key !== key) return item
        const nextQuantity = item.quantity + delta
        if (nextQuantity > item.stockLimit) return item
        return { ...item, quantity: nextQuantity }
      })
      .filter((item) => item.quantity > 0))
  }

  async function deleteCombo(combo) {
    const comboType = combo.is_promotion ? 'promocao' : 'combo'
    if (!window.confirm(`Excluir ${comboType} "${combo.name}" do PDV?`)) return

    setDeletingComboId(String(combo.id))
    setMessage('')

    try {
      const result = await api.deleteCombo(combo.id)
      setCombos((current) => current.filter((item) => item.id !== combo.id))
      setCart((current) => current.filter((item) => item.type !== 'combo' || item.id !== combo.id))
      await loadData()
      onSaleComplete?.()
      setMessage(`${combo.is_promotion ? 'Promocao' : 'Combo'} ${combo.name} excluido do PDV.${result.sales_count ? ' Historico de vendas preservado.' : ''}`)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setDeletingComboId('')
    }
  }

  async function finishSale() {
    setLoading(true)
    setMessage('')
    if (!cart.length) {
      setMessage('Adicione ao menos um item para finalizar a venda.')
      setLoading(false)
      return
    }

    const exceededItem = cart.find((item) => item.quantity > item.stockLimit)
    if (exceededItem) {
      setMessage(`${exceededItem.name} passou do limite disponivel (${getCartLimitLabel(exceededItem)}).`)
      setLoading(false)
      return
    }

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
    <div className={`min-w-0 ${cart.length ? 'flex h-full min-h-0 flex-col gap-3 xl:grid xl:h-auto xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-5' : 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]'}`}>
      <div className={cart.length ? 'min-w-0 flex-1 space-y-5 overflow-y-auto pr-1 scrollbar-thin xl:contents xl:space-y-0 xl:overflow-visible xl:pr-0' : 'contents'}>
        <section className="min-w-0 space-y-5">
        {message ? (
          <p className="mission-panel px-4 py-3 text-sm text-shalom-deep dark:text-shalom-gold xl:hidden">{message}</p>
        ) : null}

        <div className="mission-panel min-w-0 p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold">Combos e promocoes</h2>
              <p className="mission-muted text-sm">Ofertas prontas para vender</p>
            </div>
            <button type="button" className="mission-btn mission-btn-gold flex min-h-11 w-full items-center justify-center gap-2 px-3 py-2 text-sm font-semibold sm:w-auto" onClick={() => setShowComboCreator(true)}>
              <BadgePercent size={17} />
              Criar oferta
            </button>
          </div>
          {combos.length ? (
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {combos.map((combo) => {
                const isDeleting = deletingComboId === String(combo.id)
                const comboLimit = getSaleQuantityLimit(combo, 'combo')
                const comboInCart = cart.find((item) => item.key === `combo-${combo.id}`)?.quantity || 0
                const isLimitReached = comboLimit <= 0 || comboInCart >= comboLimit

                return (
                  <article key={combo.id} className="mission-card min-w-0 p-4">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => addItem(combo, 'combo')}
                        disabled={isLimitReached || isDeleting}
                      >
                        <span className="text-sm font-semibold uppercase tracking-[0.14em] text-shalom-orange dark:text-shalom-gold">{combo.is_promotion ? 'Promocao' : 'Combo'}</span>
                        <strong className="mt-1 block break-words font-display text-lg leading-snug">{combo.name}</strong>
                        <span className="mt-3 block text-xl font-semibold text-shalom-blue dark:text-shalom-gold">{money.format(combo.sale_price)}</span>
                        {combo.savings > 0 ? <span className="mt-1 block text-xs font-semibold text-shalom-orange dark:text-shalom-gold">Economize {money.format(combo.savings)}</span> : null}
                        <span className="mission-muted mt-2 block break-words text-xs">
                          {comboInCart ? `${comboInCart} no carrinho - ` : ''}
                          {comboLimit} disponiveis{combo.is_promotion ? ' - expira hoje' : ''}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="mission-btn flex min-h-11 w-11 shrink-0 items-center justify-center border border-shalom-wine/35 p-2 text-shalom-wine hover:bg-shalom-wine/10 disabled:cursor-not-allowed disabled:opacity-45 dark:border-rose-200/20 dark:text-rose-100 dark:hover:bg-rose-400/10"
                        onClick={() => deleteCombo(combo)}
                        disabled={isDeleting}
                        title={`Excluir ${combo.is_promotion ? 'promocao' : 'combo'}`}
                        aria-label={`Excluir ${combo.is_promotion ? 'promocao' : 'combo'} ${combo.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-shalom-gold/50 p-6 text-center mission-muted">Nenhum combo ativo.</div>
          )}
        </div>

        {Object.entries(categories).map(([category, items]) => (
          <div key={category} className="mission-panel min-w-0 p-4">
            <h2 className="mb-4 font-display text-lg font-semibold">{category}</h2>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((product) => {
                const productAvailable = getAvailableQuantity(product)
                const productLimit = getSaleQuantityLimit(product)
                const quantityInCart = cart.find((item) => item.key === `product-${product.id}`)?.quantity || 0
                const isUnavailable = productLimit <= 0
                const isLimitReached = isUnavailable || quantityInCart >= productLimit

                return (
                  <button
                    key={product.id}
                    className="mission-card min-h-32 min-w-0 p-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => addItem(product)}
                    disabled={isLimitReached}
                  >
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <strong className="min-w-0 break-words font-display text-lg leading-snug">{product.name}</strong>
                      <StatusPill status={product.stock_status} />
                    </div>
                    <span className="mt-3 block text-2xl font-semibold text-shalom-blue dark:text-shalom-gold">{money.format(product.sale_price)}</span>
                    <span className="mission-muted mt-1 block text-sm">
                      {isUnavailable ? 'Indisponivel' : `${quantityInCart ? `${quantityInCart} no carrinho - ` : ''}${formatQuantityWithUnit(productAvailable, product.unit)}`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        </section>

        <aside id="sale-checkout" className="mission-panel min-w-0 scroll-mt-24 p-4 xl:sticky xl:top-24 xl:self-start">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Venda atual</h2>
            <p className="mission-muted text-sm">{cartItemCount} itens</p>
          </div>
          <ShoppingCart size={22} />
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
          {cart.length ? cart.map((item) => (
            <div key={item.key} className="mission-card min-w-0 p-3">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-medium">{item.name}</p>
                  <p className="mission-muted break-words text-sm">{money.format(item.sale_price)} - limite {getCartLimitLabel(item)}</p>
                </div>
                <button
                  type="button"
                  className="mission-btn flex min-h-11 w-full items-center justify-center gap-2 text-shalom-wine hover:bg-shalom-wine/10 sm:w-11"
                  onClick={() => changeQty(item.key, -item.quantity)}
                  title="Remover"
                  aria-label={`Remover ${item.name}`}
                >
                  <Trash2 size={16} />
                  <span className="sm:sr-only">Remover</span>
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="mission-btn flex h-11 w-11 items-center justify-center border border-line/80 dark:border-shalom-gold/20"
                    onClick={() => changeQty(item.key, -1)}
                    title="Diminuir"
                    aria-label={`Diminuir ${item.name}`}
                  >
                    <Minus size={15} />
                  </button>
                  <span className="w-8 text-center font-semibold">{item.quantity}</span>
                  <button
                    type="button"
                    className="mission-btn flex h-11 w-11 items-center justify-center border border-line/80 disabled:cursor-not-allowed disabled:opacity-45 dark:border-shalom-gold/20"
                    onClick={() => changeQty(item.key, 1)}
                    title="Aumentar"
                    aria-label={`Aumentar ${item.name}`}
                    disabled={item.quantity >= item.stockLimit}
                  >
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
      </div>

      {cart.length ? (
        <div className="mobile-cart-summary shrink-0 xl:hidden">
          <button
            type="button"
            className="mission-btn mission-btn-primary flex min-h-14 w-full min-w-0 items-center justify-between gap-2 px-3 py-3 font-semibold shadow-blue"
            onClick={() => document.getElementById('sale-checkout')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <span className="min-w-0 flex-1 truncate text-left">Carrinho ({cartItemCount})</span>
            <span className="shrink-0">{money.format(total)}</span>
            <span className="hidden shrink-0 text-xs uppercase tracking-wide min-[360px]:inline">Finalizar</span>
          </button>
        </div>
      ) : null}

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
