import { ArrowUpDown, ChevronDown, ChevronRight, Download, Eye, Filter, History, MessageCircle, Minus, PackagePlus, Pencil, Plus, Save, Search, ShoppingCart, Trash2, UserRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Area, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../services/api'
import { decimal, formatDate, formatDateTime, money } from '../utils/formatters'
import { formatLibraryCustomerContact } from '../utils/libraryRequestDrafts'
import { cartFromLibraryRequest, filterLibrarySaleProducts, normalizeLibrarySaleProducts } from '../utils/librarySale'
import { addPosCartItem, changePosCartQuantity, getPosCartSummary } from '../utils/posCart'

const emptyProduct = {
  name: '',
  description: '',
  category_id: '',
  sku: '',
  price: 0,
  cost_price: 0,
  stock_quantity: 0,
  min_stock: 0,
  active: true,
  published: false,
  image_url: ''
}

const tabs = [
  { key: 'overview', label: 'Visao geral' },
  { key: 'requests', label: 'Atendimentos' },
  { key: 'products', label: 'Catalogo' },
  { key: 'inventory', label: 'Estoque' },
  { key: 'sales', label: 'Vendas' },
  { key: 'installments', label: 'Parcelas' },
  { key: 'sellers', label: 'Vendedores' },
  { key: 'spreadsheet', label: 'Planilha' }
]

const periodOptions = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Ultimos 7 dias' },
  { value: '30d', label: 'Ultimos 30 dias' },
  { value: 'month', label: 'Este mes' },
  { value: 'previous_month', label: 'Mes anterior' },
  { value: 'year', label: 'Este ano' },
  { value: 'custom', label: 'Personalizado' }
]

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

function daysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return isoDate(date)
}

function monthStart(offset = 0) {
  const date = new Date()
  return isoDate(new Date(date.getFullYear(), date.getMonth() + offset, 1))
}

function monthEnd(offset = 0) {
  const date = new Date()
  return isoDate(new Date(date.getFullYear(), date.getMonth() + offset + 1, 0))
}

function yearStart() {
  const date = new Date()
  return isoDate(new Date(date.getFullYear(), 0, 1))
}

function periodToRange(period, customRange = {}) {
  const today = isoDate(new Date())
  if (period === 'today') return { start_date: today, end_date: today }
  if (period === '7d') return { start_date: daysAgo(6), end_date: today }
  if (period === '30d') return { start_date: daysAgo(29), end_date: today }
  if (period === 'month') return { start_date: monthStart(), end_date: today }
  if (period === 'previous_month') return { start_date: monthStart(-1), end_date: monthEnd(-1) }
  if (period === 'year') return { start_date: yearStart(), end_date: today }
  return {
    start_date: customRange.start_date || '',
    end_date: customRange.end_date || ''
  }
}

function variationText(value) {
  if (value === null || value === undefined) return ''
  const prefix = Number(value) >= 0 ? '+' : ''
  return `${prefix}${decimal.format(value)}% vs. periodo anterior`
}

function LibraryMetric({ label, value, detail }) {
  return (
    <div className="min-w-0 border-l-2 border-shalom-blue/20 py-1 pl-3 dark:border-shalom-gold/25">
      <p className="mission-muted text-xs font-medium">{label}</p>
      <strong className="mt-1 block min-w-0 break-words font-display text-xl font-semibold leading-tight text-shalom-deep dark:text-white">{value}</strong>
      {detail ? <p className="mission-muted mt-1 truncate text-xs">{detail}</p> : null}
    </div>
  )
}

function newSaleKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `sale-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function canWrite(user) {
  return ['admin', 'library'].includes(user?.role)
}

const libraryPaymentMethods = [
  { value: 'manual', label: 'Manual', installments: false },
  { value: 'dinheiro', label: 'Dinheiro', installments: false },
  { value: 'pix', label: 'PIX', installments: false },
  { value: 'cartao_credito', label: 'Cartao de credito', installments: true },
  { value: 'cartao_debito', label: 'Cartao de debito', installments: false }
]

function allowsInstallments(paymentMethod) {
  return libraryPaymentMethods.some((method) => method.value === paymentMethod && method.installments)
}

function installmentPreview(total, count) {
  const installments = Math.max(Number(count || 1), 1)
  if (installments <= 1) return ''
  const cents = Math.round(Number(total || 0) * 100)
  const base = Math.floor(cents / installments)
  const remainder = cents % installments
  const first = (base + (remainder > 0 ? 1 : 0)) / 100
  return `${installments}x de ${money.format(first)}`
}

function whatsappContactUrl(contact) {
  const phone = String(contact || '').replace(/\D/g, '')
  return phone ? `https://wa.me/${phone}` : ''
}

function installmentStatusLabel(status) {
  return { unpaid: 'Pendente', partially_paid: 'Parcial', paid: 'Pago', overdue: 'Vencido', cancelled: 'Cancelado' }[status] || status
}

function LibrarySaleProductCard({ product, quantity, writable, onAdd, onChangeQuantity }) {
  const [imageFailed, setImageFailed] = useState(false)
  const unavailable = Number(product.stock_quantity || 0) <= 0
  const limitReached = unavailable || quantity >= Number(product.stock_quantity || 0)

  useEffect(() => setImageFailed(false), [product.image_url])

  function changeQuantity(event, delta) {
    event.preventDefault()
    event.stopPropagation()
    onChangeQuantity(`product-${product.id}`, delta)
  }

  return (
    <article className={`pos-product-card relative flex min-h-32 min-w-0 flex-col justify-between overflow-hidden border-b border-r border-line/70 bg-white/55 p-3 text-left transition active:bg-shalom-gold/20 dark:border-shalom-gold/10 dark:bg-white/5 dark:active:bg-white/10 sm:min-h-36 sm:p-4 ${quantity > 0 ? 'pos-product-card-selected' : ''} ${limitReached ? 'pos-product-card-limit' : ''}`}>
      <button type="button" className="min-w-0 flex-1 text-left disabled:cursor-not-allowed" onClick={() => onAdd(product)} disabled={!writable || limitReached} aria-label={`${unavailable ? 'Indisponivel: ' : quantity ? 'Adicionar mais uma unidade de ' : 'Adicionar '}${product.name}`}>
        <span className="pos-product-visual relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded bg-shalom-cream/70 text-xl font-semibold text-shalom-deep/60 dark:bg-white/10 dark:text-shalom-gold/80" aria-hidden="true">
          {product.image_url && !imageFailed ? <img className="h-full w-full object-cover" src={product.image_url} alt="" loading="lazy" onError={() => setImageFailed(true)} /> : product.name.trim().charAt(0).toUpperCase()}
          {quantity > 0 ? <span className="absolute right-2 top-2 rounded-full bg-shalom-blue px-2 py-1 text-xs font-bold text-white dark:bg-shalom-gold dark:text-shalom-deep">x{quantity}</span> : null}
        </span>
        <span className="mt-3 block min-w-0">
          <strong className="pos-product-name line-clamp-2 block break-words text-sm leading-snug">{product.name}</strong>
          <span className="mt-1 block font-semibold text-shalom-blue dark:text-shalom-gold lg:text-lg">{money.format(product.sale_price)}</span>
          {unavailable ? <span className="mt-1 block text-xs text-shalom-wine dark:text-rose-200">Sem estoque</span> : null}
        </span>
      </button>
      {quantity > 0 ? (
        <div className="mt-3 flex min-h-11 items-center justify-between rounded-md border border-line/80 bg-white/65 dark:border-shalom-gold/15 dark:bg-white/5">
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md" onClick={(event) => changeQuantity(event, -1)} aria-label={`Diminuir quantidade de ${product.name}`}><Minus size={18} /></button>
          <strong className="min-w-8 text-center" aria-live="polite">{quantity}</strong>
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md disabled:opacity-35" onClick={(event) => changeQuantity(event, 1)} disabled={limitReached} aria-label={`Aumentar quantidade de ${product.name}`}><Plus size={18} /></button>
        </div>
      ) : null}
    </article>
  )
}

export function LibraryManager({ user }) {
  const writable = canWrite(user)
  const canManageLibraryFinance = ['admin', 'finance'].includes(user?.role)
  const location = useLocation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [catalogMenuOpen, setCatalogMenuOpen] = useState(false)
  const [dashboard, setDashboard] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [saleProducts, setSaleProducts] = useState([])
  const [sales, setSales] = useState([])
  const [movements, setMovements] = useState([])
  const [requests, setRequests] = useState([])
  const [sellers, setSellers] = useState([])
  const [monitoring, setMonitoring] = useState({ sellers: [], unassigned_pending: 0 })
  const [filters, setFilters] = useState({ q: '', status: '' })
  const [requestFilters, setRequestFilters] = useState({ q: '', status: '' })
  const [dashboardPeriod, setDashboardPeriod] = useState('30d')
  const [dashboardCustomRange, setDashboardCustomRange] = useState({ start_date: '', end_date: '' })
  const [spreadsheetFilters, setSpreadsheetFilters] = useState({
    q: '',
    start_date: '',
    end_date: '',
    product_id: '',
    category_id: '',
    seller_id: '',
    payment_method: '',
    status: '',
    sort: 'data_hora',
    order: 'desc',
    page: 1,
    page_size: 50
  })
  const [stockSpreadsheetFilters, setStockSpreadsheetFilters] = useState({
    q: '',
    category_id: '',
    active: 'active',
    published: '',
    stock: '',
    sort: 'produto',
    order: 'asc',
    page: 1,
    page_size: 50
  })
  const [spreadsheetSection, setSpreadsheetSection] = useState('sales')
  const [spreadsheetFilterDraft, setSpreadsheetFilterDraft] = useState(null)
  const [stockSpreadsheetFilterDraft, setStockSpreadsheetFilterDraft] = useState(null)
  const [spreadsheetExportOpen, setSpreadsheetExportOpen] = useState(false)
  const [spreadsheet, setSpreadsheet] = useState({ rows: [], summary: {}, pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 } })
  const [stockSpreadsheet, setStockSpreadsheet] = useState({ rows: [], summary: {}, pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 } })
  const [spreadsheetOptions, setSpreadsheetOptions] = useState({ products: [], categories: [], sellers: [], payment_methods: [], statuses: [] })
  const [spreadsheetLoading, setSpreadsheetLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [sellerVisibility, setSellerVisibility] = useState('active')
  const [productDraft, setProductDraft] = useState(emptyProduct)
  const [sellerDraft, setSellerDraft] = useState({ display_name: '', whatsapp_phone: '', active: true, eligible: true, user_id: '' })
  const [editingSellerId, setEditingSellerId] = useState(null)
  const [editingProductId, setEditingProductId] = useState(null)
  const [categoryDraft, setCategoryDraft] = useState({ name: '', description: '' })
  const [stockDraft, setStockDraft] = useState({ product_id: '', type: 'replenishment', operation: 'in', quantity: 1, reason: '' })
  const [saleDraft, setSaleDraft] = useState({ customer_name: '', customer_contact: '', payment_method: 'manual', payment_mode: 'full', payment_installments: 1, receivable_installments: 2, first_due_date: isoDate(new Date()), first_installment_paid: false, notes: '', items: [] })
  const [saleKey, setSaleKey] = useState(newSaleKey)
  const [activeSaleRequest, setActiveSaleRequest] = useState(null)
  const [completedSale, setCompletedSale] = useState(null)
  const [saleQuery, setSaleQuery] = useState('')
  const [saleCategory, setSaleCategory] = useState('Todos')
  const [installmentPlans, setInstallmentPlans] = useState([])
  const [installmentFilters, setInstallmentFilters] = useState({ status: '', q: '' })
  const [installmentPlan, setInstallmentPlan] = useState(null)
  const [payingInstallmentId, setPayingInstallmentId] = useState(null)
  const [installmentPaymentDraft, setInstallmentPaymentDraft] = useState({ payment_method: 'pix', paid_at: isoDate(new Date()), notes: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const normalizedSaleProducts = useMemo(() => normalizeLibrarySaleProducts(saleProducts), [saleProducts])
  const saleCategories = useMemo(() => ['Todos', ...new Set(normalizedSaleProducts.map((product) => product.category).filter(Boolean))], [normalizedSaleProducts])
  const visibleSaleProducts = useMemo(() => filterLibrarySaleProducts(normalizedSaleProducts, saleQuery, saleCategory), [normalizedSaleProducts, saleCategory, saleQuery])
  const saleQuantities = useMemo(() => new Map(saleDraft.items.map((item) => [item.key, item.quantity])), [saleDraft.items])
  const { total: saleTotal, itemCount: saleItemCount } = useMemo(() => getPosCartSummary(saleDraft.items), [saleDraft.items])
  const dashboardRange = useMemo(() => periodToRange(dashboardPeriod, dashboardCustomRange), [dashboardPeriod, dashboardCustomRange])
  const catalogProductMatch = location.pathname.match(/^\/gestao-livraria\/catalogo\/produtos\/([^/]+)$/)
  const catalogProductId = catalogProductMatch?.[1] === 'novo' ? null : catalogProductMatch?.[1]
  const isNewProductRoute = location.pathname === '/gestao-livraria/catalogo/produtos/novo'
  const isNewCategoryRoute = location.pathname === '/gestao-livraria/catalogo/categorias/nova'
  const isProductFormRoute = isNewProductRoute || Boolean(catalogProductId)
  const isCatalogChildRoute = isProductFormRoute || isNewCategoryRoute
  const isLibrarySaleRoute = location.pathname.startsWith('/gestao-livraria/vender')
  const saleStage = !isLibrarySaleRoute || location.pathname.endsWith('/vender') ? 'catalog' : location.pathname.split('/').at(-1)
  const isSaleChildRoute = isLibrarySaleRoute && saleStage !== 'catalog'
  const installmentMatch = location.pathname.match(/^\/gestao-livraria\/parcelas\/(\d+)$/)
  const installmentPlanId = installmentMatch?.[1] || ''
  const isInstallmentRoute = location.pathname.startsWith('/gestao-livraria/parcelas')
  const isInstallmentDetailRoute = Boolean(installmentMatch)
  const spreadsheetFilterMatch = location.pathname.match(/^\/gestao-livraria\/planilha\/filtros\/(vendas|estoque)$/)
  const spreadsheetFilterSection = spreadsheetFilterMatch?.[1] || ''
  const isSpreadsheetRoute = location.pathname.startsWith('/gestao-livraria/planilha')
  const isSpreadsheetFilterRoute = Boolean(spreadsheetFilterMatch)

  useEffect(() => {
    if (location.pathname.startsWith('/gestao-livraria/catalogo')) setActiveTab('products')
    if (isLibrarySaleRoute) setActiveTab('sales')
    if (isInstallmentRoute) setActiveTab('installments')
    if (isSpreadsheetRoute) {
      setActiveTab('spreadsheet')
      if (spreadsheetFilterSection) setSpreadsheetSection(spreadsheetFilterSection === 'estoque' ? 'stock' : 'sales')
    }
  }, [isInstallmentRoute, isLibrarySaleRoute, isSpreadsheetRoute, location.pathname, spreadsheetFilterSection])

  useEffect(() => {
    if (!isSpreadsheetFilterRoute) return
    setSpreadsheetFilterDraft({ ...spreadsheetFilters })
    setStockSpreadsheetFilterDraft({ ...stockSpreadsheetFilters })
    // Drafts are refreshed only when the dedicated filter page is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpreadsheetFilterRoute])

  const loadData = useCallback(async () => {
    setMessage('')
    try {
      const [nextDashboard, nextCategories, nextProducts, nextSaleProducts, nextSales, nextMovements, nextRequests, nextSellers, nextMonitoring] = await Promise.all([
        api.libraryDashboard(dashboardRange),
        api.libraryCategories(),
        api.libraryProducts(filters),
        api.libraryProducts(),
        api.librarySales(),
        api.libraryMovements(),
        api.libraryRequests(requestFilters),
        api.librarySellersByVisibility(sellerVisibility),
        api.librarySellerMonitoring()
      ])
      setDashboard(nextDashboard)
      setCategories(nextCategories)
      setProducts(nextProducts)
      setSaleProducts(nextSaleProducts)
      setSales(nextSales)
      setMovements(nextMovements)
      setRequests(nextRequests)
      setSellers(nextSellers)
      setMonitoring(nextMonitoring)
    } catch (err) {
      setMessage(err.message)
    }
  }, [dashboardRange, filters, requestFilters, sellerVisibility])

  useEffect(() => {
    loadData()
  }, [loadData])

  const loadInstallments = useCallback(async () => {
    if (!canManageLibraryFinance || activeTab !== 'installments') return
    setMessage('')
    try {
      if (installmentPlanId) {
        setInstallmentPlan(await api.libraryInstallmentPlan(installmentPlanId))
      } else {
        setInstallmentPlans(await api.libraryInstallmentPlans(installmentFilters))
      }
    } catch (err) {
      setMessage(err.message)
    }
  }, [activeTab, canManageLibraryFinance, installmentFilters, installmentPlanId])

  useEffect(() => {
    loadInstallments()
  }, [loadInstallments])

  const loadSpreadsheet = useCallback(async () => {
    if (activeTab !== 'spreadsheet') return
    setSpreadsheetLoading(true)
    setMessage('')
    try {
      const activeFilters = spreadsheetSection === 'stock'
        ? { ...stockSpreadsheetFilters, section: 'stock' }
        : spreadsheetFilters
      const [nextOptions, nextSpreadsheet] = await Promise.all([
        api.librarySpreadsheetOptions(),
        api.librarySpreadsheet(activeFilters)
      ])
      setSpreadsheetOptions(nextOptions)
      if (spreadsheetSection === 'stock') setStockSpreadsheet(nextSpreadsheet)
      else setSpreadsheet(nextSpreadsheet)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSpreadsheetLoading(false)
    }
  }, [activeTab, spreadsheetFilters, spreadsheetSection, stockSpreadsheetFilters])

  useEffect(() => {
    loadSpreadsheet()
  }, [loadSpreadsheet])

  function updateSpreadsheetFilter(patch) {
    setSpreadsheetFilters((current) => ({ ...current, ...patch, page: patch.page || 1 }))
  }

  function updateStockSpreadsheetFilter(patch) {
    setStockSpreadsheetFilters((current) => ({ ...current, ...patch, page: patch.page || 1 }))
  }

  function sortSpreadsheet(column) {
    setSpreadsheetFilters((current) => ({
      ...current,
      sort: column,
      order: current.sort === column && current.order === 'desc' ? 'asc' : 'desc',
      page: 1
    }))
  }

  function sortStockSpreadsheet(column) {
    setStockSpreadsheetFilters((current) => ({
      ...current,
      sort: column,
      order: current.sort === column && current.order === 'desc' ? 'asc' : 'desc',
      page: 1
    }))
  }

  async function exportSpreadsheet(format) {
    setExporting(true)
    setMessage('Gerando relatorio...')
    try {
      const activeFilters = spreadsheetSection === 'stock'
        ? { ...stockSpreadsheetFilters, section: 'stock' }
        : spreadsheetFilters
      await api.downloadLibrarySpreadsheet(activeFilters, format)
      setMessage('Relatorio gerado.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setExporting(false)
      setSpreadsheetExportOpen(false)
    }
  }

  function openSpreadsheetFilters() {
    setSpreadsheetFilterDraft({ ...spreadsheetFilters })
    setStockSpreadsheetFilterDraft({ ...stockSpreadsheetFilters })
    navigate(`/gestao-livraria/planilha/filtros/${spreadsheetSection === 'stock' ? 'estoque' : 'vendas'}`)
  }

  function applySpreadsheetFilters(event) {
    event.preventDefault()
    if (spreadsheetSection === 'stock') {
      setStockSpreadsheetFilters((current) => ({ ...current, ...stockSpreadsheetFilterDraft, page: 1 }))
    } else {
      setSpreadsheetFilters((current) => ({ ...current, ...spreadsheetFilterDraft, page: 1 }))
    }
    navigate('/gestao-livraria/planilha')
  }

  function clearSpreadsheetFilterDraft() {
    if (spreadsheetSection === 'stock') {
      setStockSpreadsheetFilterDraft((current) => ({ ...current, category_id: '', active: 'active', published: '', stock: '' }))
    } else {
      setSpreadsheetFilterDraft((current) => ({ ...current, start_date: '', end_date: '', product_id: '', category_id: '', seller_id: '', payment_method: '', status: '' }))
    }
  }

  async function saveCategory(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await api.createLibraryCategory(categoryDraft)
      setCategoryDraft({ name: '', description: '' })
      await loadData()
      setMessage('Categoria da Livraria criada.')
      navigate('/gestao-livraria/catalogo')
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
      navigate('/gestao-livraria/catalogo')
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

  useEffect(() => {
    if (!catalogProductId || String(editingProductId) === String(catalogProductId)) return
    const product = products.find((candidate) => String(candidate.id) === String(catalogProductId))
    if (!product) return
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
  }, [catalogProductId, editingProductId, products])

  useEffect(() => {
    if (!isNewProductRoute) return
    setEditingProductId(null)
    setProductDraft(emptyProduct)
  }, [isNewProductRoute])

  function selectTab(tab) {
    setActiveTab(tab)
    setCatalogMenuOpen(false)
    if (tab === 'products') {
      navigate('/gestao-livraria/catalogo')
    } else if (tab === 'sales') {
      navigate('/gestao-livraria/vender')
    } else if (tab === 'installments') {
      navigate('/gestao-livraria/parcelas')
    } else if (tab === 'spreadsheet') {
      navigate('/gestao-livraria/planilha')
    } else if (location.pathname.startsWith('/gestao-livraria/catalogo') || isLibrarySaleRoute || isInstallmentRoute || isSpreadsheetRoute) {
      navigate('/gestao-livraria')
    }
  }

  function openNewProduct() {
    cancelProductEdit()
    setCatalogMenuOpen(false)
    navigate('/gestao-livraria/catalogo/produtos/novo')
  }

  function openNewCategory() {
    setCategoryDraft({ name: '', description: '' })
    setCatalogMenuOpen(false)
    navigate('/gestao-livraria/catalogo/categorias/nova')
  }

  function openProduct(product) {
    startProductEdit(product)
    navigate(`/gestao-livraria/catalogo/produtos/${product.id}`)
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

  const addSaleProduct = useCallback((product) => {
    setSaleDraft((current) => ({ ...current, items: addPosCartItem(current.items, product) }))
  }, [])

  const changeSaleQuantity = useCallback((key, delta) => {
    setSaleDraft((current) => ({ ...current, items: changePosCartQuantity(current.items, key, delta) }))
  }, [])

  async function confirmSale() {
    if (!saleDraft.items.length) {
      setMessage('Adicione ao menos um item para finalizar a venda.')
      return
    }
    const exceededItem = saleDraft.items.find((item) => item.quantity > item.stockLimit)
    if (exceededItem) {
      setMessage(`${exceededItem.name} passou do estoque disponivel (${exceededItem.stockLimit}).`)
      return
    }
    const usesReceivablePlan = ['pix', 'dinheiro'].includes(saleDraft.payment_method) && saleDraft.payment_mode === 'installments'
    if (usesReceivablePlan && (!saleDraft.customer_name.trim() || !saleDraft.customer_contact.trim())) {
      setMessage('Informe nome e contato do cliente para a venda parcelada.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const paymentPayload = {
        customer_name: saleDraft.customer_name.trim() || null,
        customer_contact: saleDraft.customer_contact.trim() || null,
        payment_method: saleDraft.payment_method,
        payment_installments: allowsInstallments(saleDraft.payment_method) ? Number(saleDraft.payment_installments || 1) : 1,
        receivable_installments: usesReceivablePlan ? Number(saleDraft.receivable_installments) : undefined,
        first_due_date: usesReceivablePlan ? saleDraft.first_due_date : undefined,
        first_installment_paid: usesReceivablePlan ? saleDraft.first_installment_paid : false,
        notes: [activeSaleRequest ? `Pedido assistido ${activeSaleRequest.reference}` : '', saleDraft.notes.trim()].filter(Boolean).join(' - ') || null
      }
      let sale
      if (activeSaleRequest) {
        await api.updateLibraryRequestItems(activeSaleRequest.reference, {
          items: saleDraft.items.map((item) => ({ product_id: item.id, quantity: item.quantity }))
        })
        sale = await api.convertLibraryRequest(activeSaleRequest.reference, paymentPayload)
      } else {
        sale = await api.createLibrarySale({
          ...paymentPayload,
          idempotency_key: saleKey,
          items: saleDraft.items.map((item) => ({ product_id: item.id, quantity: item.quantity }))
        })
      }
      setCompletedSale(sale)
      setSaleDraft({ customer_name: '', customer_contact: '', payment_method: 'manual', payment_mode: 'full', payment_installments: 1, receivable_installments: 2, first_due_date: isoDate(new Date()), first_installment_paid: false, notes: '', items: [] })
      setSaleKey(newSaleKey())
      setActiveSaleRequest(null)
      await loadData()
      setMessage('')
      navigate('/gestao-livraria/vender/concluida')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  function startNewLibrarySale() {
    setCompletedSale(null)
    setActiveSaleRequest(null)
    setSaleDraft({ customer_name: '', customer_contact: '', payment_method: 'manual', payment_mode: 'full', payment_installments: 1, receivable_installments: 2, first_due_date: isoDate(new Date()), first_installment_paid: false, notes: '', items: [] })
    setSaleKey(newSaleKey())
    setMessage('')
    navigate('/gestao-livraria/vender')
  }

  function startRequestSale(request) {
    const items = cartFromLibraryRequest(request)
    setActiveSaleRequest(request)
    setCompletedSale(null)
    setSaleDraft({
      customer_name: request.customer_name || '',
      customer_contact: request.customer_contact || '',
      payment_method: 'manual',
      payment_mode: 'full',
      payment_installments: 1,
      receivable_installments: 2,
      first_due_date: isoDate(new Date()),
      first_installment_paid: false,
      notes: request.customer_note || '',
      items
    })
    setMessage('')
    navigate('/gestao-livraria/vender/carrinho')
  }

  async function registerInstallmentPayment(event, installment) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const plan = await api.payLibraryInstallment(installment.id, installmentPaymentDraft)
      setInstallmentPlan(plan)
      setPayingInstallmentId(null)
      setInstallmentPaymentDraft({ payment_method: 'pix', paid_at: isoDate(new Date()), notes: '' })
      setMessage('Pagamento da parcela registrado.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function cancelCurrentInstallmentPlan() {
    if (!installmentPlan || !window.confirm('Cancelar as parcelas pendentes deste plano? O historico pago sera preservado.')) return
    setSaving(true)
    setMessage('')
    try {
      setInstallmentPlan(await api.cancelLibraryInstallmentPlan(installmentPlan.id))
      setMessage('Parcelamento cancelado. O historico foi preservado.')
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
    if (seller.archived) return
    setEditingSellerId(seller.id)
    setSellerDraft({
      display_name: seller.display_name,
      whatsapp_phone: seller.whatsapp_phone,
      active: Boolean(seller.active),
      eligible: Boolean(seller.eligible),
      user_id: seller.user_id || ''
    })
  }

  async function removeSellerRecord(seller) {
    if (user?.role !== 'admin') return
    const hasHistory = seller.archived || Number(seller.operational_history_count || 0) > 0
    const confirmation = hasHistory
      ? 'Remover vendedor?\n\nEste vendedor possui historico de atendimentos ou vendas. Ele sera arquivado e deixara de receber novos clientes, mas seus registros historicos serao preservados.'
      : 'Remover vendedor permanentemente?\n\nEste vendedor nao possui historico operacional conhecido. A remocao apagara o cadastro.'
    if (!window.confirm(confirmation)) return

    setSaving(true)
    setMessage('')
    try {
      const result = await api.removeLibrarySeller(seller.id)
      if (editingSellerId === seller.id) {
        setEditingSellerId(null)
        setSellerDraft({ display_name: '', whatsapp_phone: '', active: true, eligible: true, user_id: '' })
      }
      await loadData()
      setMessage(result.mode === 'deleted' ? 'Vendedor removido permanentemente.' : 'Vendedor arquivado e removido da rotacao.')
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

  const salesSpreadsheetFilterCount = ['start_date', 'end_date', 'product_id', 'category_id', 'seller_id', 'payment_method', 'status']
    .filter((key) => spreadsheetFilters[key]).length
  const stockSpreadsheetFilterCount = ['category_id', 'published', 'stock']
    .filter((key) => stockSpreadsheetFilters[key]).length + (stockSpreadsheetFilters.active !== 'active' ? 1 : 0)
  const spreadsheetFilterCount = spreadsheetSection === 'stock' ? stockSpreadsheetFilterCount : salesSpreadsheetFilterCount

  function clearAppliedSpreadsheetFilters() {
    if (spreadsheetSection === 'stock') {
      setStockSpreadsheetFilters((current) => ({ ...current, category_id: '', active: 'active', published: '', stock: '', page: 1 }))
    } else {
      setSpreadsheetFilters((current) => ({ ...current, start_date: '', end_date: '', product_id: '', category_id: '', seller_id: '', payment_method: '', status: '', page: 1 }))
    }
  }

  function resetSpreadsheetViewFilters() {
    if (spreadsheetSection === 'stock') {
      setStockSpreadsheetFilters((current) => ({ ...current, q: '', category_id: '', active: 'active', published: '', stock: '', page: 1 }))
    } else {
      setSpreadsheetFilters((current) => ({ ...current, q: '', start_date: '', end_date: '', product_id: '', category_id: '', seller_id: '', payment_method: '', status: '', page: 1 }))
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-6 pb-4">
      {!isCatalogChildRoute && !isSaleChildRoute && !isInstallmentDetailRoute && !isSpreadsheetFilterRoute ? (
        <nav className="scrollbar-hidden flex gap-5 overflow-x-auto border-b border-line/80 dark:border-shalom-gold/10" role="tablist" aria-label="Areas da Livraria">
          {tabs.filter((tab) => tab.key !== 'installments' || canManageLibraryFinance).map((tab) => (
            <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} className={`section-text-tab shrink-0 ${activeTab === tab.key ? 'section-text-tab-active' : ''}`} onClick={() => selectTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </nav>
      ) : null}
      {message ? <p className="border-l-2 border-shalom-orange px-3 py-1 text-sm font-medium dark:border-shalom-gold" aria-live="polite">{message}</p> : null}
      {!writable ? <p className="mission-muted text-xs">Perfil somente leitura: acompanhamento financeiro e operacional.</p> : null}

      {activeTab === 'overview' ? (
        <div className="grid gap-7">
          <section className="border-b border-line/80 pb-5 dark:border-shalom-gold/10">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold">Periodo de analise</h3>
                <p className="mission-muted text-sm">Metricas financeiras consideram vendas da Livraria no periodo selecionado.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[180px_160px_160px]">
                <select className="mission-input px-3 py-2" value={dashboardPeriod} onChange={(event) => setDashboardPeriod(event.target.value)}>
                  {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <input type="date" className="mission-input px-3 py-2" value={dashboardRange.start_date} onChange={(event) => {
                  setDashboardPeriod('custom')
                  setDashboardCustomRange((current) => ({ ...current, start_date: event.target.value }))
                }} disabled={dashboardPeriod !== 'custom'} />
                <input type="date" className="mission-input px-3 py-2" value={dashboardRange.end_date} onChange={(event) => {
                  setDashboardPeriod('custom')
                  setDashboardCustomRange((current) => ({ ...current, end_date: event.target.value }))
                }} disabled={dashboardPeriod !== 'custom'} />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-x-4 gap-y-5 min-[350px]:grid-cols-2 lg:grid-cols-4 lg:gap-x-6">
            <LibraryMetric label="Receita" value={money.format(dashboard?.revenue || 0)} detail={variationText(dashboard?.comparisons?.revenue) || 'Periodo atual'} />
            <LibraryMetric label="Lucro bruto" value={money.format(dashboard?.gross_profit || 0)} detail={variationText(dashboard?.comparisons?.gross_profit) || `${money.format(dashboard?.cost || 0)} de custo`} />
            <LibraryMetric label="Margem bruta" value={`${decimal.format(dashboard?.margin || 0)}%`} detail="Lucro / receita" />
            <LibraryMetric label="Ticket medio" value={money.format(dashboard?.average_ticket || 0)} detail={variationText(dashboard?.comparisons?.average_ticket) || `${decimal.format(dashboard?.sales_count || 0)} vendas`} />
            <LibraryMetric label="Vendas" value={decimal.format(dashboard?.sales_count || 0)} detail={variationText(dashboard?.comparisons?.sales_count) || 'Vendas validas'} />
            <LibraryMetric label="Itens vendidos" value={decimal.format(dashboard?.items_sold || 0)} detail={variationText(dashboard?.comparisons?.items_sold) || 'Unidades no periodo'} />
            <LibraryMetric label="Produtos ativos" value={decimal.format(dashboard?.active_products_count || 0)} detail={`${decimal.format(dashboard?.published_count || 0)} publicados`} />
            <LibraryMetric label="Unidades em estoque" value={decimal.format(dashboard?.units_in_stock || 0)} detail={`${money.format(dashboard?.inventory_value || 0)} em custo`} />
          </section>

          <section className="grid min-w-0 gap-7 border-t border-line/80 pt-6 dark:border-shalom-gold/10 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] xl:gap-10">
            <div className="min-w-0">
              <h3 className="font-display text-lg font-semibold">Receita, custo e lucro</h3>
              <div className="mt-3 h-60 sm:h-72">
                {dashboard?.series?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dashboard.series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E7DFCD" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} width={48} />
                      <Tooltip formatter={(value) => money.format(value)} />
                      <Legend />
                      <Area type="monotone" name="Receita" dataKey="revenue" stroke="#184E7F" fill="#184E7F20" strokeWidth={2.3} />
                      <Area type="monotone" name="Custo" dataKey="cost" stroke="#7A2E3B" fill="#7A2E3B18" strokeWidth={2.3} />
                      <Area type="monotone" name="Lucro" dataKey="profit" stroke="#F27C23" fill="#F27C2320" strokeWidth={2.3} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="mission-muted flex h-full items-center justify-center border-y border-line/70 text-center text-sm dark:border-shalom-gold/10">Nenhuma venda encontrada neste periodo.</div>
                )}
              </div>
            </div>

            <div className="min-w-0 xl:border-l xl:border-line/80 xl:pl-10 dark:xl:border-shalom-gold/10">
              <h3 className="font-display text-lg font-semibold">Estoque atual</h3>
              <div className="mt-3 divide-y divide-line/70 text-sm dark:divide-shalom-gold/10">
                <div className="flex justify-between gap-3 py-2"><span>Produtos ativos</span><strong>{decimal.format(dashboard?.active_products_count || 0)}</strong></div>
                <div className="flex justify-between gap-3 py-2"><span>Produtos publicados</span><strong>{decimal.format(dashboard?.published_count || 0)}</strong></div>
                <div className="flex justify-between gap-3 py-2"><span>Total de SKUs</span><strong>{decimal.format(dashboard?.products_count || 0)}</strong></div>
                <div className="flex justify-between gap-3 py-2"><span>Unidades em estoque</span><strong>{decimal.format(dashboard?.units_in_stock || 0)}</strong></div>
                <div className="flex justify-between gap-3 py-2"><span>Lucro potencial</span><strong>{money.format(dashboard?.potential_profit || 0)}</strong></div>
                <div className="flex justify-between gap-3 py-2"><span>Sem movimentacao</span><strong>{decimal.format(dashboard?.no_movement_count || 0)}</strong></div>
                <div className="border-t border-line/70 pt-3 dark:border-shalom-gold/10">
                  <p className="mission-muted">Menor estoque</p>
                  <p className="font-semibold">{dashboard?.lowest_stock_product?.name || '-'} ({decimal.format(dashboard?.lowest_stock_product?.stock_quantity || 0)})</p>
                </div>
                <div className="pt-3">
                  <p className="mission-muted">Maior estoque</p>
                  <p className="font-semibold">{dashboard?.highest_stock_product?.name || '-'} ({decimal.format(dashboard?.highest_stock_product?.stock_quantity || 0)})</p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-7 border-t border-line/80 pt-6 dark:border-shalom-gold/10 xl:grid-cols-3 xl:gap-0 xl:divide-x xl:divide-line/80 dark:xl:divide-shalom-gold/10">
            <div className="min-w-0 xl:pr-6">
              <h3 className="font-display text-lg font-semibold">Produtos mais vendidos</h3>
              <div className="mt-3 divide-y divide-line/70 dark:divide-shalom-gold/10">
                {(dashboard?.top_products || []).slice(0, 6).map((item) => (
                  <div key={item.product_id} className="grid gap-1 py-3 text-sm">
                    <div className="flex justify-between gap-3"><strong>{item.product_name}</strong><span>{decimal.format(item.quantity_sold)}</span></div>
                    <p className="mission-muted">{money.format(item.revenue)} / lucro {money.format(item.profit)}</p>
                  </div>
                ))}
                {!dashboard?.top_products?.length ? <p className="mission-muted py-4 text-sm">Nenhum produto vendido no periodo.</p> : null}
              </div>
            </div>
            <div className="min-w-0 xl:px-6">
              <h3 className="font-display text-lg font-semibold">Ranking por faturamento</h3>
              <div className="mt-3 divide-y divide-line/70 dark:divide-shalom-gold/10">
                {(dashboard?.top_revenue_products || []).slice(0, 6).map((item) => (
                  <div key={item.product_id} className="grid gap-1 py-3 text-sm">
                    <div className="flex justify-between gap-3"><strong>{item.product_name}</strong><span>{money.format(item.revenue)}</span></div>
                    <p className="mission-muted">{decimal.format(item.quantity_sold)} itens / lucro {money.format(item.profit)}</p>
                  </div>
                ))}
                {!dashboard?.top_revenue_products?.length ? <p className="mission-muted py-4 text-sm">Nenhuma receita no periodo.</p> : null}
              </div>
            </div>
            <div className="min-w-0 xl:pl-6">
              <h3 className="font-display text-lg font-semibold">Vendas por vendedor</h3>
              <div className="mt-3 divide-y divide-line/70 dark:divide-shalom-gold/10">
                {(dashboard?.seller_performance || []).slice(0, 6).map((item) => (
                  <div key={item.seller_id || item.seller_name} className="grid gap-1 py-3 text-sm">
                    <div className="flex justify-between gap-3"><strong>{item.seller_name}</strong><span>{money.format(item.revenue)}</span></div>
                    <p className="mission-muted">{decimal.format(item.sales_count)} vendas / {decimal.format(item.items_sold)} itens / ticket {money.format(item.average_ticket)}</p>
                  </div>
                ))}
                {!dashboard?.seller_performance?.length ? <p className="mission-muted py-4 text-sm">Nenhuma venda por vendedor no periodo.</p> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'requests' ? (
        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="min-w-0">
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
            <div className="mt-4 divide-y divide-line/70 dark:divide-shalom-gold/10">
              {requests.map((request) => (
                <article key={request.reference} className="min-w-0 py-4 text-sm">
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
                          <div key={item.id || item.product_id} className="grid min-w-0 gap-2 border-b border-line/60 py-2 last:border-0 dark:border-shalom-gold/10 sm:grid-cols-[minmax(0,1fr)_88px_120px] sm:items-center">
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
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className="mission-btn mission-btn-primary px-4 py-2.5 font-semibold disabled:opacity-55" onClick={() => startRequestSale(request)} disabled={saving}>Revisar venda</button>
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
              ))}
              {!requests.length ? <p className="mission-muted py-5 text-sm">Nenhum carrinho assistido encontrado.</p> : null}
            </div>
          </div>
          <aside className="min-w-0 border-t border-line/80 pt-5 dark:border-shalom-gold/10 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <h3 className="font-display text-lg font-semibold">Monitoramento rapido</h3>
            <p className="mission-muted mt-1 text-sm">{monitoring.unassigned_pending || 0} carrinho(s) sem vendedor.</p>
            <div className="mt-3 divide-y divide-line/70 dark:divide-shalom-gold/10">
              {monitoring.sellers?.map((seller) => (
                <article key={seller.id} className="py-3 text-sm">
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

      {activeTab === 'products' && !isCatalogChildRoute ? (
        <section className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold">Catalogo</h2>
            {writable ? (
              <div className="relative">
                <button type="button" className="mission-btn inline-flex h-10 w-10 items-center justify-center text-shalom-blue dark:text-shalom-gold" onClick={() => setCatalogMenuOpen((current) => !current)} aria-label="Adicionar ao catalogo" title="Adicionar ao catalogo" aria-expanded={catalogMenuOpen}>
                  <Plus size={21} />
                </button>
                {catalogMenuOpen ? (
                  <div className="absolute right-0 top-11 z-20 min-w-44 rounded-md border border-line bg-white py-1 shadow-lg dark:border-shalom-gold/15 dark:bg-[#182536]" role="menu">
                    <button type="button" className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-shalom-mist/70 dark:hover:bg-white/5" onClick={openNewProduct} role="menuitem">Novo produto</button>
                    <button type="button" className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-shalom-mist/70 dark:hover:bg-white/5" onClick={openNewCategory} role="menuitem">Nova categoria</button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-shalom-blue/60" size={18} />
              <input className="mission-input w-full px-10 py-2" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Buscar catalogo" aria-label="Buscar catalogo" />
            </label>
            <select className="mission-input w-full px-3 py-2" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} aria-label="Filtrar produtos por status">
              <option value="">Ativos</option>
              <option value="published">Publicados</option>
              <option value="draft">Nao publicados</option>
              <option value="inactive">Inativos</option>
            </select>
          </div>

          <div className="mt-3 divide-y divide-line/80 dark:divide-shalom-gold/10 xl:hidden">
            {products.map((product) => (
              <button key={product.id} type="button" className="flex w-full min-w-0 items-center gap-3 py-3 text-left" onClick={() => openProduct(product)} aria-label={`Abrir ${product.name}`}>
                <span className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-line/80 bg-shalom-mist text-[10px] text-shalom-blue/60 dark:border-shalom-gold/10 dark:bg-white/5 dark:text-shalom-gold/60">
                  {product.images?.[0]?.url ? <img src={product.images[0].url} alt="" className="h-full w-full object-cover" /> : 'Sem foto'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{product.name}</span>
                  <span className="mission-muted mt-0.5 block truncate text-xs">{product.category || 'Sem categoria'}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                    <strong>{money.format(product.price)}</strong>
                    <span className="mission-muted">Estoque: {decimal.format(product.stock_quantity)}</span>
                    <span className={product.published ? 'text-emerald-700 dark:text-emerald-200' : 'mission-muted'}>{product.published ? 'Publicado' : 'Interno'}</span>
                  </span>
                </span>
                <ChevronRight className="shrink-0 text-shalom-blue/50 dark:text-shalom-gold/60" size={19} aria-hidden="true" />
              </button>
            ))}
          </div>

          <div className="mt-4 hidden xl:block">
            <table className="w-full border-separate border-spacing-0 text-left text-sm">
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
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{decimal.format(product.stock_quantity)}</td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{product.published ? 'Publicado' : 'Interno'}</td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <div className="flex gap-1">
                        <button type="button" className="mission-btn inline-flex h-9 w-9 items-center justify-center text-shalom-blue disabled:opacity-55 dark:text-shalom-gold" onClick={() => openProduct(product)} disabled={saving} title={writable ? 'Editar produto' : 'Ver produto'} aria-label={writable ? 'Editar produto' : 'Ver produto'}>
                          <Pencil size={16} />
                        </button>
                        <button type="button" className="mission-btn inline-flex h-9 w-9 items-center justify-center text-shalom-blue disabled:opacity-55 dark:text-shalom-gold" onClick={() => togglePublication(product)} disabled={!writable || saving} title={product.published ? 'Retirar do catalogo publico' : 'Publicar no catalogo'} aria-label={product.published ? 'Retirar do catalogo publico' : 'Publicar no catalogo'}>
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!products.length ? (
            <div className="py-10 text-center text-sm">
              <p className="mission-muted">{filters.q ? `Nenhum produto encontrado para "${filters.q}".` : 'Nenhum produto encontrado.'}</p>
              {writable && !filters.q ? <button type="button" className="mt-3 font-semibold text-shalom-blue dark:text-shalom-gold" onClick={openNewProduct}>Adicionar produto</button> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'products' && isNewCategoryRoute ? (
        <section className="mx-auto w-full max-w-2xl">
          <form onSubmit={saveCategory}>
            <div className="grid gap-4">
              <label className="text-sm font-medium">
                Nome
                <input className="mission-input mt-1 w-full px-3 py-2.5" value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} disabled={!writable} required autoFocus />
              </label>
              <label className="text-sm font-medium">
                Descricao
                <textarea className="mission-input mt-1 w-full px-3 py-2.5" value={categoryDraft.description} onChange={(event) => setCategoryDraft({ ...categoryDraft, description: event.target.value })} disabled={!writable} rows={4} />
              </label>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-line/80 pt-4 dark:border-shalom-gold/10">
              <button type="button" className="mission-btn px-4 py-2.5 font-semibold" onClick={() => navigate('/gestao-livraria/catalogo')}>Cancelar</button>
              <button type="submit" className="mission-btn mission-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 font-semibold" disabled={!writable || saving}>
                <Plus size={17} />
                Criar categoria
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {activeTab === 'products' && isProductFormRoute ? (
        <section className="mx-auto w-full max-w-3xl">
          <form onSubmit={saveProduct}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">
                Nome
                <input className="mission-input mt-1 w-full px-3 py-2.5" value={productDraft.name} onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })} disabled={!writable} required autoFocus={isNewProductRoute} />
              </label>
              <label className="text-sm font-medium">
                SKU
                <input className="mission-input mt-1 w-full px-3 py-2.5" value={productDraft.sku} onChange={(event) => setProductDraft({ ...productDraft, sku: event.target.value })} placeholder="Opcional" disabled={!writable} />
              </label>
              <label className="text-sm font-medium">
                Categoria
                <select className="mission-input mt-1 w-full px-3 py-2.5" value={productDraft.category_id} onChange={(event) => setProductDraft({ ...productDraft, category_id: event.target.value })} disabled={!writable}>
                  <option value="">Sem categoria</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Descricao publica
                <textarea className="mission-input mt-1 w-full px-3 py-2.5" value={productDraft.description} onChange={(event) => setProductDraft({ ...productDraft, description: event.target.value })} disabled={!writable} rows={4} />
              </label>
              <label className="text-sm font-medium">
                Preco
                <input type="number" min="0" step="0.01" className="mission-input mt-1 w-full px-3 py-2.5" value={productDraft.price} onChange={(event) => setProductDraft({ ...productDraft, price: event.target.value })} disabled={!writable} />
              </label>
              <label className="text-sm font-medium">
                Custo
                <input type="number" min="0" step="0.01" className="mission-input mt-1 w-full px-3 py-2.5" value={productDraft.cost_price} onChange={(event) => setProductDraft({ ...productDraft, cost_price: event.target.value })} disabled={!writable} />
              </label>
              <label className="text-sm font-medium">
                Quantidade
                <input type="number" min="0" step="0.001" className="mission-input mt-1 w-full px-3 py-2.5" value={productDraft.stock_quantity} onChange={(event) => setProductDraft({ ...productDraft, stock_quantity: event.target.value })} disabled={!writable} />
              </label>
              <label className="text-sm font-medium">
                Estoque minimo
                <input type="number" min="0" step="0.001" className="mission-input mt-1 w-full px-3 py-2.5" value={productDraft.min_stock} onChange={(event) => setProductDraft({ ...productDraft, min_stock: event.target.value })} disabled={!writable} />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                URL da imagem
                <input className="mission-input mt-1 w-full px-3 py-2.5" value={productDraft.image_url} onChange={(event) => setProductDraft({ ...productDraft, image_url: event.target.value })} disabled={!writable} />
              </label>
              <label className="flex items-center justify-between border-y border-line/80 py-3 text-sm font-semibold dark:border-shalom-gold/10">
                Publicar no catalogo
                <input type="checkbox" className="h-4 w-4 accent-shalom-orange" checked={productDraft.published} onChange={(event) => setProductDraft({ ...productDraft, published: event.target.checked })} disabled={!writable} />
              </label>
              <label className="flex items-center justify-between border-y border-line/80 py-3 text-sm font-semibold dark:border-shalom-gold/10">
                Produto ativo
                <input type="checkbox" className="h-4 w-4 accent-shalom-orange" checked={productDraft.active} onChange={(event) => setProductDraft({ ...productDraft, active: event.target.checked })} disabled={!writable} />
              </label>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-line/80 pt-4 dark:border-shalom-gold/10">
              <button type="button" className="mission-btn px-4 py-2.5 font-semibold" onClick={() => navigate('/gestao-livraria/catalogo')}>Cancelar</button>
              <button type="submit" className="mission-btn mission-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 font-semibold" disabled={!writable || saving}>
                <Save size={17} />
                {editingProductId ? 'Atualizar produto' : 'Salvar produto'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {activeTab === 'inventory' ? (
        <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <form className="min-w-0" onSubmit={saveMovement}>
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
          <div className="min-w-0 border-t border-line/80 pt-5 dark:border-shalom-gold/10 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <h3 className="font-display text-lg font-semibold">Historico de estoque</h3>
            <div className="mt-3">
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
        <section className="min-w-0">
          {saleStage === 'catalog' ? (
            <div className={`pos-view pos-catalog-view mx-auto min-w-0 max-w-[1400px] ${saleItemCount ? 'pos-view-with-action' : ''}`}>
              <div className="pos-catalog-header sticky -top-4 z-20 -mx-3 border-b border-line/80 bg-[#f8f8f8]/95 px-3 pb-2 pt-1 backdrop-blur dark:border-shalom-gold/10 dark:bg-shalom-night/95 sm:-mx-5 sm:px-5 lg:mx-0 lg:px-0">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div><h2 className="font-display text-xl font-semibold lg:text-2xl">Vender</h2><p className="mission-muted mt-1 hidden text-sm lg:block">Selecione os produtos da Livraria</p></div>
                  <div className="flex items-center gap-1">
                    <button type="button" className="flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-shalom-blue dark:text-shalom-gold" onClick={() => navigate('/gestao-livraria/vender/historico')}><History size={18} aria-hidden="true" /><span className="hidden sm:inline">Historico</span></button>
                    <button type="button" className="flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-shalom-blue dark:text-shalom-gold" onClick={() => navigate('/gestao-livraria/vender/cliente')}><UserRound size={18} aria-hidden="true" /> Cliente</button>
                  </div>
                </div>
                <label className="relative block max-w-3xl lg:mt-5">
                  <span className="sr-only">Buscar produto ou SKU</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 mission-muted" size={19} aria-hidden="true" />
                  <input className="mission-input h-11 w-full pl-10 pr-3" value={saleQuery} onChange={(event) => setSaleQuery(event.target.value)} placeholder="Buscar produto ou SKU" type="search" />
                </label>
                <div className="scrollbar-hidden -mx-3 mt-2 flex gap-5 overflow-x-auto px-3 sm:mx-0 sm:px-0 lg:mt-4 lg:gap-7" role="tablist" aria-label="Categorias da Livraria">
                  {saleCategories.map((category) => <button key={category} type="button" role="tab" aria-selected={saleCategory === category} className={`section-text-tab shrink-0 ${saleCategory === category ? 'section-text-tab-active' : ''}`} onClick={() => setSaleCategory(category)}>{category}</button>)}
                </div>
              </div>
              {message ? <p className="my-3 border-l-2 border-shalom-orange px-3 py-1 text-sm" role="status">{message}</p> : null}
              {!writable ? <p className="mission-muted py-4 text-sm">Seu perfil permite consultar, mas nao registrar vendas.</p> : null}
              {visibleSaleProducts.length ? (
                <div className="pos-product-grid grid grid-cols-[repeat(auto-fill,minmax(135px,1fr))] border-l border-t border-line/70 dark:border-shalom-gold/10 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] lg:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
                  {visibleSaleProducts.map((product) => <LibrarySaleProductCard key={product.id} product={product} quantity={saleQuantities.get(`product-${product.id}`) || 0} writable={writable} onAdd={addSaleProduct} onChangeQuantity={changeSaleQuantity} />)}
                </div>
              ) : <p className="mission-muted py-12 text-center">{saleQuery ? `Nenhum produto encontrado para "${saleQuery}".` : 'Nenhum produto disponivel.'}</p>}
              {saleItemCount > 0 ? <div className="pos-action-bar fixed inset-x-3 z-30 md:sticky md:inset-x-auto md:bottom-4 md:mt-5 lg:static lg:inset-auto lg:mt-auto lg:pt-6"><button type="button" className="mission-btn mission-btn-primary mx-auto flex min-h-14 w-full max-w-2xl items-center gap-3 px-4 py-3 font-semibold shadow-blue lg:max-w-none lg:px-6" onClick={() => navigate('/gestao-livraria/vender/carrinho')}><span>{saleItemCount} {saleItemCount === 1 ? 'item' : 'itens'}</span><span className="ml-auto">{money.format(saleTotal)}</span><span className="hidden text-sm lg:inline">Ver carrinho</span><ChevronRight size={20} /></button></div> : null}
            </div>
          ) : null}

          {saleStage === 'carrinho' ? (
            <div className={`pos-view mx-auto min-w-0 max-w-3xl ${saleDraft.items.length ? 'pos-view-with-action' : ''}`}>
              {activeSaleRequest ? <p className="mb-3 border-l-2 border-shalom-blue px-3 text-sm font-medium dark:border-shalom-gold">Atendimento {activeSaleRequest.reference}{activeSaleRequest.seller?.display_name ? ` - ${activeSaleRequest.seller.display_name}` : ''}</p> : null}
              {saleDraft.items.length ? <div className="divide-y divide-line/80 dark:divide-shalom-gold/10">{saleDraft.items.map((item) => (
                <article key={item.key} className="py-4">
                  <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{item.name}</h3><p className="mission-muted mt-1 text-sm">{money.format(item.sale_price)} cada</p></div><strong className="shrink-0">{money.format(item.sale_price * item.quantity)}</strong></div>
                  <div className="mt-3 flex items-center justify-between gap-3"><div className="flex items-center rounded-md border border-line/80 dark:border-shalom-gold/20"><button type="button" className="flex h-11 w-11 items-center justify-center" onClick={() => changeSaleQuantity(item.key, -1)} aria-label={`Diminuir ${item.name}`}><Minus size={17} /></button><span className="w-9 text-center font-semibold">{item.quantity}</span><button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-40" onClick={() => changeSaleQuantity(item.key, 1)} disabled={item.quantity >= item.stockLimit} aria-label={`Aumentar ${item.name}`}><Plus size={17} /></button></div><button type="button" className="flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-shalom-wine dark:text-rose-200" onClick={() => changeSaleQuantity(item.key, -item.quantity)}><Trash2 size={17} /> Remover</button></div>
                </article>
              ))}</div> : <div className="py-16 text-center"><ShoppingCart className="mx-auto mission-muted" size={30} /><p className="mt-3 font-semibold">Carrinho vazio</p><button type="button" className="mt-3 min-h-11 px-4 font-semibold text-shalom-blue dark:text-shalom-gold" onClick={() => navigate('/gestao-livraria/vender')}>Adicionar produtos</button></div>}
              {saleDraft.items.length ? <div className="mt-3 flex items-center justify-between border-t border-line/80 pt-4 dark:border-shalom-gold/10"><span className="mission-muted">Total</span><strong className="font-display text-2xl text-shalom-blue dark:text-shalom-gold">{money.format(saleTotal)}</strong></div> : null}
              {saleDraft.items.length ? <div className="pos-action-bar fixed inset-x-3 z-30 md:sticky md:inset-x-auto md:bottom-4 md:mt-6"><button type="button" className="mission-btn mission-btn-primary mx-auto flex min-h-14 w-full max-w-2xl items-center justify-between gap-2 px-4 py-3 font-semibold" onClick={() => navigate('/gestao-livraria/vender/cliente')}><span>Continuar</span><span className="flex items-center gap-1">{money.format(saleTotal)} <ChevronRight size={20} /></span></button></div> : null}
            </div>
          ) : null}

          {saleStage === 'cliente' ? (
            <div className="mx-auto max-w-2xl">
              <div className="grid gap-4">
                <label className="text-sm font-medium">Cliente<input className="mission-input mt-1 h-11 w-full px-3" value={saleDraft.customer_name} onChange={(event) => setSaleDraft({ ...saleDraft, customer_name: event.target.value })} placeholder="Nome do cliente" disabled={!writable} /></label>
                <label className="text-sm font-medium">Contato<input className="mission-input mt-1 h-11 w-full px-3" value={saleDraft.customer_contact} onChange={(event) => setSaleDraft({ ...saleDraft, customer_contact: event.target.value })} placeholder="Telefone ou WhatsApp" disabled={!writable} /></label>
                {activeSaleRequest?.seller ? <div className="border-y border-line/80 py-3 text-sm dark:border-shalom-gold/10"><span className="mission-muted">Vendedor atribuido</span><strong className="mt-1 block">{activeSaleRequest.seller.display_name}</strong></div> : null}
              </div>
              <div className="pos-action-bar fixed inset-x-3 z-30 md:sticky md:inset-x-auto md:bottom-4 md:mt-6"><button type="button" className="mission-btn mission-btn-primary mx-auto flex min-h-14 w-full max-w-2xl items-center justify-between gap-2 px-4 py-3 font-semibold" onClick={() => saleDraft.items.length ? navigate('/gestao-livraria/vender/pagamento') : navigate('/gestao-livraria/vender')}><span>{saleDraft.items.length ? 'Continuar para pagamento' : 'Escolher produtos'}</span><ChevronRight size={20} /></button></div>
            </div>
          ) : null}

          {saleStage === 'pagamento' ? (
            <div className="mx-auto max-w-2xl">
              <div className="mb-6 border-b border-line/80 pb-5 text-center dark:border-shalom-gold/10"><p className="mission-muted text-sm">Total</p><strong className="mt-1 block font-display text-3xl text-shalom-blue dark:text-shalom-gold">{money.format(saleTotal)}</strong>{saleItemCount ? <p className="mission-muted mt-1 text-xs">{saleItemCount} {saleItemCount === 1 ? 'item' : 'itens'}</p> : null}</div>
              <div className="grid gap-4">
                <label className="text-sm font-medium">Forma de pagamento<select className="mission-input mt-1 h-11 w-full px-3" value={saleDraft.payment_method} onChange={(event) => setSaleDraft({ ...saleDraft, payment_method: event.target.value, payment_mode: ['pix', 'dinheiro'].includes(event.target.value) ? saleDraft.payment_mode : 'full', payment_installments: allowsInstallments(event.target.value) ? saleDraft.payment_installments : 1 })} disabled={!writable}>{libraryPaymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
                {['pix', 'dinheiro'].includes(saleDraft.payment_method) ? <fieldset><legend className="text-sm font-medium">Pagamento</legend><div className="mt-2 grid grid-cols-2 border-y border-line/80 dark:border-shalom-gold/10"><label className="flex min-h-11 items-center gap-2 py-2 text-sm"><input type="radio" name="library-payment-mode" value="full" checked={saleDraft.payment_mode === 'full'} onChange={(event) => setSaleDraft({ ...saleDraft, payment_mode: event.target.value })} /> A vista</label><label className="flex min-h-11 items-center gap-2 py-2 text-sm"><input type="radio" name="library-payment-mode" value="installments" checked={saleDraft.payment_mode === 'installments'} onChange={(event) => setSaleDraft({ ...saleDraft, payment_mode: event.target.value })} /> Parcelado</label></div></fieldset> : null}
                {['pix', 'dinheiro'].includes(saleDraft.payment_method) && saleDraft.payment_mode === 'installments' ? <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Numero de parcelas<input type="number" min="2" max="24" step="1" className="mission-input mt-1 h-11 w-full px-3" value={saleDraft.receivable_installments} onChange={(event) => setSaleDraft({ ...saleDraft, receivable_installments: event.target.value })} disabled={!writable} /><span className="mission-muted mt-1 block text-xs">{installmentPreview(saleTotal, saleDraft.receivable_installments)}</span></label><label className="text-sm font-medium">Primeiro vencimento<input type="date" className="mission-input mt-1 h-11 w-full px-3" value={saleDraft.first_due_date} onChange={(event) => setSaleDraft({ ...saleDraft, first_due_date: event.target.value })} disabled={!writable} /></label><label className="flex min-h-11 items-center justify-between border-y border-line/80 py-2 text-sm font-medium sm:col-span-2 dark:border-shalom-gold/10"><span>Primeira parcela paga agora</span><input type="checkbox" className="h-5 w-5 accent-shalom-blue" checked={saleDraft.first_installment_paid} onChange={(event) => setSaleDraft({ ...saleDraft, first_installment_paid: event.target.checked })} disabled={!writable} /></label><p className="mission-muted text-xs sm:col-span-2">Parcelamento interno mensal. Cliente e contato sao obrigatorios.</p></div> : null}
                {allowsInstallments(saleDraft.payment_method) ? <label className="text-sm font-medium">Parcelas<input type="number" min="1" max="24" step="1" className="mission-input mt-1 h-11 w-full px-3" value={saleDraft.payment_installments} onChange={(event) => setSaleDraft({ ...saleDraft, payment_installments: event.target.value })} disabled={!writable} />{Number(saleDraft.payment_installments) > 1 ? <span className="mission-muted mt-1 block text-xs">{installmentPreview(saleTotal, saleDraft.payment_installments)}</span> : null}</label> : null}
                <label className="text-sm font-medium">Observacoes<textarea className="mission-input mt-1 min-h-24 w-full px-3 py-2" value={saleDraft.notes} onChange={(event) => setSaleDraft({ ...saleDraft, notes: event.target.value })} disabled={!writable} /></label>
                {message ? <p className="border-l-2 border-shalom-wine px-3 py-1 text-sm text-shalom-wine dark:text-rose-200" role="alert">{message}</p> : null}
              </div>
              <div className="pos-action-bar fixed inset-x-3 z-30 md:sticky md:inset-x-auto md:bottom-4 md:mt-6"><button type="button" className="mission-btn mission-btn-primary mx-auto flex min-h-14 w-full max-w-2xl items-center justify-center px-4 py-3 font-semibold" onClick={confirmSale} disabled={!writable || saving || !saleDraft.items.length}>{saving ? 'Finalizando...' : 'Finalizar venda'}</button></div>
            </div>
          ) : null}

          {saleStage === 'concluida' ? (
            <div className="mx-auto max-w-xl py-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"><Save size={25} /></div><h2 className="mt-4 font-display text-2xl font-semibold">Venda concluida</h2>{completedSale ? <><p className="mt-4 font-display text-3xl font-semibold text-shalom-blue dark:text-shalom-gold">{money.format(completedSale.total)}</p><p className="mission-muted mt-1 text-sm">Venda #{completedSale.id} - {completedSale.payment_method}</p></> : <p className="mission-muted mt-3">A venda foi registrada.</p>}<div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row"><button type="button" className="mission-btn mission-btn-primary px-5 py-3 font-semibold" onClick={startNewLibrarySale}>Nova venda</button><button type="button" className="mission-btn px-5 py-3 font-semibold text-shalom-blue dark:text-shalom-gold" onClick={() => navigate('/gestao-livraria/vender/historico')}>Ver historico</button></div></div>
          ) : null}

          {saleStage === 'historico' ? (
            <div className="mx-auto max-w-5xl divide-y divide-line/70 dark:divide-shalom-gold/10">{sales.map((sale) => <article key={sale.id} className="py-4 text-sm"><div className="grid gap-3 sm:grid-cols-[1fr_auto]"><div className="min-w-0"><p className="font-semibold">Venda #{sale.id} {sale.customer_name ? `- ${sale.customer_name}` : ''}</p><p className="mission-muted mt-1">{sale.items.map((item) => `${item.item_name} x ${decimal.format(item.quantity)}`).join(', ')}</p><p className="mission-muted mt-2 text-xs">{sale.seller_name ? `Vendedor: ${sale.seller_name}` : 'Sem vendedor vinculado'}{sale.assisted_request_id ? ` - Atendimento #${sale.assisted_request_id}` : ''}</p><p className="mission-muted mt-1 text-xs">{sale.payment_method}{Number(sale.payment_installments || 1) > 1 ? ` - ${sale.payment_installments}x` : ''}</p>{sale.notes ? <p className="mission-muted mt-1 text-xs">{sale.notes}</p> : null}</div><div className="sm:text-right"><p className="font-semibold">{money.format(sale.total)}</p><p className="mission-muted text-xs">{formatDateTime(sale.created_at)}</p></div></div></article>)}{!sales.length ? <p className="mission-muted py-10 text-center">Nenhuma venda da Livraria registrada.</p> : null}</div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'installments' && canManageLibraryFinance ? (
        <section className="min-w-0">
          {!isInstallmentDetailRoute ? <>
            <div className="flex items-end justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">Parcelas de clientes</h2><p className="mission-muted mt-1 text-sm">Recebimentos internos de vendas da Livraria.</p></div></div>
            <label className="relative mt-4 block max-w-2xl"><span className="sr-only">Buscar cliente, contato ou venda</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 mission-muted" size={18} /><input type="search" className="mission-input h-11 w-full pl-10 pr-3" value={installmentFilters.q} onChange={(event) => setInstallmentFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Buscar cliente, contato ou venda" /></label>
            <div className="scrollbar-hidden mt-3 flex gap-5 overflow-x-auto border-b border-line/80 dark:border-shalom-gold/10" role="tablist" aria-label="Status das parcelas">{[['', 'Todos'], ['unpaid', 'Pendentes'], ['partially_paid', 'Parciais'], ['overdue', 'Vencidos'], ['paid', 'Pagos']].map(([value, label]) => <button key={label} type="button" role="tab" aria-selected={installmentFilters.status === value} className={`section-text-tab shrink-0 ${installmentFilters.status === value ? 'section-text-tab-active' : ''}`} onClick={() => setInstallmentFilters((current) => ({ ...current, status: value }))}>{label}</button>)}</div>
            <div className="mt-3 divide-y divide-line/80 dark:divide-shalom-gold/10 xl:hidden">{installmentPlans.map((plan) => <button key={plan.id} type="button" className="flex w-full min-w-0 items-center gap-3 py-4 text-left" onClick={() => navigate(`/gestao-livraria/parcelas/${plan.id}`)}><span className="min-w-0 flex-1"><strong className="block truncate">{plan.customer_name}</strong><span className="mission-muted mt-0.5 block truncate text-xs">{formatLibraryCustomerContact(plan.customer_contact)} - Venda #{plan.sale_id}</span><span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm"><span>Total {money.format(plan.total_amount)}</span><span>Pago {money.format(plan.paid_amount)}</span><span className="font-semibold">Pendente {money.format(plan.pending_amount)}</span></span><span className="mission-muted mt-1 block text-xs">{plan.paid_count}/{plan.installment_count} pagas{plan.next_due_date ? ` - Proximo vencimento ${formatDate(plan.next_due_date)}` : ''}</span></span><span className={`shrink-0 text-xs font-semibold ${plan.financial_status === 'overdue' ? 'text-shalom-wine dark:text-rose-200' : 'text-shalom-blue dark:text-shalom-gold'}`}>{installmentStatusLabel(plan.financial_status)}</span><ChevronRight className="shrink-0 mission-muted" size={18} /></button>)}</div>
            <div className="mt-4 hidden xl:block"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-shalom-blue/70 dark:text-shalom-gold/80"><tr><th className="border-b border-line px-3 py-2">Cliente</th><th className="border-b border-line px-3 py-2">Venda</th><th className="border-b border-line px-3 py-2">Total</th><th className="border-b border-line px-3 py-2">Pago</th><th className="border-b border-line px-3 py-2">Pendente</th><th className="border-b border-line px-3 py-2">Proximo vencimento</th><th className="border-b border-line px-3 py-2">Status</th></tr></thead><tbody>{installmentPlans.map((plan) => <tr key={plan.id} className="cursor-pointer" onClick={() => navigate(`/gestao-livraria/parcelas/${plan.id}`)}><td className="border-b border-line/80 px-3 py-3"><strong>{plan.customer_name}</strong><span className="mission-muted block text-xs">{formatLibraryCustomerContact(plan.customer_contact)}</span></td><td className="border-b border-line/80 px-3 py-3">#{plan.sale_id}</td><td className="border-b border-line/80 px-3 py-3">{money.format(plan.total_amount)}</td><td className="border-b border-line/80 px-3 py-3">{money.format(plan.paid_amount)}</td><td className="border-b border-line/80 px-3 py-3">{money.format(plan.pending_amount)}</td><td className="border-b border-line/80 px-3 py-3">{formatDate(plan.next_due_date)}</td><td className="border-b border-line/80 px-3 py-3 font-semibold">{installmentStatusLabel(plan.financial_status)}</td></tr>)}</tbody></table></div>
            {!installmentPlans.length ? <p className="mission-muted py-12 text-center">Nenhum parcelamento encontrado.</p> : null}
          </> : null}

          {isInstallmentDetailRoute && installmentPlan ? <div className="mx-auto max-w-3xl">
            <div className="border-b border-line/80 pb-5 dark:border-shalom-gold/10"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-display text-xl font-semibold">{installmentPlan.customer_name}</h2><p className="mission-muted mt-1 text-sm">{formatLibraryCustomerContact(installmentPlan.customer_contact)} - Venda #{installmentPlan.sale_id}</p>{installmentPlan.seller_name ? <p className="mission-muted mt-1 text-xs">Vendedor: {installmentPlan.seller_name}</p> : null}</div><span className="font-semibold text-shalom-blue dark:text-shalom-gold">{installmentStatusLabel(installmentPlan.financial_status)}</span></div><div className="mt-5 grid grid-cols-3 gap-4"><div><span className="mission-muted text-xs">Total</span><strong className="mt-1 block">{money.format(installmentPlan.total_amount)}</strong></div><div><span className="mission-muted text-xs">Pago</span><strong className="mt-1 block text-emerald-700 dark:text-emerald-200">{money.format(installmentPlan.paid_amount)}</strong></div><div><span className="mission-muted text-xs">Pendente</span><strong className="mt-1 block text-shalom-wine dark:text-rose-200">{money.format(installmentPlan.pending_amount)}</strong></div></div></div>
            <div className="divide-y divide-line/80 dark:divide-shalom-gold/10">{installmentPlan.installments.map((installment) => <article key={installment.id} className="py-4"><div className="flex items-start justify-between gap-3"><div><strong>{installment.installment_number}/{installmentPlan.installment_count} - {money.format(installment.amount)}</strong><p className="mission-muted mt-1 text-sm">Vencimento {formatDate(installment.due_date)}</p>{installment.status === 'paid' ? <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-200">Pago em {formatDate(installment.paid_at)} via {installment.paid_method}</p> : installment.overdue ? <p className="mt-1 text-xs font-semibold text-shalom-wine dark:text-rose-200">Vencida</p> : <p className="mission-muted mt-1 text-xs">Pendente</p>}{installment.notes ? <p className="mission-muted mt-1 text-xs">{installment.notes}</p> : null}</div>{installment.status === 'pending' && installmentPlan.status !== 'cancelled' ? <button type="button" className="min-h-11 px-2 text-sm font-semibold text-shalom-blue dark:text-shalom-gold" onClick={() => setPayingInstallmentId((current) => current === installment.id ? null : installment.id)}>Registrar pagamento</button> : null}</div>{payingInstallmentId === installment.id ? <form className="mt-4 grid gap-3 border-t border-line/70 pt-4 dark:border-shalom-gold/10 sm:grid-cols-2" onSubmit={(event) => registerInstallmentPayment(event, installment)}><label className="text-sm font-medium">Forma<select className="mission-input mt-1 h-11 w-full px-3" value={installmentPaymentDraft.payment_method} onChange={(event) => setInstallmentPaymentDraft({ ...installmentPaymentDraft, payment_method: event.target.value })}><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option></select></label><label className="text-sm font-medium">Data do pagamento<input type="date" className="mission-input mt-1 h-11 w-full px-3" value={installmentPaymentDraft.paid_at} onChange={(event) => setInstallmentPaymentDraft({ ...installmentPaymentDraft, paid_at: event.target.value })} required /></label><label className="text-sm font-medium sm:col-span-2">Observacao<input className="mission-input mt-1 h-11 w-full px-3" value={installmentPaymentDraft.notes} onChange={(event) => setInstallmentPaymentDraft({ ...installmentPaymentDraft, notes: event.target.value })} /></label><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="min-h-11 px-4 font-semibold" onClick={() => setPayingInstallmentId(null)}>Cancelar</button><button type="submit" className="mission-btn mission-btn-primary min-h-11 px-4 font-semibold" disabled={saving}>Confirmar pagamento</button></div></form> : null}</article>)}</div>
            {installmentPlan.status !== 'paid' && installmentPlan.status !== 'cancelled' ? <div className="mt-5 border-t border-line/80 pt-4 text-right dark:border-shalom-gold/10"><button type="button" className="min-h-11 px-3 text-sm font-semibold text-shalom-wine dark:text-rose-200" onClick={cancelCurrentInstallmentPlan} disabled={saving}>Cancelar parcelamento</button></div> : null}
          </div> : null}
        </section>
      ) : null}

      {activeTab === 'sellers' ? (
        <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <form className="min-w-0" onSubmit={saveSellerRecord}>
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
          <div className="min-w-0 border-t border-line/80 pt-5 dark:border-shalom-gold/10 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold">Vendedores da Livraria</h3>
                <p className="mission-muted mt-1 text-sm">Remover arquiva vendedores com historico e apaga apenas cadastros sem uso.</p>
              </div>
              <select className="mission-input px-3 py-2 text-sm" value={sellerVisibility} onChange={(event) => setSellerVisibility(event.target.value)} disabled={user?.role !== 'admin'}>
                <option value="active">Ativos</option>
                <option value="archived">Arquivados</option>
                <option value="all">Todos</option>
              </select>
            </div>
            <div className="mt-4 overflow-x-auto scrollbar-thin">
              <table className="min-w-[820px] w-full border-separate border-spacing-0 text-left text-sm">
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
                        <td className="border-b border-line/80 px-3 py-2 font-semibold dark:border-shalom-gold/10">
                          <span className="block">{seller.display_name}</span>
                          {seller.archived ? <span className="mission-muted text-xs">Arquivado em {formatDateTime(seller.archived_at)}</span> : null}
                        </td>
                        <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{seller.whatsapp_phone}</td>
                        <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{seller.archived ? 'Arquivado' : seller.active ? 'Ativo' : 'Inativo'} / {seller.eligible && !seller.archived ? 'na rotacao' : 'fora da rotacao'}</td>
                        <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                          Hoje {decimal.format(stats?.assigned_today || 0)} - Pend. {decimal.format(stats?.pending || 0)}
                          {seller.active_assignments_count ? <span className="mission-muted block text-xs">Ativos atribuidos: {decimal.format(seller.active_assignments_count)}</span> : null}
                        </td>
                        <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" className="mission-btn inline-flex items-center gap-2 border border-line/80 px-3 py-2 font-semibold disabled:opacity-55 dark:border-shalom-gold/10" onClick={() => startSellerEdit(seller)} disabled={user?.role !== 'admin' || saving || seller.archived}>
                              <Pencil size={16} />
                              Editar
                            </button>
                            <button type="button" className="mission-btn inline-flex items-center gap-2 border border-shalom-wine/30 px-3 py-2 font-semibold text-shalom-wine disabled:opacity-55 dark:border-rose-300/20 dark:text-rose-100" onClick={() => removeSellerRecord(seller)} disabled={user?.role !== 'admin' || saving}>
                              <Trash2 size={16} />
                              Remover
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!sellers.length ? <p className="mission-muted mt-4 py-5 text-sm">Nenhum vendedor configurado.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'spreadsheet' && isSpreadsheetFilterRoute ? (
        <form className="mx-auto grid w-full max-w-3xl gap-6" onSubmit={applySpreadsheetFilters}>
          <div>
            <p className="mission-muted text-sm">Refine os dados exibidos na planilha. A busca por texto continua disponivel na tela principal.</p>
          </div>

          {spreadsheetSection === 'sales' && spreadsheetFilterDraft ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">Data inicial
                <input type="date" className="mission-input px-3 py-2.5" value={spreadsheetFilterDraft.start_date} onChange={(event) => setSpreadsheetFilterDraft((current) => ({ ...current, start_date: event.target.value }))} />
              </label>
              <label className="grid gap-1 text-sm font-medium">Data final
                <input type="date" className="mission-input px-3 py-2.5" value={spreadsheetFilterDraft.end_date} onChange={(event) => setSpreadsheetFilterDraft((current) => ({ ...current, end_date: event.target.value }))} />
              </label>
              <label className="grid gap-1 text-sm font-medium">Produto
                <select className="mission-input px-3 py-2.5" value={spreadsheetFilterDraft.product_id} onChange={(event) => setSpreadsheetFilterDraft((current) => ({ ...current, product_id: event.target.value }))}>
                  <option value="">Todos os produtos</option>
                  {spreadsheetOptions.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">Categoria
                <select className="mission-input px-3 py-2.5" value={spreadsheetFilterDraft.category_id} onChange={(event) => setSpreadsheetFilterDraft((current) => ({ ...current, category_id: event.target.value }))}>
                  <option value="">Todas as categorias</option>
                  {spreadsheetOptions.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">Vendedor
                <select className="mission-input px-3 py-2.5" value={spreadsheetFilterDraft.seller_id} onChange={(event) => setSpreadsheetFilterDraft((current) => ({ ...current, seller_id: event.target.value }))}>
                  <option value="">Todos os vendedores</option>
                  {spreadsheetOptions.sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.display_name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">Forma de pagamento
                <select className="mission-input px-3 py-2.5" value={spreadsheetFilterDraft.payment_method} onChange={(event) => setSpreadsheetFilterDraft((current) => ({ ...current, payment_method: event.target.value }))}>
                  <option value="">Todas as formas</option>
                  {spreadsheetOptions.payment_methods.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">Status
                <select className="mission-input px-3 py-2.5" value={spreadsheetFilterDraft.status} onChange={(event) => setSpreadsheetFilterDraft((current) => ({ ...current, status: event.target.value }))}>
                  <option value="">Todos os status</option>
                  <option value="completed">Concluida</option>
                </select>
              </label>
            </div>
          ) : null}

          {spreadsheetSection === 'stock' && stockSpreadsheetFilterDraft ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">Categoria
                <select className="mission-input px-3 py-2.5" value={stockSpreadsheetFilterDraft.category_id} onChange={(event) => setStockSpreadsheetFilterDraft((current) => ({ ...current, category_id: event.target.value }))}>
                  <option value="">Todas as categorias</option>
                  {spreadsheetOptions.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">Status
                <select className="mission-input px-3 py-2.5" value={stockSpreadsheetFilterDraft.active} onChange={(event) => setStockSpreadsheetFilterDraft((current) => ({ ...current, active: event.target.value }))}>
                  <option value="">Todos os status</option>
                  <option value="active">Ativos</option>
                  <option value="inactive">Inativos</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">Publicacao
                <select className="mission-input px-3 py-2.5" value={stockSpreadsheetFilterDraft.published} onChange={(event) => setStockSpreadsheetFilterDraft((current) => ({ ...current, published: event.target.value }))}>
                  <option value="">Publicados e nao publicados</option>
                  <option value="published">Publicados</option>
                  <option value="draft">Nao publicados</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">Estoque
                <select className="mission-input px-3 py-2.5" value={stockSpreadsheetFilterDraft.stock} onChange={(event) => setStockSpreadsheetFilterDraft((current) => ({ ...current, stock: event.target.value }))}>
                  <option value="">Todos os estoques</option>
                  <option value="in_stock">Com estoque</option>
                  <option value="out_of_stock">Sem estoque</option>
                </select>
              </label>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-line/80 pt-4 dark:border-shalom-gold/10">
            <button type="button" className="mission-btn px-2 py-2 text-sm font-semibold text-shalom-blue dark:text-shalom-gold" onClick={clearSpreadsheetFilterDraft}>Limpar filtros</button>
            <div className="flex gap-2">
              <button type="button" className="mission-btn border border-line/80 px-4 py-2.5 text-sm font-semibold dark:border-shalom-gold/10" onClick={() => navigate('/gestao-livraria/planilha')}>Cancelar</button>
              <button type="submit" className="mission-btn mission-btn-primary px-4 py-2.5 text-sm font-semibold">Aplicar filtros</button>
            </div>
          </div>
        </form>
      ) : null}

      {activeTab === 'spreadsheet' && !isSpreadsheetFilterRoute ? (
        <section className="grid gap-5">
          <div className="min-w-0 border-b border-line/80 pb-5 dark:border-shalom-gold/10">
            <div className="scrollbar-hidden flex gap-5 overflow-x-auto border-b border-line/80 dark:border-shalom-gold/10" role="tablist" aria-label="Planilhas da Livraria">
              {[
                ['sales', 'Vendas'],
                ['stock', 'Estoque']
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={spreadsheetSection === key}
                  className={`section-text-tab shrink-0 ${spreadsheetSection === key ? 'section-text-tab-active' : ''}`}
                  onClick={() => {
                    setSpreadsheetSection(key)
                    setSpreadsheetExportOpen(false)
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-shalom-blue/60" size={17} />
                <input
                  className="mission-input w-full py-2.5 pl-10 pr-9"
                  value={spreadsheetSection === 'sales' ? spreadsheetFilters.q : stockSpreadsheetFilters.q}
                  onChange={(event) => spreadsheetSection === 'sales' ? updateSpreadsheetFilter({ q: event.target.value }) : updateStockSpreadsheetFilter({ q: event.target.value })}
                  placeholder={spreadsheetSection === 'sales' ? 'Buscar produto, venda ou vendedor' : 'Buscar produto ou SKU'}
                />
              </label>
              <div className="flex items-center gap-2">
                <button type="button" className="mission-btn inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-line/80 px-3 py-2 text-sm font-semibold dark:border-shalom-gold/10 lg:flex-none" onClick={openSpreadsheetFilters}>
                  <Filter size={17} />
                  Filtros{spreadsheetFilterCount ? ` (${spreadsheetFilterCount})` : ''}
                </button>
                <div className="relative flex-1 lg:flex-none">
                  <button type="button" className="mission-btn inline-flex min-h-11 w-full items-center justify-center gap-2 border border-line/80 px-3 py-2 text-sm font-semibold disabled:opacity-55 dark:border-shalom-gold/10" onClick={() => setSpreadsheetExportOpen((open) => !open)} disabled={exporting} aria-expanded={spreadsheetExportOpen} aria-haspopup="menu">
                    <Download size={17} />
                    {exporting ? 'Exportando...' : 'Exportar'}
                    <ChevronDown size={15} />
                  </button>
                  {spreadsheetExportOpen ? (
                    <div className="absolute right-0 top-full z-20 mt-1 min-w-36 border border-line bg-white py-1 shadow-lg dark:border-shalom-gold/15 dark:bg-shalom-deep" role="menu">
                      {['xlsx', 'csv', 'pdf'].map((format) => (
                        <button key={format} type="button" className="block w-full px-4 py-2 text-left text-sm font-semibold uppercase hover:bg-shalom-mist dark:hover:bg-white/10" onClick={() => exportSpreadsheet(format)} role="menuitem">{format}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            {spreadsheetFilterCount ? (
              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className="font-semibold text-shalom-blue dark:text-shalom-gold">{spreadsheetFilterCount} {spreadsheetFilterCount === 1 ? 'filtro ativo' : 'filtros ativos'}</span>
                <button type="button" className="font-semibold underline underline-offset-2" onClick={clearAppliedSpreadsheetFilters}>Limpar</button>
              </div>
            ) : null}
          </div>

          {spreadsheetSection === 'sales' ? (
          <>
          <section className="scrollbar-hidden flex gap-5 overflow-x-auto border-b border-line/80 pb-3 dark:border-shalom-gold/10" aria-label="Resumo de vendas">
            {[
              ['Receita', money.format(spreadsheet.summary?.revenue || 0)],
              ['Lucro', money.format(spreadsheet.summary?.gross_profit || 0)],
              ['Margem', `${decimal.format(spreadsheet.summary?.margin || 0)}%`],
              ['Itens', decimal.format(spreadsheet.summary?.items_sold || 0)]
            ].map(([label, value]) => <p key={label} className="shrink-0 text-xs"><span className="mission-muted mr-1">{label}</span><strong>{value}</strong></p>)}
          </section>

          <div className="min-w-0">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="mission-muted text-sm">
                {spreadsheetLoading ? 'Carregando planilha...' : `${decimal.format(spreadsheet.pagination?.total || 0)} registros encontrados`}
              </p>
              <select className="mission-input w-fit px-3 py-2 text-sm" value={spreadsheetFilters.page_size} onChange={(event) => updateSpreadsheetFilter({ page_size: event.target.value })}>
                {[25, 50, 100, 200].map((size) => <option key={size} value={size}>{size} por pagina</option>)}
              </select>
            </div>
            <div className="divide-y divide-line/80 border-y border-line/80 dark:divide-shalom-gold/10 dark:border-shalom-gold/10 lg:hidden">
              {spreadsheet.rows.map((row) => (
                <article key={row.id} className="py-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block break-words text-sm">{row.produto}</strong>
                      <p className="mission-muted mt-1 text-xs">#{row.venda_id} · {formatDateTime(row.data_hora)}</p>
                    </div>
                    <strong className="shrink-0 text-sm text-shalom-blue dark:text-shalom-gold">{money.format(row.valor_liquido)}</strong>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div><dt className="mission-muted">Quantidade</dt><dd className="font-medium">{decimal.format(row.quantidade)}</dd></div>
                    <div><dt className="mission-muted">Lucro</dt><dd className="font-medium">{money.format(row.lucro)} ({decimal.format(row.margem)}%)</dd></div>
                    <div><dt className="mission-muted">Pagamento</dt><dd className="font-medium">{row.forma_pagamento} · {decimal.format(row.parcelas || 1)}x</dd></div>
                    <div><dt className="mission-muted">Vendedor</dt><dd className="break-words font-medium">{row.vendedor || '-'}</dd></div>
                  </dl>
                </article>
              ))}
              {!spreadsheet.rows.length ? <div className="py-8 text-center"><p className="text-sm font-medium">Nenhum registro encontrado.</p>{spreadsheetFilterCount || spreadsheetFilters.q ? <button type="button" className="mt-2 text-sm font-semibold text-shalom-blue underline underline-offset-2 dark:text-shalom-gold" onClick={resetSpreadsheetViewFilters}>Limpar filtros</button> : null}</div> : null}
            </div>
            <div className="hidden overflow-x-auto border-y border-line/80 scrollbar-thin dark:border-shalom-gold/10 lg:block">
              <table className="min-w-[1280px] w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-shalom-cream/95 dark:bg-shalom-deep/95">
                  <tr>
                    {[
                      ['data_hora', 'Data'],
                      ['venda_id', 'Venda'],
                      ['produto', 'Produto'],
                      ['categoria', 'Categoria'],
                      ['quantidade', 'Qtd.'],
                      ['receita', 'Receita'],
                      ['custo', 'Custo'],
                      ['lucro', 'Lucro'],
                      ['margem', 'Margem'],
                      ['forma_pagamento', 'Pagamento'],
                      ['parcelas', 'Parcelas'],
                      ['vendedor', 'Vendedor'],
                      ['status', 'Status']
                    ].map(([key, label]) => (
                      <th key={key} className="whitespace-nowrap border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">
                        {['data_hora', 'produto', 'quantidade', 'receita', 'custo', 'lucro', 'margem'].includes(key) ? (
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => sortSpreadsheet(key)}>
                            {label}
                            <ArrowUpDown size={13} />
                          </button>
                        ) : label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spreadsheet.rows.map((row) => (
                    <tr key={row.id} className="odd:bg-white/60 even:bg-shalom-mist/40 dark:odd:bg-white/5 dark:even:bg-white/[0.025]">
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{formatDateTime(row.data_hora)}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 font-semibold dark:border-shalom-gold/10">#{row.venda_id}</td>
                      <td className="min-w-60 border-b border-line/70 px-3 py-2 font-medium dark:border-shalom-gold/10">{row.produto}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{row.categoria}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{decimal.format(row.quantidade)}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{money.format(row.valor_liquido)}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{money.format(row.custo_total)}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{money.format(row.lucro)}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{decimal.format(row.margem)}%</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{row.forma_pagamento}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{decimal.format(row.parcelas || 1)}x</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{row.vendedor}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">Concluida</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!spreadsheet.rows.length ? <div className="px-4 py-8 text-center"><p className="font-medium">Nenhum registro encontrado.</p>{spreadsheetFilterCount || spreadsheetFilters.q ? <button type="button" className="mt-2 text-sm font-semibold text-shalom-blue underline underline-offset-2 dark:text-shalom-gold" onClick={resetSpreadsheetViewFilters}>Limpar filtros</button> : null}</div> : null}
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="mission-muted text-sm">
                Pagina {decimal.format(spreadsheet.pagination?.page || 1)} de {decimal.format(spreadsheet.pagination?.total_pages || 1)}
              </p>
              <div className="flex gap-2">
                <button type="button" className="mission-btn border border-line/80 px-3 py-2 text-sm font-semibold disabled:opacity-55 dark:border-shalom-gold/10" disabled={(spreadsheet.pagination?.page || 1) <= 1} onClick={() => updateSpreadsheetFilter({ page: Number(spreadsheet.pagination.page || 1) - 1 })}>Anterior</button>
                <button type="button" className="mission-btn border border-line/80 px-3 py-2 text-sm font-semibold disabled:opacity-55 dark:border-shalom-gold/10" disabled={(spreadsheet.pagination?.page || 1) >= (spreadsheet.pagination?.total_pages || 1)} onClick={() => updateSpreadsheetFilter({ page: Number(spreadsheet.pagination.page || 1) + 1 })}>Proxima</button>
              </div>
            </div>
          </div>
          </>
          ) : (
          <>
          <section className="scrollbar-hidden flex gap-5 overflow-x-auto border-b border-line/80 pb-3 dark:border-shalom-gold/10" aria-label="Resumo de estoque">
            {[
              ['Produtos', decimal.format(stockSpreadsheet.summary?.products_count || 0)],
              ['Unidades', decimal.format(stockSpreadsheet.summary?.units_in_stock || 0)],
              ['Em estoque', money.format(stockSpreadsheet.summary?.inventory_value || 0)],
              ['Valor potencial', money.format(stockSpreadsheet.summary?.inventory_sale_value || 0)],
              ['Lucro potencial', money.format(stockSpreadsheet.summary?.potential_profit || 0)]
            ].map(([label, value]) => <p key={label} className="shrink-0 text-xs"><span className="mission-muted mr-1">{label}</span><strong>{value}</strong></p>)}
          </section>

          <div className="min-w-0">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="mission-muted text-sm">
                {spreadsheetLoading ? 'Carregando estoque...' : `${decimal.format(stockSpreadsheet.pagination?.total || 0)} produtos encontrados`}
              </p>
              <select className="mission-input w-fit px-3 py-2 text-sm" value={stockSpreadsheetFilters.page_size} onChange={(event) => updateStockSpreadsheetFilter({ page_size: event.target.value })}>
                {[25, 50, 100, 200].map((size) => <option key={size} value={size}>{size} por pagina</option>)}
              </select>
            </div>
            <div className="divide-y divide-line/80 border-y border-line/80 dark:divide-shalom-gold/10 dark:border-shalom-gold/10 lg:hidden">
              {stockSpreadsheet.rows.map((row) => (
                <article key={row.id} className="py-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block break-words text-sm">{row.produto}</strong>
                      <p className="mission-muted mt-1 break-all text-xs">{row.sku} · {row.categoria}</p>
                    </div>
                    <strong className="shrink-0 text-sm text-shalom-blue dark:text-shalom-gold">{decimal.format(row.quantidade)} un.</strong>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div><dt className="mission-muted">Custo unitario</dt><dd className="font-medium">{money.format(row.custo_unitario)}</dd></div>
                    <div><dt className="mission-muted">Preco</dt><dd className="font-medium">{money.format(row.preco_venda)}</dd></div>
                    <div><dt className="mission-muted">Valor em estoque</dt><dd className="font-medium">{money.format(row.valor_estoque)}</dd></div>
                    <div><dt className="mission-muted">Status</dt><dd className="font-medium">{row.status} · {row.publicado}</dd></div>
                  </dl>
                </article>
              ))}
              {!stockSpreadsheet.rows.length ? <div className="py-8 text-center"><p className="text-sm font-medium">Nenhum produto encontrado.</p>{spreadsheetFilterCount || stockSpreadsheetFilters.q ? <button type="button" className="mt-2 text-sm font-semibold text-shalom-blue underline underline-offset-2 dark:text-shalom-gold" onClick={resetSpreadsheetViewFilters}>Limpar filtros</button> : null}</div> : null}
            </div>
            <div className="hidden overflow-x-auto border-y border-line/80 scrollbar-thin dark:border-shalom-gold/10 lg:block">
              <table className="min-w-[1280px] w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-shalom-cream/95 dark:bg-shalom-deep/95">
                  <tr>
                    {[
                      ['produto', 'Produto'],
                      ['sku', 'SKU'],
                      ['categoria', 'Categoria'],
                      ['status', 'Status'],
                      ['publicado', 'Publicado'],
                      ['quantidade', 'Qtd.'],
                      ['custo_unitario', 'Custo un.'],
                      ['valor_estoque', 'Valor estoque'],
                      ['preco_venda', 'Preco'],
                      ['valor_potencial', 'Valor potencial'],
                      ['lucro_potencial', 'Lucro potencial'],
                      ['ultima_movimentacao', 'Ultima mov.'],
                      ['cadastrado_em', 'Cadastro']
                    ].map(([key, label]) => (
                      <th key={key} className="whitespace-nowrap border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">
                        {['produto', 'categoria', 'quantidade', 'custo_unitario', 'valor_estoque', 'preco_venda', 'valor_potencial', 'lucro_potencial', 'ultima_movimentacao'].includes(key) ? (
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => sortStockSpreadsheet(key)}>
                            {label}
                            <ArrowUpDown size={13} />
                          </button>
                        ) : label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stockSpreadsheet.rows.map((row) => (
                    <tr key={row.id} className="odd:bg-white/60 even:bg-shalom-mist/40 dark:odd:bg-white/5 dark:even:bg-white/[0.025]">
                      <td className="min-w-60 border-b border-line/70 px-3 py-2 font-medium dark:border-shalom-gold/10">{row.produto}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{row.sku}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{row.categoria}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{row.status}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{row.publicado}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{decimal.format(row.quantidade)} {Number(row.quantidade || 0) <= 0 ? <span className="mission-muted ml-1">(sem estoque)</span> : null}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{money.format(row.custo_unitario)}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{money.format(row.valor_estoque)}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{money.format(row.preco_venda)}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{money.format(row.valor_potencial)}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{money.format(row.lucro_potencial)}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{formatDateTime(row.ultima_movimentacao)}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{formatDateTime(row.cadastrado_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!stockSpreadsheet.rows.length ? <div className="px-4 py-8 text-center"><p className="font-medium">Nenhum produto encontrado.</p>{spreadsheetFilterCount || stockSpreadsheetFilters.q ? <button type="button" className="mt-2 text-sm font-semibold text-shalom-blue underline underline-offset-2 dark:text-shalom-gold" onClick={resetSpreadsheetViewFilters}>Limpar filtros</button> : null}</div> : null}
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="mission-muted text-sm">
                Pagina {decimal.format(stockSpreadsheet.pagination?.page || 1)} de {decimal.format(stockSpreadsheet.pagination?.total_pages || 1)}
              </p>
              <div className="flex gap-2">
                <button type="button" className="mission-btn border border-line/80 px-3 py-2 text-sm font-semibold disabled:opacity-55 dark:border-shalom-gold/10" disabled={(stockSpreadsheet.pagination?.page || 1) <= 1} onClick={() => updateStockSpreadsheetFilter({ page: Number(stockSpreadsheet.pagination.page || 1) - 1 })}>Anterior</button>
                <button type="button" className="mission-btn border border-line/80 px-3 py-2 text-sm font-semibold disabled:opacity-55 dark:border-shalom-gold/10" disabled={(stockSpreadsheet.pagination?.page || 1) >= (stockSpreadsheet.pagination?.total_pages || 1)} onClick={() => updateStockSpreadsheetFilter({ page: Number(stockSpreadsheet.pagination.page || 1) + 1 })}>Proxima</button>
              </div>
            </div>
          </div>
          </>
          )}
        </section>
      ) : null}

    </div>
  )
}
