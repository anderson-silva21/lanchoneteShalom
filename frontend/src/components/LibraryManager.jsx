import { AlertTriangle, BookOpen, Boxes, CheckCircle2, Eye, Inbox, MessageCircle, PackagePlus, Pencil, Plus, ReceiptText, Save, Search, TrendingUp, UserRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { decimal, formatDateTime, money } from '../utils/formatters'
import { clearLibraryRequestDraft, draftForLibraryRequest, formatLibraryCustomerContact, updateLibraryRequestDraft } from '../utils/libraryRequestDrafts'
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
  { key: 'requests', label: 'Atendimentos', icon: Inbox },
  { key: 'products', label: 'Catalogo', icon: BookOpen },
  { key: 'inventory', label: 'Estoque', icon: Boxes },
  { key: 'sales', label: 'Vendas', icon: ReceiptText },
  { key: 'sellers', label: 'Vendedores', icon: UserRound }
]

function newSaleKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `sale-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function canWrite(user) {
  return ['admin', 'library'].includes(user?.role)
}

function whatsappContactUrl(contact) {
  const phone = String(contact || '').replace(/\D/g, '')
  return phone ? `https://wa.me/${phone}` : ''
}

export function LibraryManager({ user }) {
  const writable = canWrite(user)
  const [activeTab, setActiveTab] = useState('overview')
  const [dashboard, setDashboard] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [sales, setSales] = useState([])
  const [movements, setMovements] = useState([])
  const [requests, setRequests] = useState([])
  const [sellers, setSellers] = useState([])
  const [monitoring, setMonitoring] = useState({ sellers: [], unassigned_pending: 0 })
  const [filters, setFilters] = useState({ q: '', status: '' })
  const [requestFilters, setRequestFilters] = useState({ q: '', status: '' })
  const [productDraft, setProductDraft] = useState(emptyProduct)
  const [sellerDraft, setSellerDraft] = useState({ display_name: '', whatsapp_phone: '', active: true, eligible: true, user_id: '' })
  const [editingSellerId, setEditingSellerId] = useState(null)
  const [requestSaleDrafts, setRequestSaleDrafts] = useState({})
  const [editingProductId, setEditingProductId] = useState(null)
  const [categoryDraft, setCategoryDraft] = useState({ name: '', description: '' })
  const [stockDraft, setStockDraft] = useState({ product_id: '', type: 'replenishment', operation: 'in', quantity: 1, reason: '' })
  const [saleDraft, setSaleDraft] = useState({ customer_name: '', payment_method: 'manual', notes: '', items: [] })
  const [saleKey, setSaleKey] = useState(newSaleKey)
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
      const [nextDashboard, nextCategories, nextProducts, nextSales, nextMovements, nextRequests, nextSellers, nextMonitoring] = await Promise.all([
        api.libraryDashboard(),
        api.libraryCategories(),
        api.libraryProducts(filters),
        api.librarySales(),
        api.libraryMovements(),
        api.libraryRequests(requestFilters),
        api.librarySellers(),
        api.librarySellerMonitoring()
      ])
      setDashboard(nextDashboard)
      setCategories(nextCategories)
      setProducts(nextProducts)
      setSales(nextSales)
      setMovements(nextMovements)
      setRequests(nextRequests)
      setSellers(nextSellers)
      setMonitoring(nextMonitoring)
    } catch (err) {
      setMessage(err.message)
    }
  }, [filters, requestFilters])

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
      if (editingProductId) {
        await api.updateLibraryProduct(editingProductId, payload)
      } else {
        await api.createLibraryProduct(payload)
      }
      setProductDraft(emptyProduct)
      setEditingProductId(null)
      await loadData()
      setMessage(editingProductId ? 'Produto da Livraria atualizado.' : 'Produto da Livraria salvo.')
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

  function startProductEdit(product) {
    setEditingProductId(product.id)
    setProductDraft({
      name: product.name,
      description: product.description || '',
      category_id: product.category_id || '',
      sku: product.sku,
      price: product.price,
      cost_price: product.cost_price,
      stock_quantity: product.stock_quantity,
      min_stock: product.min_stock,
      active: Boolean(product.active),
      published: Boolean(product.published),
      image_url: product.images?.[0]?.url || ''
    })
  }

  function cancelProductEdit() {
    setEditingProductId(null)
    setProductDraft(emptyProduct)
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
        idempotency_key: saleKey
      })
      setSaleDraft({ customer_name: '', payment_method: 'manual', notes: '', items: [] })
      setSaleKey(newSaleKey())
      setReviewSale(false)
      await loadData()
      setMessage('Venda da Livraria registrada.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveSellerRecord(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const payload = { ...sellerDraft, user_id: sellerDraft.user_id || null }
      if (editingSellerId) await api.updateLibrarySeller(editingSellerId, payload)
      else await api.createLibrarySeller(payload)
      setSellerDraft({ display_name: '', whatsapp_phone: '', active: true, eligible: true, user_id: '' })
      setEditingSellerId(null)
      await loadData()
      setMessage(editingSellerId ? 'Vendedor atualizado.' : 'Vendedor criado.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  function startSellerEdit(seller) {
    setEditingSellerId(seller.id)
    setSellerDraft({
      display_name: seller.display_name,
      whatsapp_phone: seller.whatsapp_phone,
      active: Boolean(seller.active),
      eligible: Boolean(seller.eligible),
      user_id: seller.user_id || ''
    })
  }

  async function convertRequest(request) {
    setSaving(true)
    setMessage('')
    try {
      await api.convertLibraryRequest(request.reference, draftForLibraryRequest(requestSaleDrafts, request.reference))
      setRequestSaleDrafts((current) => clearLibraryRequestDraft(current, request.reference))
      await loadData()
      setMessage(`Carrinho ${request.reference} convertido em venda.`)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function cancelRequest(request) {
    setSaving(true)
    setMessage('')
    try {
      await api.cancelLibraryRequest(request.reference)
      await loadData()
      setMessage(`Carrinho ${request.reference} cancelado.`)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function reassignRequest(request, sellerId) {
    if (!sellerId) return
    setSaving(true)
    setMessage('')
    try {
      await api.reassignLibraryRequest(request.reference, { seller_id: sellerId, reason: 'Reatribuicao operacional pelo painel' })
      await loadData()
      setMessage(`Carrinho ${request.reference} reatribuido.`)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateRequestQuantity(request, productId, quantity) {
    const nextItems = request.items
      .map((item) => Number(item.product_id) === Number(productId) ? { product_id: item.product_id, quantity: Number(quantity) } : { product_id: item.product_id, quantity: item.requested_quantity })
      .filter((item) => Number(item.quantity) > 0)
    if (!nextItems.length) return
    setSaving(true)
    setMessage('')
    try {
      await api.updateLibraryRequestItems(request.reference, { items: nextItems })
      await loadData()
      setMessage(`Carrinho ${request.reference} atualizado.`)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  function updateRequestDraft(reference, patch) {
    setRequestSaleDrafts((current) => updateLibraryRequestDraft(current, reference, patch))
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

      {activeTab === 'requests' ? (
        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="mission-panel min-w-0 p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 translate-y-[-10%] text-shalom-blue/60" size={18} />
                <input className="mission-input mt-1 w-full px-10 py-2" value={requestFilters.q} onChange={(event) => setRequestFilters({ ...requestFilters, q: event.target.value })} placeholder="Buscar referencia, cliente ou contato" />
              </label>
              <select className="mission-input mt-1 w-full px-3 py-2" value={requestFilters.status} onChange={(event) => setRequestFilters({ ...requestFilters, status: event.target.value })}>
                <option value="">Todos</option>
                <option value="pending">Pendentes</option>
                <option value="in_progress">Em atendimento</option>
                <option value="completed">Concluidos</option>
                <option value="cancelled">Cancelados</option>
              </select>
            </div>
            <div className="mt-4 grid gap-3">
              {requests.map((request) => {
                const requestDraft = draftForLibraryRequest(requestSaleDrafts, request.reference)
                return (
                <article key={request.reference} className="min-w-0 rounded-xl border border-line/80 bg-white/70 p-4 text-sm dark:border-shalom-gold/10 dark:bg-white/10">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="font-display text-lg">{request.reference}</strong>
                        <span className="rounded-full border border-shalom-gold/40 px-2 py-1 text-xs font-semibold uppercase">{request.status}</span>
                        {request.has_availability_changes ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Revisar disponibilidade</span> : null}
                      </div>
                      <div className="mission-muted mt-2 grid gap-2 text-sm sm:grid-cols-2">
                        <span className="min-w-0 break-words"><strong className="text-shalom-deep dark:text-white">Cliente:</strong> {request.customer_name || 'Cliente nao informado'}</span>
                        <span className="flex min-w-0 items-center gap-2 break-words">
                          <strong className="text-shalom-deep dark:text-white">Contato:</strong> {formatLibraryCustomerContact(request.customer_contact)}
                          {request.customer_contact ? (
                            <a className="mission-btn inline-flex shrink-0 items-center justify-center border border-line/80 p-1.5 text-shalom-blue dark:border-shalom-gold/10 dark:text-shalom-gold" href={whatsappContactUrl(request.customer_contact)} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp do cliente">
                              <MessageCircle size={14} />
                            </a>
                          ) : null}
                        </span>
                        <span className="min-w-0 break-words"><strong className="text-shalom-deep dark:text-white">Vendedor:</strong> {request.seller?.display_name || 'Sem vendedor atribuido'}</span>
                        <span className="min-w-0"><strong className="text-shalom-deep dark:text-white">Criado:</strong> {formatDateTime(request.created_at)}</span>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {request.items.map((item) => (
                          <div key={item.id || item.product_id} className="grid min-w-0 gap-2 rounded-lg border border-line/70 px-3 py-2 dark:border-shalom-gold/10 sm:grid-cols-[minmax(0,1fr)_88px_120px] sm:items-center">
                            <span className="min-w-0 break-words font-medium">{item.product_name}</span>
                            <input
                              type="number"
                              min="0.001"
                              step="0.001"
                              className="mission-input min-w-0 px-2 py-1"
                              defaultValue={item.requested_quantity}
                              onBlur={(event) => {
                                if (Number(event.target.value) !== Number(item.requested_quantity)) updateRequestQuantity(request, item.product_id, event.target.value)
                              }}
                              disabled={!writable || saving || !['pending', 'in_progress'].includes(request.status)}
                              aria-label={`Quantidade de ${item.product_name}`}
                            />
                            <span className="text-right font-semibold">{money.format(item.line_total_current)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-left lg:text-right">
                      <p className="text-lg font-semibold">{money.format(request.current_total)}</p>
                      <p className="mission-muted text-xs">Estimado no pedido: {money.format(request.estimated_total)}</p>
                    </div>
                  </div>
                  {writable && ['pending', 'in_progress'].includes(request.status) ? (
                    <div className="mt-4 grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_150px_150px]">
                      <input className="mission-input min-w-0 px-3 py-2" value={requestDraft.customer_name} onChange={(event) => updateRequestDraft(request.reference, { customer_name: event.target.value })} placeholder={request.customer_name || 'Nome do cliente para venda'} />
                      <button type="button" className="mission-btn mission-btn-primary px-3 py-2 font-semibold disabled:opacity-55" onClick={() => convertRequest(request)} disabled={saving}>Converter</button>
                      <button type="button" className="mission-btn border border-line/80 px-3 py-2 font-semibold disabled:opacity-55 dark:border-shalom-gold/10" onClick={() => cancelRequest(request)} disabled={saving}>Cancelar</button>
                    </div>
                  ) : null}
                  {user?.role === 'admin' && ['pending', 'in_progress'].includes(request.status) ? (
                    <div className="mt-3">
                      <select className="mission-input w-full px-3 py-2" value={request.assigned_seller_id || ''} onChange={(event) => reassignRequest(request, event.target.value)} disabled={saving}>
                        <option value="">Reatribuir vendedor</option>
                        {sellers.filter((seller) => seller.active).map((seller) => <option key={seller.id} value={seller.id}>{seller.display_name}</option>)}
                      </select>
                    </div>
                  ) : null}
                </article>
                )
              })}
              {!requests.length ? <p className="rounded-xl border border-line/80 bg-white/70 px-4 py-5 font-medium dark:border-shalom-gold/10 dark:bg-white/10">Nenhum carrinho assistido encontrado.</p> : null}
            </div>
          </div>
          <aside className="mission-panel min-w-0 p-4">
            <h3 className="font-display text-lg font-semibold">Monitoramento rapido</h3>
            <p className="mission-muted mt-1 text-sm">{monitoring.unassigned_pending || 0} carrinho(s) sem vendedor.</p>
            <div className="mt-4 grid gap-3">
              {monitoring.sellers?.map((seller) => (
                <article key={seller.id} className="rounded-xl border border-line/70 p-3 text-sm dark:border-shalom-gold/10">
                  <div className="flex items-center justify-between gap-3">
                    <strong>{seller.display_name}</strong>
                    <span className={seller.active && seller.eligible ? 'text-emerald-700 dark:text-emerald-200' : 'text-shalom-wine dark:text-rose-100'}>{seller.active && seller.eligible ? 'Na rotacao' : 'Fora da rotacao'}</span>
                  </div>
                  <p className="mission-muted mt-2">Hoje {decimal.format(seller.assigned_today)} - Pend. {decimal.format(seller.pending)} - And. {decimal.format(seller.in_progress)} - Conc. {decimal.format(seller.completed)}</p>
                </article>
              ))}
            </div>
          </aside>
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
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="mission-btn inline-flex items-center gap-2 border border-line/80 px-3 py-2 font-semibold disabled:opacity-55 dark:border-shalom-gold/10" onClick={() => startProductEdit(product)} disabled={!writable || saving}>
                            <Pencil size={16} />
                            Editar
                          </button>
                          <button type="button" className="mission-btn inline-flex items-center gap-2 border border-line/80 px-3 py-2 font-semibold disabled:opacity-55 dark:border-shalom-gold/10" onClick={() => togglePublication(product)} disabled={!writable || saving}>
                            <Eye size={16} />
                            {product.published ? 'Retirar' : 'Publicar'}
                          </button>
                        </div>
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
              <button type="submit" className="mission-btn mission-btn-primary mt-3 inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" disabled={!writable || saving}>
                <Plus size={17} />
                Criar categoria
              </button>
            </form>

            <form className="mission-panel p-4" onSubmit={saveProduct}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">{editingProductId ? 'Editar produto' : 'Novo produto'}</h3>
                {editingProductId ? (
                  <button type="button" className="mission-btn border border-line/80 p-2 dark:border-shalom-gold/10" onClick={cancelProductEdit} title="Cancelar edicao" aria-label="Cancelar edicao">
                    <X size={16} />
                  </button>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3">
                <input className="mission-input px-3 py-2" value={productDraft.name} onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })} placeholder="Nome" disabled={!writable} required />
                <input className="mission-input px-3 py-2" value={productDraft.sku} onChange={(event) => setProductDraft({ ...productDraft, sku: event.target.value })} placeholder="SKU opcional" disabled={!writable} />
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
                <label className="flex items-center justify-between rounded-xl border border-line/80 px-3 py-2 text-sm font-semibold dark:border-shalom-gold/10">
                  Produto ativo
                  <input type="checkbox" className="h-4 w-4 accent-shalom-orange" checked={productDraft.active} onChange={(event) => setProductDraft({ ...productDraft, active: event.target.checked })} disabled={!writable} />
                </label>
              </div>
              <button type="submit" className="mission-btn mission-btn-primary mt-3 inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" disabled={!writable || saving}>
                <Save size={17} />
                {editingProductId ? 'Atualizar produto' : 'Salvar produto'}
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
            <button type="submit" className="mission-btn mission-btn-primary mt-3 inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" disabled={!writable || saving}>
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
        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="mission-panel min-w-0 p-4">
            <div>
              <h3 className="font-display text-lg font-semibold">Venda assistida manual</h3>
              <p className="mission-muted mt-1 text-sm">Use esta area para vendas presenciais. Carrinhos vindos da vitrine ficam em Atendimentos.</p>
            </div>
            <div className="mt-3 grid gap-3">
              <input className="mission-input min-w-0 px-3 py-2" value={saleDraft.customer_name} onChange={(event) => setSaleDraft({ ...saleDraft, customer_name: event.target.value })} placeholder="Cliente atendido" disabled={!writable} />
              <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_90px_48px]" onSubmit={addSaleItem}>
                <select className="mission-input min-w-0 px-3 py-2" value={saleItem.product_id} onChange={(event) => setSaleItem({ ...saleItem, product_id: event.target.value })} disabled={!writable}>
                  <option value="">Produto</option>
                  {products.filter((product) => product.stock_quantity > 0).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
                <input type="number" min="0.001" step="0.001" className="mission-input min-w-0 px-3 py-2" value={saleItem.quantity} onChange={(event) => setSaleItem({ ...saleItem, quantity: event.target.value })} disabled={!writable} />
                <button type="submit" className="mission-btn mission-btn-primary flex min-h-11 items-center justify-center px-3 py-2" disabled={!writable} aria-label="Adicionar item"><Plus size={17} /></button>
              </form>
              <div className="rounded-xl border border-line/80 p-3 dark:border-shalom-gold/10">
                {saleLines.map((line, index) => (
                  <div key={`${line.product_id}-${index}`} className="grid gap-1 border-b border-line/60 py-2 last:border-0 dark:border-shalom-gold/10 sm:grid-cols-[1fr_auto] sm:items-center">
                    <span className="min-w-0 text-sm font-semibold">{line.product?.name || 'Produto'} x {decimal.format(line.quantity)}</span>
                    <strong className="shrink-0 sm:text-right">{money.format(line.line_total)}</strong>
                  </div>
                ))}
                {!saleLines.length ? <p className="mission-muted text-sm">Nenhum item adicionado.</p> : null}
                <div className="mt-3 flex min-w-0 items-center justify-between gap-3 text-lg font-semibold">
                  <span>Total</span>
                  <span>{money.format(saleTotal)}</span>
                </div>
              </div>
              <textarea className="mission-input min-w-0 px-3 py-2" value={saleDraft.notes} onChange={(event) => setSaleDraft({ ...saleDraft, notes: event.target.value })} placeholder="Observacoes do atendimento" rows={3} disabled={!writable} />
              <button type="button" className="mission-btn mission-btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" onClick={() => {
                setSaleKey((current) => current || newSaleKey())
                setReviewSale(true)
              }} disabled={!writable || saving || !saleLines.length}>
                <CheckCircle2 size={17} />
                Revisar venda
              </button>
            </div>
          </div>
          <div className="mission-panel min-w-0 p-4">
            <div>
              <h3 className="font-display text-lg font-semibold">Vendas recentes</h3>
              <p className="mission-muted mt-1 text-sm">Historico com origem de atendimento, vendedor e totais.</p>
            </div>
            <div className="mt-4 max-h-[560px] overflow-y-auto scrollbar-thin">
              {sales.map((sale) => (
                <article key={sale.id} className="rounded-xl border border-line/70 bg-white/65 p-3 text-sm dark:border-shalom-gold/10 dark:bg-white/10">
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <p className="font-semibold">Venda #{sale.id} {sale.customer_name ? `- ${sale.customer_name}` : ''}</p>
                      <p className="mission-muted mt-1">{sale.items.map((item) => `${item.item_name} x ${decimal.format(item.quantity)}`).join(', ')}</p>
                      <p className="mission-muted mt-2 text-xs">
                        {sale.seller_name ? `Vendedor: ${sale.seller_name}` : 'Sem vendedor vinculado'}
                        {sale.assisted_request_id ? ` - Atendimento #${sale.assisted_request_id}` : ''}
                      </p>
                      {sale.notes ? <p className="mission-muted mt-1 text-xs">{sale.notes}</p> : null}
                    </div>
                    <div className="lg:text-right">
                      <p className="font-semibold">{money.format(sale.total)}</p>
                      <p className="mission-muted text-xs">{formatDateTime(sale.created_at)}</p>
                    </div>
                  </div>
                </article>
              ))}
              {!sales.length ? <p className="rounded-xl border border-line/80 bg-white/70 px-4 py-5 font-medium dark:border-shalom-gold/10 dark:bg-white/10">Nenhuma venda da Livraria registrada.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'sellers' ? (
        <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <form className="mission-panel p-4" onSubmit={saveSellerRecord}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold">{editingSellerId ? 'Editar vendedor' : 'Novo vendedor'}</h3>
              {editingSellerId ? (
                <button type="button" className="mission-btn border border-line/80 p-2 dark:border-shalom-gold/10" onClick={() => {
                  setEditingSellerId(null)
                  setSellerDraft({ display_name: '', whatsapp_phone: '', active: true, eligible: true, user_id: '' })
                }} aria-label="Cancelar edicao">
                  <X size={16} />
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3">
              <input className="mission-input px-3 py-2" value={sellerDraft.display_name} onChange={(event) => setSellerDraft({ ...sellerDraft, display_name: event.target.value })} placeholder="Nome exibido" disabled={user?.role !== 'admin'} required />
              <input className="mission-input px-3 py-2" value={sellerDraft.whatsapp_phone} onChange={(event) => setSellerDraft({ ...sellerDraft, whatsapp_phone: event.target.value })} placeholder="WhatsApp com DDI e DDD" disabled={user?.role !== 'admin'} required />
              <label className="flex items-center justify-between rounded-xl border border-line/80 px-3 py-2 text-sm font-semibold dark:border-shalom-gold/10">
                Vendedor ativo
                <input type="checkbox" className="h-4 w-4 accent-shalom-orange" checked={sellerDraft.active} onChange={(event) => setSellerDraft({ ...sellerDraft, active: event.target.checked })} disabled={user?.role !== 'admin'} />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-line/80 px-3 py-2 text-sm font-semibold dark:border-shalom-gold/10">
                Participa da rotacao
                <input type="checkbox" className="h-4 w-4 accent-shalom-orange" checked={sellerDraft.eligible} onChange={(event) => setSellerDraft({ ...sellerDraft, eligible: event.target.checked })} disabled={user?.role !== 'admin'} />
              </label>
            </div>
            <button type="submit" className="mission-btn mission-btn-primary mt-3 inline-flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold disabled:opacity-55" disabled={user?.role !== 'admin' || saving}>
              <Save size={17} />
              {editingSellerId ? 'Atualizar vendedor' : 'Salvar vendedor'}
            </button>
          </form>
          <div className="mission-panel p-4">
            <h3 className="font-display text-lg font-semibold">Vendedores da Livraria</h3>
            <div className="mt-4 overflow-x-auto scrollbar-thin">
              <table className="min-w-[720px] w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.12em] text-shalom-blue/70 dark:text-shalom-gold/80">
                  <tr>
                    <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Vendedor</th>
                    <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">WhatsApp</th>
                    <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Status</th>
                    <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Metricas</th>
                    <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((seller) => {
                    const stats = monitoring.sellers?.find((item) => Number(item.id) === Number(seller.id))
                    return (
                      <tr key={seller.id}>
                        <td className="border-b border-line/80 px-3 py-2 font-semibold dark:border-shalom-gold/10">{seller.display_name}</td>
                        <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{seller.whatsapp_phone}</td>
                        <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{seller.active ? 'Ativo' : 'Inativo'} / {seller.eligible ? 'na rotacao' : 'fora da rotacao'}</td>
                        <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">Hoje {decimal.format(stats?.assigned_today || 0)} - Pend. {decimal.format(stats?.pending || 0)}</td>
                        <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                          <button type="button" className="mission-btn inline-flex items-center gap-2 border border-line/80 px-3 py-2 font-semibold disabled:opacity-55 dark:border-shalom-gold/10" onClick={() => startSellerEdit(seller)} disabled={user?.role !== 'admin' || saving}>
                            <Pencil size={16} />
                            Editar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!sellers.length ? <p className="mt-4 rounded-xl border border-line/80 bg-white/70 px-4 py-5 font-medium dark:border-shalom-gold/10 dark:bg-white/10">Nenhum vendedor configurado.</p> : null}
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
