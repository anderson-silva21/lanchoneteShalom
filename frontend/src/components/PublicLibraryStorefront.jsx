import { ArrowLeft, BookOpen, Minus, MessageCircle, Plus, Search, ShoppingCart, Store, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { money } from '../utils/formatters'

const cartStorageKey = 'shalom_library_cart_v1'

function productImage(product) {
  return product.images?.[0]?.url || '/shalom.png'
}

function productIdFromPath() {
  const match = window.location.pathname.match(/\/livraria\/produto\/(\d+)/)
  return match ? Number(match[1]) : null
}

function newRequestKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `library-cart-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function readStoredCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(cartStorageKey) || '{}')
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      requestKey: parsed.requestKey || newRequestKey(),
      requestReference: parsed.requestReference || ''
    }
  } catch {
    return { items: [], requestKey: newRequestKey(), requestReference: '' }
  }
}

export function PublicLibraryStorefront() {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [filters, setFilters] = useState({ q: '', category_id: '' })
  const [cart, setCart] = useState(readStoredCart)
  const [cartOpen, setCartOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const selectedId = useMemo(() => productIdFromPath(), [])

  useEffect(() => {
    localStorage.setItem(cartStorageKey, JSON.stringify(cart))
  }, [cart])

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const [nextCategories, nextProducts] = await Promise.all([
        api.publicLibraryCategories(),
        api.publicLibraryProducts(filters)
      ])
      setCategories(nextCategories)
      setProducts(nextProducts)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  useEffect(() => {
    if (!selectedId) return
    api.publicLibraryProduct(selectedId)
      .then(setSelectedProduct)
      .catch((err) => setMessage(err.message))
  }, [selectedId])

  const cartCount = cart.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const cartTotal = cart.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0)

  function addToCart(product, amount = 1) {
    setCart((current) => {
      const existing = current.items.find((item) => Number(item.product_id) === Number(product.id))
      const nextItems = existing
        ? current.items.map((item) => Number(item.product_id) === Number(product.id) ? { ...item, quantity: Number(item.quantity) + amount } : item)
        : [...current.items, {
          product_id: product.id,
          name: product.name,
          price: product.price,
          image_url: productImage(product),
          quantity: amount
        }]
      return { items: nextItems, requestKey: newRequestKey(), requestReference: '' }
    })
    setMessage(`${product.name} foi adicionado ao carrinho.`)
  }

  function changeQuantity(productId, quantity) {
    const nextQuantity = Number(quantity)
    setCart((current) => ({
      items: current.items
        .map((item) => Number(item.product_id) === Number(productId) ? { ...item, quantity: nextQuantity } : item)
        .filter((item) => Number(item.quantity) > 0),
      requestKey: newRequestKey(),
      requestReference: ''
    }))
  }

  function clearCart() {
    setCart({ items: [], requestKey: newRequestKey(), requestReference: '' })
  }

  async function continueWhatsApp() {
    if (!cart.items.length) return
    setSending(true)
    setMessage('')
    try {
      const request = await api.createPublicLibraryRequest({
        idempotency_key: cart.requestKey,
        items: cart.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity }))
      })
      setCart((current) => ({ ...current, requestReference: request.reference }))
      if (request.whatsapp_url) {
        window.open(request.whatsapp_url, '_blank', 'noopener,noreferrer')
        setMessage(`Carrinho ${request.reference} enviado para atendimento.`)
      } else {
        setMessage(`Carrinho ${request.reference} salvo. A Livraria ainda nao possui vendedor disponivel para WhatsApp.`)
      }
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSending(false)
    }
  }

  function showProduct(product) {
    window.history.pushState({}, '', `/livraria/produto/${product.id}`)
    setSelectedProduct(product)
  }

  function backToCatalog() {
    window.history.pushState({}, '', '/livraria')
    setSelectedProduct(null)
  }

  const visibleProduct = selectedProduct

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-shalom-deep">
      <header className="sticky top-0 z-30 border-b border-shalom-gold/35 bg-white/92 px-4 py-4 shadow-sm backdrop-blur sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-shalom-deep text-white">
                <BookOpen size={22} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-shalom-orange">Shalom Store</p>
                <h1 className="font-display text-2xl font-semibold">Livraria Shalom</h1>
              </div>
            </div>
            <button type="button" className="mission-btn mission-btn-gold relative inline-flex items-center gap-2 px-3 py-2 font-semibold lg:hidden" onClick={() => setCartOpen(true)}>
              <ShoppingCart size={18} />
              {cartCount}
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-shalom-blue/60" size={18} />
              <input className="mission-input w-full rounded-xl py-3 pl-10 pr-3" value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Buscar produto" aria-label="Buscar produto" />
            </label>
            <select className="mission-input rounded-xl px-3 py-3" value={filters.category_id} onChange={(event) => setFilters((current) => ({ ...current, category_id: event.target.value }))} aria-label="Filtrar por categoria">
              <option value="">Todas</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <button type="button" className="mission-btn mission-btn-gold hidden items-center gap-2 px-4 py-3 font-semibold lg:inline-flex" onClick={() => setCartOpen(true)}>
              <ShoppingCart size={18} />
              Carrinho ({cartCount})
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10">
        {message ? <p className="mb-4 rounded-xl border border-shalom-gold/40 bg-white px-4 py-3 text-sm font-medium" aria-live="polite">{message}</p> : null}

        {visibleProduct ? (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <button type="button" className="mission-btn col-span-full inline-flex w-fit items-center gap-2 border border-shalom-gold/40 bg-white px-4 py-2 text-sm font-semibold" onClick={backToCatalog}>
              <ArrowLeft size={16} />
              Voltar
            </button>
            <div className="overflow-hidden rounded-xl border border-shalom-gold/35 bg-white">
              <img className="h-full max-h-[520px] min-h-[320px] w-full object-cover" src={productImage(visibleProduct)} alt={visibleProduct.images?.[0]?.alt_text || visibleProduct.name} />
            </div>
            <article className="flex flex-col justify-center">
              <p className="text-sm font-semibold text-shalom-orange">{visibleProduct.category || 'Livraria'}</p>
              <h2 className="mt-2 font-display text-3xl font-semibold">{visibleProduct.name}</h2>
              <p className="mt-4 text-3xl font-semibold">{money.format(visibleProduct.price)}</p>
              <p className="mt-3 font-medium text-shalom-blue">{visibleProduct.available ? 'Disponivel para atendimento pela Livraria' : 'Consulte disponibilidade com a Livraria'}</p>
              {visibleProduct.description ? <p className="mt-5 leading-7 text-shalom-deep/78">{visibleProduct.description}</p> : null}
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button type="button" className="mission-btn mission-btn-primary inline-flex items-center justify-center gap-2 px-5 py-3 font-semibold" onClick={() => addToCart(visibleProduct)}>
                  <ShoppingCart size={19} />
                  Adicionar ao carrinho
                </button>
                <button type="button" className="mission-btn border border-shalom-gold/40 bg-white px-5 py-3 font-semibold" onClick={() => setCartOpen(true)}>
                  Ver carrinho
                </button>
              </div>
            </article>
          </section>
        ) : (
          <>
            <section className="mb-6 flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-shalom-orange">
                <Store size={17} />
                Catalogo publico
              </p>
              <h2 className="font-display text-3xl font-semibold">Produtos selecionados para atendimento pela Livraria</h2>
            </section>
            {loading ? (
              <p className="rounded-xl border border-shalom-gold/35 bg-white px-4 py-5 font-medium">Carregando catalogo...</p>
            ) : (
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => (
                  <article key={product.id} className="mission-card overflow-hidden bg-white">
                    <button type="button" className="block w-full text-left" onClick={() => showProduct(product)}>
                      <img className="h-56 w-full object-cover" src={productImage(product)} alt={product.images?.[0]?.alt_text || product.name} />
                      <div className="p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-shalom-orange">{product.category || 'Livraria'}</p>
                        <h3 className="mt-2 min-h-12 font-display text-lg font-semibold">{product.name}</h3>
                        <p className="mt-3 text-xl font-semibold">{money.format(product.price)}</p>
                        <p className="mt-2 text-sm font-medium text-shalom-blue">{product.available ? 'Disponivel' : 'Consulte disponibilidade'}</p>
                      </div>
                    </button>
                    <div className="grid gap-2 px-4 pb-4">
                      <button type="button" className="mission-btn mission-btn-gold inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" onClick={() => addToCart(product)}>
                        <ShoppingCart size={18} />
                        Adicionar
                      </button>
                      <button type="button" className="mission-btn border border-shalom-gold/35 bg-white px-4 py-2 text-sm font-semibold" onClick={() => showProduct(product)}>
                        Ver detalhes
                      </button>
                    </div>
                  </article>
                ))}
                {!products.length ? <p className="col-span-full rounded-xl border border-shalom-gold/35 bg-white px-4 py-5 font-medium">Nenhum produto publicado encontrado.</p> : null}
              </section>
            )}
          </>
        )}
      </main>

      {cartOpen ? (
        <div className="fixed inset-0 z-40 bg-black/35" role="dialog" aria-modal="true" aria-labelledby="library-cart-title">
          <aside className="ml-auto flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-shalom-gold/25 px-4 py-4">
              <div>
                <h2 id="library-cart-title" className="font-display text-xl font-semibold">Carrinho da Livraria</h2>
                {cart.requestReference ? <p className="text-sm font-semibold text-shalom-orange">Referencia {cart.requestReference}</p> : null}
              </div>
              <button type="button" className="mission-btn border border-line/80 p-2" onClick={() => setCartOpen(false)} aria-label="Fechar carrinho">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {cart.items.map((item) => (
                <article key={item.product_id} className="grid grid-cols-[72px_1fr] gap-3 border-b border-line/70 py-3">
                  <img className="h-20 w-20 rounded-lg object-cover" src={item.image_url || '/shalom.png'} alt="" />
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{item.name}</h3>
                        <p className="text-sm text-shalom-blue">{money.format(item.price)} un.</p>
                      </div>
                      <button type="button" className="mission-btn border border-line/80 p-2" onClick={() => changeQuantity(item.product_id, 0)} aria-label="Remover item">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="grid grid-cols-[36px_64px_36px] overflow-hidden rounded-lg border border-line/80">
                        <button type="button" className="flex h-10 items-center justify-center" onClick={() => changeQuantity(item.product_id, Number(item.quantity) - 1)} aria-label="Diminuir quantidade">
                          <Minus size={15} />
                        </button>
                        <input className="h-10 border-x border-line/80 text-center font-semibold" type="number" min="1" value={item.quantity} onChange={(event) => changeQuantity(item.product_id, event.target.value)} aria-label="Quantidade" />
                        <button type="button" className="flex h-10 items-center justify-center" onClick={() => changeQuantity(item.product_id, Number(item.quantity) + 1)} aria-label="Aumentar quantidade">
                          <Plus size={15} />
                        </button>
                      </div>
                      <strong>{money.format(Number(item.price || 0) * Number(item.quantity || 0))}</strong>
                    </div>
                  </div>
                </article>
              ))}
              {!cart.items.length ? (
                <div className="rounded-xl border border-shalom-gold/35 bg-shalom-cream/70 px-4 py-8 text-center">
                  <ShoppingCart className="mx-auto text-shalom-orange" size={32} />
                  <p className="mt-3 font-semibold">Seu carrinho esta vazio.</p>
                </div>
              ) : null}
            </div>
            <div className="border-t border-shalom-gold/25 px-4 py-4">
              <div className="mb-4 flex items-center justify-between text-lg font-semibold">
                <span>Total estimado</span>
                <span>{money.format(cartTotal)}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" className="mission-btn border border-line/80 px-4 py-3 font-semibold disabled:opacity-55" onClick={clearCart} disabled={!cart.items.length || sending}>Limpar</button>
                <button type="button" className="mission-btn mission-btn-primary inline-flex items-center justify-center gap-2 px-4 py-3 font-semibold disabled:opacity-55" onClick={continueWhatsApp} disabled={!cart.items.length || sending}>
                  <MessageCircle size={18} />
                  {sending ? 'Abrindo...' : 'Continuar pelo WhatsApp'}
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
