import { ArrowLeft, BadgePercent, ChevronRight, Minus, PackagePlus, Plus, Search, ShoppingCart, Trash2, UserRound } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { api } from '../services/api'
import { decimal, formatQuantityWithUnit, money } from '../utils/formatters'
import { addPosCartItem, changePosCartQuantity, getPosCartSummary } from '../utils/posCart'
import { SaleConfirmationModal } from './sales/SaleConfirmationModal'

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

const ProductButton = memo(function ProductButton({ item, type = 'product', quantity, limit, onAdd, onChangeQuantity }) {
  const unavailable = limit <= 0
  const limitReached = unavailable || quantity >= limit
  const [imageFailed, setImageFailed] = useState(false)
  const key = `${type}-${item.id}`

  useEffect(() => setImageFailed(false), [item.image_url])

  function changeQuantity(event, delta) {
    event.preventDefault()
    event.stopPropagation()
    onChangeQuantity(key, delta)
  }

  return (
    <article
      className={`pos-product-card relative flex min-h-32 min-w-0 flex-col justify-between overflow-hidden border-b border-r border-line/70 bg-white/55 p-3 text-left transition active:bg-shalom-gold/20 dark:border-shalom-gold/10 dark:bg-white/5 dark:active:bg-white/10 sm:min-h-36 sm:p-4 ${quantity > 0 ? 'pos-product-card-selected' : ''} ${limitReached ? 'pos-product-card-limit' : ''}`}
    >
      <button type="button" className="min-w-0 flex-1 text-left disabled:cursor-not-allowed" onClick={() => onAdd(item, type)} disabled={limitReached} aria-label={`${unavailable ? 'Indisponivel: ' : quantity > 0 ? 'Adicionar mais uma unidade de ' : 'Adicionar '}${item.name}`}>
        <span className="pos-product-visual relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded bg-shalom-cream/70 text-xl font-semibold text-shalom-deep/60 dark:bg-white/10 dark:text-shalom-gold/80" aria-hidden="true">
          {type === 'product' && item.image_url && !imageFailed ? <img className="h-full w-full object-cover" src={item.image_url} alt="" loading="lazy" onError={() => setImageFailed(true)} /> : type === 'combo' ? 'C' : item.name.trim().charAt(0).toUpperCase()}
          {quantity > 0 ? <span className="absolute right-2 top-2 rounded-full bg-shalom-blue px-2 py-1 text-xs font-bold text-white dark:bg-shalom-gold dark:text-shalom-deep">x{quantity}</span> : null}
        </span>
        <span className="mt-3 block min-w-0">
          <strong className="pos-product-name line-clamp-2 block break-words text-sm leading-snug">{item.name}</strong>
          <span className="mt-1 block font-semibold text-shalom-blue dark:text-shalom-gold lg:text-lg">{money.format(item.sale_price)}</span>
          {unavailable ? <span className="mt-1 block text-xs text-shalom-wine dark:text-rose-200">Indisponivel</span> : null}
        </span>
      </button>
      {quantity > 0 ? <div className="mt-3 flex min-h-11 items-center justify-between rounded-md border border-line/80 bg-white/65 dark:border-shalom-gold/15 dark:bg-white/5">
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md" onClick={(event) => changeQuantity(event, -1)} aria-label={`Diminuir quantidade de ${item.name}`}><Minus size={18} /></button>
        <strong className="min-w-8 text-center" aria-live="polite">{quantity}</strong>
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md disabled:opacity-35" onClick={(event) => changeQuantity(event, 1)} disabled={limitReached} aria-label={`Aumentar quantidade de ${item.name}`}><Plus size={18} /></button>
      </div> : null}
    </article>
  )
})

function PosCatalog({ products, combos, cart, total, itemCount, message, catalogLoading, catalogError, onAdd, onChangeQuantity, onOpenCart }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const categoryNames = useMemo(() => ['Todos', ...(combos.length ? ['Combos'] : []), ...new Set(products.map((product) => product.category).filter(Boolean))], [combos, products])
  const cartQuantities = useMemo(() => new Map(cart.map((item) => [item.key, item.quantity])), [cart])
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
  const visibleItems = useMemo(() => {
    const source = [
      ...combos.map((item) => ({ item, type: 'combo', category: 'Combos' })),
      ...products.map((item) => ({ item, type: 'product', category: item.category }))
    ]
    return source.filter(({ item, category: itemCategory }) => {
      const matchesCategory = category === 'Todos' || category === itemCategory
      const searchable = `${item.name} ${item.code || item.sku || ''}`.toLocaleLowerCase('pt-BR')
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery))
    })
  }, [category, combos, normalizedQuery, products])

  return (
    <section className={`pos-view pos-catalog-view mx-auto min-w-0 max-w-[1400px] ${itemCount > 0 ? 'pos-view-with-action' : ''}`}>
      <div className="pos-catalog-header sticky -top-4 z-20 -mx-3 border-b border-line/80 bg-[#f8f8f8]/95 px-3 pb-2 pt-1 backdrop-blur dark:border-shalom-gold/10 dark:bg-shalom-night/95 sm:-mx-5 sm:px-5 lg:mx-0 lg:px-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 className="font-display text-xl font-semibold lg:text-2xl">Vender</h2><p className="mission-muted mt-1 hidden text-sm lg:block">Selecione os produtos para esta venda</p></div>
          <button type="button" className="flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-shalom-blue dark:text-shalom-gold" onClick={onOpenCart}>
            <UserRound size={18} aria-hidden="true" /> Cliente
          </button>
        </div>
        <label className="relative block max-w-3xl lg:mt-5">
          <span className="sr-only">Buscar produto ou codigo</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 mission-muted" size={19} aria-hidden="true" />
          <input className="mission-input h-11 w-full pl-10 pr-3" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto ou codigo" type="search" />
        </label>
        <div className="scrollbar-hidden -mx-3 mt-2 flex gap-5 overflow-x-auto px-3 sm:mx-0 sm:px-0 lg:mt-4 lg:gap-7" role="tablist" aria-label="Categorias de produtos">
          {categoryNames.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={category === name} className={`section-text-tab ${category === name ? 'section-text-tab-active' : ''}`} onClick={() => setCategory(name)}>{name}</button>
          ))}
        </div>
      </div>

      {message ? <p className="my-3 border-l-4 border-shalom-orange bg-white/60 px-3 py-2 text-sm dark:bg-white/5" role="status">{message}</p> : null}
      {catalogLoading ? <p className="py-12 text-center mission-muted" role="status">Carregando produtos...</p> : catalogError ? <div className="py-12 text-center" role="alert"><p className="font-semibold text-shalom-wine dark:text-rose-200">Nao foi possivel carregar os produtos.</p><p className="mission-muted mt-2 text-sm">{catalogError}</p></div> : visibleItems.length ? (
        <div className="pos-product-grid grid border-l border-t border-line/70 dark:border-shalom-gold/10">
          {visibleItems.map(({ item, type }) => {
            const key = `${type}-${item.id}`
            const quantity = cartQuantities.get(key) || 0
            const limit = Math.floor(Math.max(0, Number(type === 'combo' ? item.max_available : item.stock_quantity) || 0))
            return <ProductButton key={key} item={item} type={type} quantity={quantity} limit={limit} onAdd={onAdd} onChangeQuantity={onChangeQuantity} />
          })}
        </div>
      ) : <p className="py-12 text-center mission-muted">Nenhum produto encontrado.</p>}

      {itemCount > 0 ? (
        <div className="pos-action-bar fixed inset-x-3 z-30 md:sticky md:inset-x-auto md:bottom-4 md:mt-5 lg:static lg:inset-auto lg:mt-auto lg:pt-6">
          <button type="button" className="mission-btn mission-btn-primary mx-auto flex min-h-14 w-full max-w-2xl items-center gap-3 px-4 py-3 font-semibold shadow-blue lg:max-w-none lg:px-6" onClick={onOpenCart}>
            <span>{itemCount} {itemCount === 1 ? 'item' : 'itens'}</span><span className="ml-auto">{money.format(total)}</span><span className="hidden text-sm lg:inline">Ver carrinho</span><ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </section>
  )
}

function PosCart({ cart, total, payment, customerName, notes, loading, message, onBack, onChangeQty, onPaymentChange, onCustomerChange, onNotesChange, onCheckout }) {
  return (
    <section className={`pos-view mx-auto min-w-0 max-w-3xl ${cart.length ? 'pos-view-with-action' : ''}`}>
      <header className="mb-2 flex items-center gap-2 border-b border-line/80 pb-3 dark:border-shalom-gold/10">
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md" onClick={onBack} aria-label="Voltar ao catalogo"><ArrowLeft size={22} /></button>
        <div><h2 className="font-display text-xl font-semibold">Carrinho</h2><p className="mission-muted text-xs">{cart.length ? 'Revise os itens e o pagamento' : 'Sua venda ainda nao tem itens'}</p></div>
      </header>

      {cart.length ? <div className="divide-y divide-line/80 dark:divide-shalom-gold/10">{cart.map((item) => (
        <article key={item.key} className="py-4">
          <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{item.name}</h3><p className="mission-muted mt-1 text-sm">{money.format(item.sale_price)} cada</p></div><strong className="shrink-0">{money.format(item.sale_price * item.quantity)}</strong></div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center rounded-md border border-line/80 dark:border-shalom-gold/20"><button type="button" className="flex h-11 w-11 items-center justify-center" onClick={() => onChangeQty(item.key, -1)} aria-label={`Diminuir ${item.name}`}><Minus size={17} /></button><span className="w-9 text-center font-semibold">{item.quantity}</span><button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-40" onClick={() => onChangeQty(item.key, 1)} disabled={item.quantity >= item.stockLimit} aria-label={`Aumentar ${item.name}`}><Plus size={17} /></button></div>
            <button type="button" className="flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-shalom-wine dark:text-rose-200" onClick={() => onChangeQty(item.key, -item.quantity)} aria-label={`Remover ${item.name}`}><Trash2 size={17} /> Remover</button>
          </div>
        </article>
      ))}</div> : <div className="py-16 text-center"><ShoppingCart className="mx-auto mission-muted" size={30} /><p className="mt-3 font-semibold">Carrinho vazio</p><button type="button" className="mt-3 min-h-11 px-4 font-semibold text-shalom-blue dark:text-shalom-gold" onClick={onBack}>Adicionar produtos</button></div>}

      {cart.length ? <div className="mt-3 border-t border-line/80 pt-4 dark:border-shalom-gold/10">
        <label className="block text-sm font-medium">Pagamento<select className="mission-input mt-2 h-11 w-full px-3" value={payment} onChange={(event) => onPaymentChange(event.target.value)}><option value="pix">Pix</option><option value="cartao">Cartao</option><option value="dinheiro">Dinheiro</option><option value="pagamento_pendente">Pagamento pendente</option></select></label>
        {payment === 'pagamento_pendente' ? <label className="mt-4 block text-sm font-medium">Pessoa/cliente<input className="mission-input mt-2 h-11 w-full px-3" value={customerName} onChange={(event) => onCustomerChange(event.target.value)} placeholder="Nome de quem ficou pendente" /></label> : null}
        <label className="mt-4 block text-sm font-medium">Observacoes<textarea className="mission-input mt-2 min-h-20 w-full px-3 py-2" value={notes} onChange={(event) => onNotesChange(event.target.value)} /></label>
        {message ? <p className="mt-3 border-l-4 border-shalom-orange bg-white/60 px-3 py-2 text-sm dark:bg-white/5" role="status">{message}</p> : null}
        <div className="mt-5 flex items-center justify-between border-t border-line/80 pt-4 dark:border-shalom-gold/10"><span className="mission-muted">Total</span><strong className="font-display text-2xl text-shalom-blue dark:text-shalom-gold">{money.format(total)}</strong></div>
      </div> : null}

      {cart.length ? <div className="pos-action-bar fixed inset-x-3 z-30 md:sticky md:inset-x-auto md:bottom-4 md:mt-6"><button type="button" className="mission-btn mission-btn-primary mx-auto flex min-h-14 w-full max-w-2xl items-center justify-between gap-2 px-4 py-3 text-sm font-semibold shadow-blue sm:text-base" onClick={onCheckout} disabled={loading}><span className="whitespace-nowrap">{loading ? 'Registrando...' : <><span className="hidden min-[360px]:inline">Continuar para </span>pagamento</>}</span><span className="flex shrink-0 items-center gap-1 whitespace-nowrap">{money.format(total)} <ChevronRight size={20} /></span></button></div> : null}
    </section>
  )
}

export function ComboCreatorModal({ products, onClose, onCreated, initialCombo = null, initialKind = 'promotion' }) {
  const [draft, setDraft] = useState(() => initialCombo ? {
    kind: initialCombo.is_promotion ? 'promotion' : 'combo',
    name: initialCombo.name,
    sale_price: initialCombo.sale_price,
    quantities: Object.fromEntries(initialCombo.items.map((item) => [item.id, item.quantity])),
    active: Boolean(initialCombo.active)
  } : { ...createEmptyComboDraft(), kind: initialKind, active: true })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [productQuery, setProductQuery] = useState('')

  const selectedItems = products
    .map((product) => ({ product, quantity: Number(draft.quantities[product.id] || 0) }))
    .filter((item) => item.quantity > 0)
  const regularPrice = selectedItems.reduce((sum, item) => sum + item.product.sale_price * item.quantity, 0)
  const salePrice = Number(String(draft.sale_price).replace(',', '.')) || 0
  const savings = regularPrice - salePrice
  const discountPercentage = regularPrice > 0 ? (savings / regularPrice) * 100 : 0
  const normalizedProductQuery = productQuery.trim().toLocaleLowerCase('pt-BR')
  const availableProducts = products.filter((product) => {
    if (Number(draft.quantities[product.id] || 0) > 0) return false
    if (!normalizedProductQuery) return true
    return `${product.name} ${product.category || ''}`.toLocaleLowerCase('pt-BR').includes(normalizedProductQuery)
  })

  function updateProductQuantity(product, nextValue) {
    const maximum = Math.max(0, Math.floor(Number(product.stock_quantity) || 0))
    const quantity = Math.min(maximum, Math.max(0, Math.floor(Number(nextValue) || 0)))
    setDraft((current) => ({
      ...current,
      quantities: { ...current.quantities, [product.id]: quantity || '' }
    }))
  }

  async function submit(event) {
    event.preventDefault()
    setMessage('')

    if (!selectedItems.length) {
      setMessage('Selecione ao menos um produto.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: draft.name,
        sale_price: Number(String(draft.sale_price).replace(',', '.')),
        is_promotion: draft.kind === 'promotion',
        expires_at: draft.kind === 'promotion' ? endOfTodayIso() : null,
        active: draft.active,
        items: selectedItems.map(({ product, quantity }) => ({
          product_id: product.id,
          quantity
        }))
      }
      const combo = initialCombo ? await api.updateCombo(initialCombo.id, payload) : await api.createCombo(payload)
      onCreated(combo)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
      <section className="mx-auto min-w-0 w-full max-w-4xl" aria-labelledby="combo-modal-title">
        <div className="flex min-w-0 items-center gap-2 border-b border-line/80 px-4 py-3 dark:border-shalom-gold/10">
          <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center text-shalom-blue dark:text-shalom-gold" onClick={onClose} aria-label="Voltar" title="Voltar">
            <ArrowLeft size={21} />
          </button>
          <div className="min-w-0">
            <h2 id="combo-modal-title" className="truncate font-display text-xl font-semibold">{initialCombo ? 'Editar' : 'Criar'} {draft.kind === 'promotion' ? 'promocao' : 'combo'}</h2>
            <p className="mission-muted truncate text-sm">Configure os itens e o preco de venda.</p>
          </div>
        </div>

        <form className="px-4 pb-24 lg:pb-0" onSubmit={submit}>
          <section className="py-5">
            <h3 className="font-semibold">Informacoes basicas</h3>
            <div className="scrollbar-hidden mt-2 flex gap-6 overflow-x-auto" role="tablist" aria-label="Tipo da oferta">
              {[['combo', 'Combo'], ['promotion', 'Promocao']].map(([kind, label]) => (
                <button key={kind} type="button" role="tab" aria-selected={draft.kind === kind} className={`section-text-tab ${draft.kind === kind ? 'section-text-tab-active' : ''}`} onClick={() => setDraft((current) => ({ ...current, kind }))}>{label}</button>
              ))}
            </div>
            <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <label className="block text-sm font-medium">
                Nome {draft.kind === 'promotion' ? 'da promocao' : 'do combo'}
                <input className="mission-input mt-1 w-full px-3 py-2.5" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder={draft.kind === 'promotion' ? 'Ex.: Oferta do dia' : 'Ex.: Combo lanche'} required />
              </label>
              {initialCombo ? <label className="flex min-h-11 items-center justify-between gap-3 self-end border-y border-line/70 py-2 text-sm font-medium dark:border-shalom-gold/10">Ativo<input type="checkbox" className="h-5 w-5 accent-shalom-orange" checked={draft.active} onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))} /></label> : null}
            </div>
          </section>

          <section className="border-t border-line/80 py-5 dark:border-shalom-gold/10">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-semibold">Produtos selecionados</h3>
              <span className="mission-muted text-sm">{selectedItems.length} itens</span>
            </div>
            {selectedItems.length ? (
              <div className="mt-2 divide-y divide-line/70 dark:divide-shalom-gold/10">
                {selectedItems.map(({ product, quantity }) => (
                  <div key={product.id} className="flex min-w-0 items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">{product.name}</strong>
                      <span className="mission-muted text-xs">{money.format(product.sale_price)} cada - {money.format(product.sale_price * quantity)}</span>
                    </div>
                    <div className="flex h-11 shrink-0 items-center border-y border-line/80 dark:border-shalom-gold/15">
                      <button type="button" className="flex h-11 w-11 items-center justify-center" onClick={() => updateProductQuantity(product, quantity - 1)} aria-label={`Diminuir quantidade de ${product.name}`}><Minus size={17} /></button>
                      <input className="w-10 bg-transparent text-center text-sm font-semibold outline-none" type="number" inputMode="numeric" min="0" max={Math.floor(Number(product.stock_quantity) || 0)} step="1" value={quantity} onChange={(event) => updateProductQuantity(product, event.target.value)} aria-label={`Quantidade de ${product.name}`} />
                      <button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-35" onClick={() => updateProductQuantity(product, quantity + 1)} disabled={quantity >= Math.floor(Number(product.stock_quantity) || 0)} aria-label={`Aumentar quantidade de ${product.name}`}><Plus size={17} /></button>
                    </div>
                    <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center text-shalom-wine dark:text-rose-200" onClick={() => updateProductQuantity(product, 0)} aria-label={`Remover ${product.name}`} title="Remover"><Trash2 size={17} /></button>
                  </div>
                ))}
              </div>
            ) : <p className="mission-muted py-4 text-sm">Nenhum produto adicionado.</p>}
            {message === 'Selecione ao menos um produto.' ? <p className="text-sm text-shalom-wine dark:text-rose-200">{message}</p> : null}

            <div className="mt-4 border-t border-line/70 pt-4 dark:border-shalom-gold/10">
              <label className="relative block">
                <span className="mb-1 block text-sm font-medium">Buscar produto</span>
                <Search className="pointer-events-none absolute bottom-3 left-3 text-shalom-orange/70" size={17} aria-hidden="true" />
                <input type="search" className="mission-input h-11 w-full pl-10 pr-3" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Nome ou categoria" />
              </label>
              <div className="mt-2 max-h-56 divide-y divide-line/70 overflow-y-auto scrollbar-thin dark:divide-shalom-gold/10">
                {availableProducts.map((product) => (
                  <div key={product.id} className="flex min-w-0 items-center gap-3 py-3">
                    <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{product.name}</strong><span className="mission-muted block truncate text-xs">{money.format(product.sale_price)} - {formatQuantityWithUnit(product.stock_quantity, product.unit)} disponiveis</span></span>
                    <button type="button" className="flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-shalom-blue disabled:opacity-35 dark:text-shalom-gold" onClick={() => updateProductQuantity(product, 1)} disabled={Number(product.stock_quantity) < 1}><Plus size={17} />Adicionar</button>
                  </div>
                ))}
                {!availableProducts.length ? <p className="mission-muted py-4 text-sm">Nenhum produto disponivel.</p> : null}
              </div>
            </div>
          </section>

          <section className="border-t border-line/80 py-5 dark:border-shalom-gold/10">
            <h3 className="font-semibold">Preco e condicao</h3>
            <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2">
              <div><p className="mission-muted text-xs">Preco normal</p><strong className="mt-1 block font-display text-xl text-shalom-blue dark:text-shalom-gold">{money.format(regularPrice)}</strong></div>
              <label className="block text-sm font-medium">
                {draft.kind === 'promotion' ? 'Preco promocional' : 'Preco do combo'}
                <input className="mission-input mt-1 w-full px-3 py-2.5" inputMode="decimal" value={draft.sale_price} onChange={(event) => setDraft((current) => ({ ...current, sale_price: event.target.value }))} placeholder="0,00" required />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 border-t border-line/60 pt-3 text-sm dark:border-shalom-gold/10">
              <span><span className="mission-muted">Economia: </span><strong>{money.format(savings)}</strong></span>
              {draft.kind === 'promotion' ? <span><span className="mission-muted">Desconto: </span><strong>{decimal.format(discountPercentage)}%</strong></span> : null}
            </div>
          </section>

          {draft.kind === 'promotion' ? <section className="border-t border-line/80 py-5 dark:border-shalom-gold/10"><h3 className="font-semibold">Periodo</h3><p className="mission-muted mt-2 text-sm">A promocao expira automaticamente ao final do dia.</p></section> : null}

          <section className="border-t border-line/80 py-5 dark:border-shalom-gold/10">
            <h3 className="font-semibold">Resumo</h3>
            <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-3"><dt className="mission-muted">Produtos</dt><dd className="font-semibold">{selectedItems.length}</dd></div>
              <div className="flex justify-between gap-3"><dt className="mission-muted">Preco normal</dt><dd className="font-semibold">{money.format(regularPrice)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="mission-muted">Preco final</dt><dd className="font-semibold">{money.format(salePrice)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="mission-muted">Economia</dt><dd className="font-semibold">{money.format(savings)}</dd></div>
            </dl>
          </section>

          {message && message !== 'Selecione ao menos um produto.' ? <p className="border-l-2 border-shalom-wine px-3 py-1 text-sm text-shalom-wine dark:text-rose-100">{message}</p> : null}

          <div className="offer-editor-actions fixed inset-x-0 z-30 flex gap-2 border-t border-line/80 bg-white/95 px-3 py-2 backdrop-blur dark:border-shalom-gold/10 dark:bg-shalom-night/95 lg:static lg:mx-0 lg:mt-4 lg:justify-end lg:px-0 lg:py-3">
            <button type="button" className="min-h-11 px-4 py-2.5 text-sm font-semibold text-shalom-deep dark:text-slate-200" onClick={onClose}>Cancelar</button>
            <button type="submit" className="mission-btn mission-btn-primary flex min-h-11 flex-1 items-center justify-center gap-2 px-5 py-2.5 font-semibold lg:flex-none" disabled={saving}>
              {draft.kind === 'promotion' ? <BadgePercent size={18} /> : <PackagePlus size={18} />}
              {saving ? 'Salvando...' : initialCombo ? 'Salvar alteracoes' : draft.kind === 'promotion' ? 'Criar promocao' : 'Criar combo'}
            </button>
          </div>
        </form>
      </section>
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
  const [showSaleConfirmation, setShowSaleConfirmation] = useState(false)
  const [confirmationError, setConfirmationError] = useState('')
  const [mobileView, setMobileView] = useState('catalog')
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const saleSubmissionRef = useRef(false)

  const loadData = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError('')
    try {
      const [productData, comboData] = await Promise.all([
        api.posProducts(),
        api.combos()
      ])
      setProducts(productData.filter((product) => product.sale_price > 0))
      setCombos(comboData)
    } catch (error) {
      setCatalogError(error.message)
      throw error
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData().catch((err) => setMessage(err.message))
  }, [loadData])

  const { total, itemCount: cartItemCount } = useMemo(() => getPosCartSummary(cart), [cart])

  function getCartLimitLabel(item) {
    if (item.type === 'combo') return `${item.stockLimit} disponiveis`
    return formatQuantityWithUnit(item.stockLimit, item.unit)
  }

  const addItem = useCallback((item, type = 'product') => {
    const key = `${type}-${item.id}`
    const available = type === 'combo' ? item.max_available : item.stock_quantity
    const stockLimit = Math.floor(Math.max(0, Number(available || 0)))

    if (stockLimit <= 0) {
      setMessage(`${item.name} esta indisponivel no estoque.`)
      return
    }

    setCart((current) => {
      const existingQuantity = current.find((cartItem) => cartItem.key === key)?.quantity || 0
      if (existingQuantity + 1 > stockLimit) {
        setMessage(`${item.name} ja atingiu o limite disponivel (${type === 'combo' ? `${stockLimit} disponiveis` : formatQuantityWithUnit(stockLimit, item.unit)}).`)
        return current
      }
      setMessage('')
      return addPosCartItem(current, item, type)
    })
  }, [])

  const changeQty = useCallback((key, delta) => {
    setCart((current) => changePosCartQuantity(current, key, delta))
  }, [])

function validateSale() {
  if (!cart.length) {
    return 'Adicione ao menos um item para finalizar a venda.'
  }

  const exceededItem = cart.find((item) => item.quantity > item.stockLimit)

  if (exceededItem) {
    return `${exceededItem.name} passou do limite disponivel (${getCartLimitLabel(exceededItem)}).`
  }

  if (payment === 'pagamento_pendente' && !customerName.trim()) {
    return 'Informe a pessoa ou cliente do pagamento pendente.'
  }

  return ''
}

function openSaleConfirmation() {
  const validationError = validateSale()

  if (validationError) {
    setMessage(validationError)
    return
  }

  setMessage('')
  setConfirmationError('')
  setShowSaleConfirmation(true)
}

function closeSaleConfirmation() {
  if (loading) return

  setShowSaleConfirmation(false)
  setConfirmationError('')
}
  async function finishSale() {
    if (saleSubmissionRef.current) {
      return
    }

    const validationError = validateSale()

    if (validationError) {
      setConfirmationError(validationError)
      return
    }

    saleSubmissionRef.current = true
    setLoading(true)
    setConfirmationError('')

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

      setShowSaleConfirmation(false)
      setCart([])
      setMobileView('catalog')
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
      setConfirmationError(err.message)
    } finally {
      saleSubmissionRef.current = false
      setLoading(false)
    }
  }

  return (
    <div className="min-w-0">
      {mobileView === 'catalog' ? (
        <PosCatalog
          products={products}
          combos={combos}
          cart={cart}
          total={total}
          itemCount={cartItemCount}
          message={message}
          catalogLoading={catalogLoading}
          catalogError={catalogError}
          onAdd={addItem}
          onChangeQuantity={changeQty}
          onOpenCart={() => setMobileView('cart')}
        />
      ) : (
        <PosCart
          cart={cart}
          total={total}
          payment={payment}
          customerName={customerName}
          notes={notes}
          loading={loading}
          message={message}
          onBack={() => setMobileView('catalog')}
          onChangeQty={changeQty}
          onPaymentChange={setPayment}
          onCustomerChange={setCustomerName}
          onNotesChange={setNotes}
          onCheckout={openSaleConfirmation}
        />
      )}

      {showSaleConfirmation ? (
        <SaleConfirmationModal
          cart={cart}
          total={total}
          itemCount={cartItemCount}
          payment={payment}
          customerName={customerName}
          notes={notes}
          loading={loading}
          error={confirmationError}
          onClose={closeSaleConfirmation}
          onConfirm={finishSale}
        />
      ) : null}
  </div>
  )
}
