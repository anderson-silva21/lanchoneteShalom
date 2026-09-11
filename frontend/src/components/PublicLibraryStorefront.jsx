import { ArrowLeft, BookOpen, MessageCircle, Search, Store } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { money } from '../utils/formatters'

function productImage(product) {
  return product.images?.[0]?.url || '/shalom.png'
}

function productIdFromPath() {
  const match = window.location.pathname.match(/\/livraria\/produto\/(\d+)/)
  return match ? Number(match[1]) : null
}

export function PublicLibraryStorefront() {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [filters, setFilters] = useState({ q: '', category_id: '' })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const selectedId = useMemo(() => productIdFromPath(), [])

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

  async function openInterest(product) {
    try {
      const result = await api.publicLibraryWhatsApp(product.id)
      window.open(result.whatsapp_url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setMessage(err.message)
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
      <header className="border-b border-shalom-gold/35 bg-white/88 px-4 py-4 shadow-sm backdrop-blur sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-shalom-deep text-white">
              <BookOpen size={22} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-shalom-orange">Shalom Store</p>
              <h1 className="font-display text-2xl font-semibold">Livraria Shalom</h1>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-shalom-blue/60" size={18} />
              <input
                className="mission-input w-full rounded-xl py-3 pl-10 pr-3"
                value={filters.q}
                onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                placeholder="Buscar produto"
                aria-label="Buscar produto"
              />
            </label>
            <select
              className="mission-input rounded-xl px-3 py-3"
              value={filters.category_id}
              onChange={(event) => setFilters((current) => ({ ...current, category_id: event.target.value }))}
              aria-label="Filtrar por categoria"
            >
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10">
        {message ? (
          <p className="mb-4 rounded-xl border border-shalom-gold/40 bg-white px-4 py-3 text-sm font-medium" aria-live="polite">{message}</p>
        ) : null}

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
              <button
                type="button"
                className="mission-btn mission-btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 px-5 py-3 font-semibold sm:w-fit"
                onClick={() => openInterest(visibleProduct)}
              >
                <MessageCircle size={19} />
                Tenho interesse
              </button>
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
                    <div className="px-4 pb-4">
                      <button type="button" className="mission-btn mission-btn-gold inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" onClick={() => openInterest(product)}>
                        <MessageCircle size={18} />
                        Falar com a Livraria
                      </button>
                    </div>
                  </article>
                ))}
                {!products.length ? (
                  <p className="col-span-full rounded-xl border border-shalom-gold/35 bg-white px-4 py-5 font-medium">Nenhum produto publicado encontrado.</p>
                ) : null}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
