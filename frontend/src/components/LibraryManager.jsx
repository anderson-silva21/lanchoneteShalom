import { AlertTriangle, BookOpen, Boxes, CheckCircle2, Eye, PackagePlus, Plus, ReceiptText, Save, Search, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { decimal, formatDateTime, money } from '../utils/formatters'
import { MetricCard } from './MetricCard'

const emptyProduct = {
  name: '',
  description: '',
  category_id: '',
  sku: '',
  price: 0,
  cost_price: 0,
  stock_quantity: 0,
  min_stock: 1,
  active: true,
  published: false,
  image_url: ''
}

const tabs = [
  { key: 'overview', label: 'Visao geral', icon: TrendingUp },
  { key: 'products', label: 'Catalogo', icon: BookOpen },
  { key: 'inventory', label: 'Estoque', icon: Boxes },
  { key: 'sales', label: 'Vendas', icon: ReceiptText }
]

function newSaleKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `sale-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function canWrite(user) {
  return ['admin', 'library'].includes(user?.role)
}

export function LibraryManager({ user }) {
  const writable = canWrite(user)
  const [activeTab, setActiveTab] = useState('overview')
  const [dashboard, setDashboard] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [sales, setSales] = useState([])
  const [movements, setMovements] = useState([])
  const [filters, setFilters] = useState({ q: '', status: '' })
  const [productDraft, setProductDraft] = useState(emptyProduct)
  const [categoryDraft, setCategoryDraft] = useState({ name: '', description: '' })
  const [stockDraft, setStockDraft] = useState({ product_id: '', type: 'replenishment', operation: 'in', quantity: 1, reason: '' })
  const [saleDraft, setSaleDraft] = useState({ customer_name: '', payment_method: 'manual', notes: '', items: [] })
  const [saleItem, setSaleItem] = useState({ product_id: '', quantity: 1 })
  const [reviewSale, setReviewSale] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const saleLines = useMemo(() => saleDraft.items.map((item) => {
    const product = products.find((candidate) => Number(candidate.id) === Number(item.product_id))
    const quantity = Number(item.quantity || 0)
    return {
      ...item,
      product,
      line_total: Number(product?.price || 0) * quantity
    }
  }), [products, saleDraft.items])

  const saleTotal = saleLines.reduce((sum, line) => sum + line.line_total, 0)

  const loadData = useCallback(async () => {
    setMessage('')
    try {
      const [nextDashboard, nextCategories, nextProducts, nextSales, nextMovements] = await Promise.all([
        api.libraryDashboard(),
        api.libraryCategories(),
        api.libraryProducts(filters),
        api.librarySales(),
        api.libraryMovements()
      ])
      setDashboard(nextDashboard)
      setCategories(nextCategories)
      setProducts(nextProducts)
      setSales(nextSales)
      setMovements(nextMovements)
    } catch (err) {
      setMessage(err.message)
    }
  }, [filters])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function saveCategory(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await api.createLibraryCategory(categoryDraft)
      setCategoryDraft({ name: '', description: '' })
      await loadData()
      setMessage('Categoria da Livraria criada.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveProduct(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const payload = {
        ...productDraft,
        category_id: productDraft.category_id || null,
        images: productDraft.image_url ? [{ url: productDraft.image_url, alt_text: productDraft.name }] : []
      }
      await api.createLibraryProduct(payload)
      setProductDraft(emptyProduct)
      await loadData()
      setMessage('Produto da Livraria salvo.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function togglePublication(product) {
    setSaving(true)
    setMessage('')
    try {
      await api.updateLibraryProduct(product.id, {
        ...product,
        category_id: product.category_id || null,
        published: !product.published,
        images: product.images || []
      })
      await loadData()
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveMovement(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await api.createLibraryMovement(stockDraft)
      setStockDraft({ product_id: '', type: 'replenishment', operation: 'in', quantity: 1, reason: '' })
      await loadData()
      setMessage('Movimentacao da Livraria registrada.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  function addSaleItem(event) {
    event.preventDefault()
    if (!saleItem.product_id || Number(saleItem.quantity) <= 0) return
    setSaleDraft((current) => ({
      ...current,
      items: [...current.items, { product_id: Number(saleItem.product_id), quantity: Number(saleItem.quantity) }]
    }))
    setSaleItem({ product_id: '', quantity: 1 })
  }

  async function confirmSale() {
    setSaving(true)
    setMessage('')
    try {
      await api.createLibrarySale({
        ...saleDraft,
        idempotency_key: newSaleKey()
      })
      setSaleDraft({ customer_name: '', payment_method: 'manual', notes: '', items: [] })
      setReviewSale(false)
      await loadData()
      setMessage('Venda da Livraria registrada.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <section className="mission-panel p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-shalom-orange dark:text-shalom-gold">Shalom Store</p>
            <h2 className="font-display text-2xl font-semibold">Gestao da Livraria</h2>
            <p className="mission-muted mt-1 text-sm">Catalogo, estoque e vendas assistidas separados da Lanchonete.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`mission-btn inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold ${activeTab === tab.key ? 'mission-btn-primary' : 'border border-shalom-gold/30 bg-white/75 dark:border-shalom-gold/10 dark:bg-white/10'}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
        {message ? <p className="mt-4 rounded-xl border border-shalom-gold/30 bg-shalom-cream/70 px-4 py-3 text-sm font-medium dark:bg-white/10" aria-live="polite">{message}</p> : null}
        {!writable ? (
          <p className="mt-4 rounded-xl border border-shalom-gold/30 bg-white/70 px-4 py-3 text-sm font-medium dark:bg-white/10">Seu perfil permite acompanhamento financeiro e operacional, sem alteracoes no catalogo, estoque ou vendas.</p>
        ) : null}
      </section>

      {activeTab === 'overview' ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={BookOpen} label="Produtos ativos" value={decimal.format(dashboard?.products_count || 0)} detail={`${decimal.format(dashboard?.published_count || 0)} publicados`} />
          <MetricCard icon={Boxes} label="Unidades em estoque" value={decimal.format(dashboard?.units_in_stock || 0)} detail={`${money.format(dashboard?.inventory_value || 0)} em custo`} />
          <MetricCard icon={AlertTriangle} label="Baixo estoque" value={decimal.format(dashboard?.low_stock_count || 0)} detail="Reposicao e ajustes" tone="amber" />
          <MetricCard icon={TrendingUp} label="Receita Livraria" value={money.format(dashboard?.revenue || 0)} detail={`${money.format(dashboard?.gross_profit || 0)} de lucro bruto`} tone="green" />
        </section>
      ) : null}

      {activeTab === 'products' ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="mission-panel p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 translate-y-[-10%] text-shalom-blue/60" size={18} />
                <input className="mission-input mt-1 w-full px-10 py-2" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Buscar catalogo" />
              </label>
              <select className="mission-input mt-1 w-full px-3 py-2" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                <option value="">Ativos</option>
                <option value="published">Publicados</option>
                <option value="draft">Nao publicados</option>
                <option value="low">Baixo estoque</option>
                <option value="inactive">Inativos</option>
              </select>
            </div>
            <div className="mt-4 overflow-x-auto scrollbar-thin">
              <table className="min-w-[860px] w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.12em] text-shalom-blue/70 dark:text-shalom-gold/80">
                  <tr>
                    <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Produto</th>
                    <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Categoria</th>
                    <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Preco</th>
                    <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Estoque</th>
                    <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Publico</th>
                    <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td className="border-b border-line/80 px-3 py-2 font-semibold dark:border-shalom-gold/10">{product.name}<span className="mission-muted block text-xs">{product.sku}</span></td>
                      <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{product.category || '-'}</td>
                      <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{money.format(product.price)}</td>
                      <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{decimal.format(product.stock_quantity)} / min {decimal.format(product.min_stock)}</td>
                      <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{product.published ? 'Publicado' : 'Interno'}</td>
                      <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                        <button type="button" className="mission-btn inline-flex items-center gap-2 border border-line/80 px-3 py-2 font-semibold disabled:opacity-55 dark:border-shalom-gold/10" onClick={() => togglePublication(product)} disabled={!writable || saving}>
                          <Eye size={16} />
                          {product.published ? 'Retirar' : 'Publicar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="grid gap-4">
            <form className="mission-panel p-4" onSubmit={saveCategory}>
              <h3 className="font-display text-lg font-semibold">Nova categoria</h3>
              <input className="mission-input mt-3 w-full px-3 py-2" value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} placeholder="Nome" disabled={!writable} required />
              <textarea className="mission-input mt-3 w-full px-3 py-2" value={categoryDraft.description} onChange={(event) => setCategoryDraft({ ...categoryDraft, description: event.target.value })} placeholder="Descricao" disabled={!writable} rows={3} />
              <button type="submit" className="mission-btn mission-btn-gold mt-3 inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" disabled={!writable || saving}>
                <Plus size={17} />
                Criar categoria
              </button>
            </form>

            <form className="mission-panel p-4" onSubmit={saveProduct}>
              <h3 className="font-display text-lg font-semibold">Novo produto</h3>
              <div className="mt-3 grid gap-3">
                <input className="mission-input px-3 py-2" value={productDraft.name} onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })} placeholder="Nome" disabled={!writable} required />
                <select className="mission-input px-3 py-2" value={productDraft.category_id} onChange={(event) => setProductDraft({ ...productDraft, category_id: event.target.value })} disabled={!writable}>
                  <option value="">Sem categoria</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                <textarea className="mission-input px-3 py-2" value={productDraft.description} onChange={(event) => setProductDraft({ ...productDraft, description: event.target.value })} placeholder="Descricao publica" disabled={!writable} rows={3} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min="0" step="0.01" className="mission-input px-3 py-2" value={productDraft.price} onChange={(event) => setProductDraft({ ...productDraft, price: event.target.value })} placeholder="Preco" disabled={!writable} />
                  <input type="number" min="0" step="0.01" className="mission-input px-3 py-2" value={productDraft.cost_price} onChange={(event) => setProductDraft({ ...productDraft, cost_price: event.target.value })} placeholder="Custo" disabled={!writable} />
                  <input type="number" min="0" step="0.001" className="mission-input px-3 py-2" value={productDraft.stock_quantity} onChange={(event) => setProductDraft({ ...productDraft, stock_quantity: event.target.value })} placeholder="Estoque inicial" disabled={!writable} />
                  <input type="number" min="0" step="0.001" className="mission-input px-3 py-2" value={productDraft.min_stock} onChange={(event) => setProductDraft({ ...productDraft, min_stock: event.target.value })} placeholder="Minimo" disabled={!writable} />
                </div>
                <input className="mission-input px-3 py-2" value={productDraft.image_url} onChange={(event) => setProductDraft({ ...productDraft, image_url: event.target.value })} placeholder="URL da imagem" disabled={!writable} />
                <label className="flex items-center justify-between rounded-xl border border-line/80 px-3 py-2 text-sm font-semibold dark:border-shalom-gold/10">
                  Publicar no catalogo
                  <input type="checkbox" className="h-4 w-4 accent-shalom-orange" checked={productDraft.published} onChange={(event) => setProductDraft({ ...productDraft, published: event.target.checked })} disabled={!writable} />
                </label>
              </div>
              <button type="submit" className="mission-btn mission-btn-primary mt-3 inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" disabled={!writable || saving}>
                <Save size={17} />
                Salvar produto
              </button>
            </form>
          </aside>
        </section>
      ) : null}

      {activeTab === 'inventory' ? (
        <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <form className="mission-panel p-4" onSubmit={saveMovement}>
            <h3 className="font-display text-lg font-semibold">Movimentar estoque</h3>
            <div className="mt-3 grid gap-3">
              <select className="mission-input px-3 py-2" value={stockDraft.product_id} onChange={(event) => setStockDraft({ ...stockDraft, product_id: event.target.value })} disabled={!writable} required>
                <option value="">Produto</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name} - {decimal.format(product.stock_quantity)}</option>)}
              </select>
              <select className="mission-input px-3 py-2" value={stockDraft.operation} onChange={(event) => setStockDraft({ ...stockDraft, operation: event.target.value })} disabled={!writable}>
                <option value="in">Entrada</option>
                <option value="out">Saida/Ajuste negativo</option>
              </select>
              <input type="number" min="0.001" step="0.001" className="mission-input px-3 py-2" value={stockDraft.quantity} onChange={(event) => setStockDraft({ ...stockDraft, quantity: event.target.value })} disabled={!writable} />
              <textarea className="mission-input px-3 py-2" value={stockDraft.reason} onChange={(event) => setStockDraft({ ...stockDraft, reason: event.target.value })} placeholder="Motivo do ajuste" rows={3} disabled={!writable} required />
            </div>
            <button type="submit" className="mission-btn mission-btn-gold mt-3 inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" disabled={!writable || saving}>
              <PackagePlus size={17} />
              Registrar
            </button>
          </form>
          <div className="mission-panel p-4">
            <h3 className="font-display text-lg font-semibold">Historico de estoque</h3>
            <div className="mt-4 max-h-[520px] overflow-y-auto scrollbar-thin">
              {movements.map((movement) => (
                <article key={movement.id} className="border-b border-line/70 py-3 text-sm dark:border-shalom-gold/10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{movement.product_name}</p>
                      <p className="mission-muted">{movement.reason || movement.type}</p>
                    </div>
                    <div className="text-right">
                      <p className={movement.quantity_change >= 0 ? 'font-semibold text-emerald-700 dark:text-emerald-200' : 'font-semibold text-shalom-wine dark:text-rose-100'}>{decimal.format(movement.quantity_change)}</p>
                      <p className="mission-muted text-xs">{formatDateTime(movement.created_at)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'sales' ? (
        <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="mission-panel p-4">
            <h3 className="font-display text-lg font-semibold">Venda assistida</h3>
            <div className="mt-3 grid gap-3">
              <input className="mission-input px-3 py-2" value={saleDraft.customer_name} onChange={(event) => setSaleDraft({ ...saleDraft, customer_name: event.target.value })} placeholder="Cliente atendido" disabled={!writable} />
              <form className="grid grid-cols-[1fr_90px_auto] gap-2" onSubmit={addSaleItem}>
                <select className="mission-input px-3 py-2" value={saleItem.product_id} onChange={(event) => setSaleItem({ ...saleItem, product_id: event.target.value })} disabled={!writable}>
                  <option value="">Produto</option>
                  {products.filter((product) => product.stock_quantity > 0).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
                <input type="number" min="0.001" step="0.001" className="mission-input px-3 py-2" value={saleItem.quantity} onChange={(event) => setSaleItem({ ...saleItem, quantity: event.target.value })} disabled={!writable} />
                <button type="submit" className="mission-btn border border-line/80 px-3 py-2 dark:border-shalom-gold/10" disabled={!writable}><Plus size={17} /></button>
              </form>
              <div className="rounded-xl border border-line/80 p-3 dark:border-shalom-gold/10">
                {saleLines.map((line, index) => (
                  <div key={`${line.product_id}-${index}`} className="flex items-center justify-between gap-3 border-b border-line/60 py-2 last:border-0 dark:border-shalom-gold/10">
                    <span className="text-sm font-semibold">{line.product?.name || 'Produto'} x {decimal.format(line.quantity)}</span>
                    <strong>{money.format(line.line_total)}</strong>
                  </div>
                ))}
                {!saleLines.length ? <p className="mission-muted text-sm">Nenhum item adicionado.</p> : null}
                <div className="mt-3 flex justify-between text-lg font-semibold">
                  <span>Total</span>
                  <span>{money.format(saleTotal)}</span>
                </div>
              </div>
              <textarea className="mission-input px-3 py-2" value={saleDraft.notes} onChange={(event) => setSaleDraft({ ...saleDraft, notes: event.target.value })} placeholder="Observacoes do atendimento" rows={3} disabled={!writable} />
              <button type="button" className="mission-btn mission-btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" onClick={() => setReviewSale(true)} disabled={!writable || saving || !saleLines.length}>
                <CheckCircle2 size={17} />
                Revisar venda
              </button>
            </div>
          </div>
          <div className="mission-panel p-4">
            <h3 className="font-display text-lg font-semibold">Vendas recentes</h3>
            <div className="mt-4 max-h-[520px] overflow-y-auto scrollbar-thin">
              {sales.map((sale) => (
                <article key={sale.id} className="border-b border-line/70 py-3 text-sm dark:border-shalom-gold/10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Venda #{sale.id} {sale.customer_name ? `- ${sale.customer_name}` : ''}</p>
                      <p className="mission-muted">{sale.items.map((item) => `${item.item_name} x ${decimal.format(item.quantity)}`).join(', ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{money.format(sale.total)}</p>
                      <p className="mission-muted text-xs">{formatDateTime(sale.created_at)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {reviewSale ? (
        <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="library-sale-review">
          <div className="dashboard-modal-panel mission-panel p-4">
            <h3 id="library-sale-review" className="font-display text-xl font-semibold">Confirmar venda da Livraria</h3>
            <div className="dashboard-modal-body mt-4 grid gap-2">
              {saleLines.map((line, index) => (
                <div key={`${line.product_id}-${index}`} className="flex justify-between gap-3 rounded-xl border border-line/70 px-3 py-2 text-sm dark:border-shalom-gold/10">
                  <span>{line.product?.name} x {decimal.format(line.quantity)}</span>
                  <strong>{money.format(line.line_total)}</strong>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-lg font-semibold">
              <span>Total</span>
              <span>{money.format(saleTotal)}</span>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="mission-btn border border-line/80 px-4 py-3 font-semibold dark:border-shalom-gold/10" onClick={() => setReviewSale(false)} disabled={saving}>Voltar</button>
              <button type="button" className="mission-btn mission-btn-primary px-4 py-3 font-semibold" onClick={confirmSale} disabled={saving}>{saving ? 'Registrando...' : 'Confirmar e baixar estoque'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
