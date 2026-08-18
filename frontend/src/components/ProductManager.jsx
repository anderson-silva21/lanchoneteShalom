import { ArrowDown, ArrowUp, ArrowUpDown, Boxes, PackagePlus, Save, Search, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../services/api'
import { formatDate, formatQuantityWithUnit, money } from '../utils/formatters'
import { PaginationControls } from './PaginationControls'
import { StatusPill } from './StatusPill'
import { ProductHistoryPanel } from './products/ProductHistoryPanel'
import { ProductMobileList } from './products/ProductMobileList'
import { ProductStockLots } from './products/ProductStockLots'

function createEmptyProduct(category = '') {
  return {
    name: '',
    category,
    cost_price: 0,
    is_donation: false,
    sale_price: 0,
    stock_quantity: 0,
    min_stock: 0,
    supplier: '',
    unit: 'unidade',
    expiration_date: ''
  }
}

const nonnegativeProductFields = ['cost_price', 'sale_price', 'stock_quantity', 'min_stock']
const numericProductSortFields = new Set(['is_donation', 'cost_price', 'sale_price', 'stock_quantity', 'min_stock'])
const PAGE_SIZE = 10

function createEmptyAdjustment(productId = '') {
  return {
    product_id: productId,
    type: 'purchase',
    operation: 'in',
    batch_id: '',
    quantity: 1,
    is_donation: false,
    cost_price: '',
    sale_price: '',
    expiration_date: '',
    notes: ''
  }
}

function getMovementMode(adjustment) {
  if (adjustment.type === 'purchase') return 'purchase'
  if (adjustment.type === 'waste') return 'waste'
  return adjustment.operation === 'out' ? 'adjustment_out' : 'adjustment_in'
}

function clampPage(page, totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  return Math.min(Math.max(1, page), totalPages)
}

function compareProductValues(leftProduct, rightProduct, sortKey) {
  if (numericProductSortFields.has(sortKey)) {
    return Number(leftProduct[sortKey] || 0) - Number(rightProduct[sortKey] || 0)
  }

  if (sortKey === 'expiration_date') {
    const leftTime = leftProduct.expiration_date ? new Date(`${leftProduct.expiration_date}T00:00:00`).getTime() : Number.POSITIVE_INFINITY
    const rightTime = rightProduct.expiration_date ? new Date(`${rightProduct.expiration_date}T00:00:00`).getTime() : Number.POSITIVE_INFINITY
    return leftTime - rightTime
  }

  return String(leftProduct[sortKey] || '').localeCompare(String(rightProduct[sortKey] || ''), 'pt-BR', {
    numeric: true,
    sensitivity: 'base'
  })
}

function DeleteProductModal({ product, confirmation, deleting, onConfirmationChange, onClose, onConfirm }) {
  const expectedConfirmation = `EXCLUIR PRODUTO ${product.id}`

  return createPortal(
    <div className="dashboard-modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dashboard-modal-panel mission-panel text-ink shadow-blue dark:text-slate-50" role="dialog" aria-modal="true" aria-labelledby="delete-product-title">
        <div className="flex items-start justify-between gap-3 border-b border-line/80 p-4 dark:border-shalom-gold/10">
          <div>
            <h2 id="delete-product-title" className="font-display text-lg font-semibold text-shalom-wine dark:text-rose-100">Excluir produto</h2>
            <p className="mission-muted mt-1 text-sm">O produto sera inativado e o historico de vendas e movimentacoes sera preservado.</p>
          </div>
          <button type="button" className="mission-btn border border-line/80 bg-white/70 p-2 dark:border-shalom-gold/10 dark:bg-white/10" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form className="dashboard-modal-body scrollbar-thin space-y-4 p-4" onSubmit={onConfirm}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
              <dt className="mission-muted">Produto</dt>
              <dd className="mt-1 font-semibold">{product.name}</dd>
            </div>
            <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
              <dt className="mission-muted">Codigo</dt>
              <dd className="mt-1 font-semibold">{product.internal_code || '-'}</dd>
            </div>
            <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
              <dt className="mission-muted">Categoria</dt>
              <dd className="mt-1 font-semibold">{product.category || '-'}</dd>
            </div>
            <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
              <dt className="mission-muted">Estoque</dt>
              <dd className="mt-1 font-semibold">{formatQuantityWithUnit(product.stock_quantity || 0, product.unit)}</dd>
            </div>
          </dl>

          <label className="block text-sm font-medium">
            Confirmacao
            <input
              className="mission-input mt-2 w-full px-3 py-2.5"
              value={confirmation}
              onChange={(event) => onConfirmationChange(event.target.value)}
              placeholder={expectedConfirmation}
              autoFocus
            />
          </label>

          <button
            type="submit"
            className="mission-btn flex w-full items-center justify-center gap-2 border border-shalom-wine/35 px-4 py-3 font-semibold text-shalom-wine hover:bg-shalom-wine/10 disabled:cursor-not-allowed disabled:opacity-55 dark:border-rose-200/20 dark:text-rose-100 dark:hover:bg-rose-400/10"
            disabled={confirmation !== expectedConfirmation || deleting}
          >
            <Trash2 size={17} />
            {deleting ? 'Excluindo...' : 'Excluir produto'}
          </button>
        </form>
      </section>
    </div>,
    document.body
  )
}

export function ProductManager({ refreshKey, onChanged = () => {}, intent, setupMode = false, user }) {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' })
  const [draft, setDraft] = useState(() => createEmptyProduct())
  const [adjustment, setAdjustment] = useState(() => createEmptyAdjustment())
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedStock, setSelectedStock] = useState(null)
  const [productHistory, setProductHistory] = useState(null)
  const [movementStock, setMovementStock] = useState(null)
  const [message, setMessage] = useState('')
  const [importCsv, setImportCsv] = useState('')
  const [importing, setImporting] = useState(false)
  const [productToDelete, setProductToDelete] = useState(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletingProduct, setDeletingProduct] = useState(false)
  const [productPage, setProductPage] = useState(1)
  const movementFormRef = useRef(null)
  const movementProductRef = useRef(null)
  const productTableTopScrollRef = useRef(null)
  const productTableScrollRef = useRef(null)

  const loadProducts = useCallback(async () => {
    const [rows, categoryRows] = await Promise.all([
      api.products({ status }),
      api.productCategories()
    ])
    setProducts(rows)
    setSelectedProductId((current) => rows.some((product) => String(product.id) === String(current)) ? current : (rows[0]?.id ? String(rows[0].id) : ''))
    const categoryNames = categoryRows.map((item) => item.category)
    setCategories(categoryNames)
    setDraft((current) => current.category?.trim() ? current : { ...current, category: categoryNames[0] || '' })
  }, [status])

  useEffect(() => {
    loadProducts().catch((err) => setMessage(err.message))
  }, [loadProducts, refreshKey])

  useEffect(() => {
    if (!selectedProductId) {
      setSelectedStock(null)
      setProductHistory(null)
      return
    }

    let mounted = true
    setSelectedStock(null)
    setProductHistory(null)
    Promise.all([
      api.productStock(selectedProductId, { include_empty: '1' }),
      api.productHistory(selectedProductId)
    ])
      .then(([stock, history]) => {
        if (!mounted) return
        setSelectedStock(stock)
        setProductHistory(history)
      })
      .catch((err) => {
        if (mounted) setMessage(err.message)
      })

    return () => {
      mounted = false
    }
  }, [selectedProductId, refreshKey])

  useEffect(() => {
    if (!adjustment.product_id) {
      setMovementStock(null)
      return
    }

    let mounted = true
    setMovementStock(null)
    api.productStock(adjustment.product_id, { include_empty: '1' })
      .then((stock) => {
        if (mounted) setMovementStock(stock)
      })
      .catch((err) => {
        if (mounted) setMessage(err.message)
      })

    return () => {
      mounted = false
    }
  }, [adjustment.product_id])

  useEffect(() => {
    if (!intent) return

    if (intent.action === 'viewStock') {
      setQuery('')
      setStatus(intent.status || 'low')
      return
    }

    if (intent.action === 'purchase') {
      setQuery('')
      setStatus('')
      setAdjustment((current) => ({
        ...current,
        type: 'purchase',
        operation: 'in',
        batch_id: '',
        product_id: intent.productId ? String(intent.productId) : current.product_id
      }))
      if (intent.productId) setSelectedProductId(String(intent.productId))

      window.setTimeout(() => {
        movementFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        movementProductRef.current?.focus({ preventScroll: true })
      }, 80)
    }
  }, [intent])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return products
    return products.filter((product) => [product.name, product.category, product.internal_code, product.supplier]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term)))
  }, [products, query])

  const sortedProducts = useMemo(() => {
    if (!sortConfig.key) return filtered

    const sortDirection = sortConfig.direction === 'asc' ? 1 : -1
    return filtered
      .map((product, index) => ({ product, index }))
      .sort((left, right) => {
        const comparison = compareProductValues(left.product, right.product, sortConfig.key)
        if (comparison !== 0) return comparison * sortDirection
        return left.index - right.index
      })
      .map(({ product }) => product)
  }, [filtered, sortConfig])

  const paginatedProducts = sortedProducts.slice((productPage - 1) * PAGE_SIZE, productPage * PAGE_SIZE)

  useEffect(() => {
    setProductPage((current) => clampPage(current, sortedProducts.length))
  }, [sortedProducts.length])

  async function importProducts(event) {
    event.preventDefault()
    setMessage('')
    if (!importCsv.trim()) {
      setMessage('Cole o CSV ou selecione um arquivo antes de importar.')
      return
    }

    setImporting(true)
    try {
      const result = await api.importProducts({ csv: importCsv })
      setImportCsv('')
      await loadProducts()
      onChanged()
      setMessage(`${result.total} produtos importados.`)
    } catch (err) {
      const errors = err.payload?.errors || []
      setMessage(errors.length ? `${err.message} Linha ${errors[0].line}: ${errors[0].message}` : err.message)
    } finally {
      setImporting(false)
    }
  }

  async function readImportFile(file) {
    if (!file) return
    setImportCsv(await file.text())
  }

  async function createProduct(event) {
    event.preventDefault()
    setMessage('')
    if (!draft.category) {
      setMessage('Selecione uma categoria.')
      return
    }
    const productDraft = {
      ...draft,
      cost_price: draft.is_donation ? 0 : draft.cost_price
    }
    if (nonnegativeProductFields.some((field) => Number(productDraft[field]) < 0)) {
      setMessage('Valores numericos nao podem ser negativos.')
      return
    }
    try {
      await api.createProduct(productDraft)
      setDraft(createEmptyProduct(draft.category))
      await loadProducts()
      onChanged()
      setMessage('Produto cadastrado.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  async function saveProduct(product) {
    setMessage('')
    const productPayload = {
      ...product,
      cost_price: product.is_donation ? 0 : product.cost_price
    }
    if (nonnegativeProductFields.some((field) => Number(productPayload[field]) < 0)) {
      setMessage('Valores numericos nao podem ser negativos.')
      return
    }
    try {
      await api.updateProduct(product.id, productPayload)
      await loadProducts()
      if (String(selectedProductId) === String(product.id)) {
        setProductHistory(await api.productHistory(product.id))
      }
      onChanged()
      setMessage('Produto atualizado.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  function openDeleteProduct(product) {
    setMessage('')
    setProductToDelete(product)
    setDeleteConfirmation('')
  }

  async function deleteSelectedProduct(event) {
    event.preventDefault()
    if (!productToDelete) return

    const confirmation = `EXCLUIR PRODUTO ${productToDelete.id}`
    if (deleteConfirmation !== confirmation) {
      setMessage(`Digite ${confirmation} para confirmar.`)
      return
    }

    const deletedProduct = productToDelete
    setMessage('')
    setDeletingProduct(true)
    try {
      const result = await api.deleteProduct(deletedProduct.id, { confirmation: deleteConfirmation })
      setProducts((current) => current.filter((product) => product.id !== deletedProduct.id))
      if (String(selectedProductId) === String(deletedProduct.id)) {
        setSelectedProductId('')
        setSelectedStock(null)
        setProductHistory(null)
      }
      setProductToDelete(null)
      setDeleteConfirmation('')
      await loadProducts()
      onChanged()
      setMessage(result.message || `Produto ${deletedProduct.name} excluido.`)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setDeletingProduct(false)
    }
  }

  async function createMovement(event) {
    event.preventDefault()
    setMessage('')
    const mode = getMovementMode(adjustment)
    if (mode === 'purchase') {
      const invalidPriceField = [
        ['cost_price', 'custo do produto'],
        ['sale_price', 'valor de venda']
      ].find(([field]) => adjustment[field] !== '' && (!Number.isFinite(Number(adjustment[field])) || Number(adjustment[field]) < 0))

      if (invalidPriceField) {
        setMessage(`O ${invalidPriceField[1]} deve ser um numero maior ou igual a zero.`)
        return
      }
    }

    const payload = {
      product_id: adjustment.product_id,
      type: adjustment.type,
      operation: adjustment.operation,
      quantity: adjustment.quantity,
      is_donation: adjustment.is_donation,
      expiration_date: adjustment.expiration_date,
      notes: adjustment.notes
    }

    if (adjustment.batch_id) payload.batch_id = adjustment.batch_id
    if (mode === 'purchase' && adjustment.is_donation) payload.cost_price = 0
    else if (mode === 'purchase' && adjustment.cost_price !== '') payload.cost_price = Number(adjustment.cost_price)
    if (mode === 'purchase' && adjustment.sale_price !== '') payload.sale_price = Number(adjustment.sale_price)
    if ((mode === 'adjustment_out' || mode === 'waste') && !adjustment.batch_id) {
      setMessage('Informe o lote para saidas de estoque.')
      return
    }

    try {
      await api.createMovement(payload)
      setAdjustment(createEmptyAdjustment())
      setMovementStock(null)
      await loadProducts()
      if (selectedProductId) {
        setSelectedStock(await api.productStock(selectedProductId, { include_empty: '1' }))
        setProductHistory(await api.productHistory(selectedProductId))
      }
      onChanged()
      setMessage('Estoque ajustado.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  function updateRow(id, field, value) {
    setProducts((current) => current.map((product) => product.id === id ? { ...product, [field]: value } : product))
  }

  function updateSelectedBatch(id, field, value) {
    setSelectedStock((current) => {
      if (!current) return current
      return {
        ...current,
        batches: current.batches.map((batch) => batch.id === id ? { ...batch, [field]: value } : batch)
      }
    })
  }

  async function saveBatch(batch) {
    setMessage('')
    const quantityAvailable = Number(batch.quantity_available)
    if (!Number.isFinite(quantityAvailable) || quantityAvailable < 0) {
      setMessage('A quantidade do lote deve ser um numero maior ou igual a zero.')
      return
    }
    try {
      const stock = await api.updateBatch(batch.id, {
        expiration_date: batch.expiration_date || null,
        quantity_available: quantityAvailable
      })
      setSelectedStock(stock)
      setProductHistory(await api.productHistory(stock.productId))
      await loadProducts()
      onChanged()
      setMessage('Lote atualizado.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  const getProductPriceValues = useCallback((productId) => {
    const product = products.find((item) => String(item.id) === String(productId))
    return {
      is_donation: Boolean(product?.is_donation),
      cost_price: product?.cost_price ?? '',
      sale_price: product?.sale_price ?? ''
    }
  }, [products])

  function selectProductForDetails(productId) {
    setSelectedProductId(String(productId))
    window.setTimeout(() => {
      document.getElementById('product-lots-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  function startStockMovement(productId) {
    const prices = getProductPriceValues(productId)
    setSelectedProductId(String(productId))
    setAdjustment((current) => ({
      ...current,
      product_id: String(productId),
      type: 'purchase',
      operation: 'in',
      batch_id: '',
      is_donation: prices.is_donation,
      cost_price: prices.cost_price,
      sale_price: prices.sale_price
    }))
    window.setTimeout(() => {
      movementFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      movementProductRef.current?.focus({ preventScroll: true })
    }, 80)
  }

  function toggleSort(sortKey) {
    setProductPage(1)
    setSortConfig((current) => {
      if (current.key === sortKey) {
        return { key: sortKey, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key: sortKey, direction: 'asc' }
    })
  }

  function syncProductTableScroll(sourceRef, targetRef) {
    if (sourceRef.current && targetRef.current) {
      targetRef.current.scrollLeft = sourceRef.current.scrollLeft
    }
  }

  function renderSortableHeader(sortKey, label) {
    const isActive = sortConfig.key === sortKey
    const SortIcon = isActive ? (sortConfig.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

    return (
      <th
        className="border-b border-line px-3 py-2 dark:border-shalom-gold/10"
        scope="col"
        aria-sort={isActive ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          className="flex w-full items-center gap-1.5 text-left transition hover:text-shalom-blue dark:hover:text-shalom-gold"
          onClick={() => toggleSort(sortKey)}
        >
          <span>{label}</span>
          <SortIcon className={isActive ? 'opacity-90' : 'opacity-40'} size={13} aria-hidden="true" />
        </button>
      </th>
    )
  }

  const movementMode = getMovementMode(adjustment)
  const movementBatches = movementStock?.batches || []
  const selectedBatches = selectedStock?.batches || []
  const selectedProduct = products.find((product) => String(product.id) === String(selectedProductId)) || selectedStock?.product
  const needsMovementBatch = movementMode === 'adjustment_out' || movementMode === 'waste'
  const showsMovementExpiration = movementMode === 'purchase' || (movementMode === 'adjustment_in' && !adjustment.batch_id)
  const canDeleteProducts = user?.role === 'admin' && !setupMode

  useEffect(() => {
    if (movementMode !== 'purchase' || !adjustment.product_id) return

    const prices = getProductPriceValues(adjustment.product_id)
    if (prices.cost_price === '' && prices.sale_price === '' && !prices.is_donation) return
    if (adjustment.cost_price !== '' && adjustment.sale_price !== '') return

    setAdjustment((current) => {
      if (getMovementMode(current) !== 'purchase' || String(current.product_id) !== String(adjustment.product_id)) return current

      const nextCostPrice = current.cost_price === '' ? prices.cost_price : current.cost_price
      const nextSalePrice = current.sale_price === '' ? prices.sale_price : current.sale_price
      if (nextCostPrice === current.cost_price && nextSalePrice === current.sale_price) return current

      return {
        ...current,
        is_donation: prices.is_donation,
        cost_price: nextCostPrice,
        sale_price: nextSalePrice
      }
    })
  }, [adjustment.cost_price, adjustment.product_id, adjustment.sale_price, getProductPriceValues, movementMode])

  return (
    <div className="min-w-0 space-y-5">
      <section className="grid min-w-0 gap-5 min-[2100px]:grid-cols-[minmax(0,1fr)_380px]">
        <div className="mission-panel min-w-0 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">{setupMode ? 'Itens do inventario' : 'Cadastro de produtos'}</h2>
              <p className="mission-muted text-sm">{filtered.length} itens ativos</p>
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-shalom-orange/70" size={16} />
                <input
                  type="search"
                  className="mission-input w-full py-2 pl-9 pr-3 sm:w-64"
                  placeholder="Buscar"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setProductPage(1)
                  }}
                />
              </div>
              <select className="mission-input w-full px-3 py-2 sm:w-auto" value={status} onChange={(event) => {
                setStatus(event.target.value)
                setProductPage(1)
              }}>
                <option value="">Todos</option>
                <option value="low">Baixo</option>
                <option value="critical">Critico</option>
              </select>
            </div>
          </div>

          <div
            ref={productTableTopScrollRef}
            className="mt-4 hidden overflow-x-auto scrollbar-thin min-[1600px]:block"
            onScroll={() => syncProductTableScroll(productTableTopScrollRef, productTableScrollRef)}
            aria-label="Rolagem superior da tabela de produtos"
          >
            <div className="h-px min-w-[980px]" />
          </div>

          <div className="mt-4 min-[1600px]:hidden">
            <ProductMobileList
              products={paginatedProducts}
              categories={categories}
              selectedProductId={selectedProductId}
              canDeleteProducts={canDeleteProducts}
              onChangeProduct={updateRow}
              onDeleteProduct={openDeleteProduct}
              onSaveProduct={saveProduct}
              onSelectProduct={selectProductForDetails}
              onStartStockMovement={startStockMovement}
            />
          </div>

          <div
            ref={productTableScrollRef}
            className="mt-1 hidden overflow-x-auto scrollbar-thin min-[1600px]:block"
            onScroll={() => syncProductTableScroll(productTableScrollRef, productTableTopScrollRef)}
          >
            <table className="min-w-[980px] w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.12em] text-shalom-blue/70 dark:text-shalom-gold/80">
                  {renderSortableHeader('name', 'Produto')}
                  {renderSortableHeader('category', 'Categoria')}
                  {renderSortableHeader('is_donation', 'Origem')}
                  {renderSortableHeader('cost_price', 'Custo')}
                  {renderSortableHeader('sale_price', 'Venda')}
                  {renderSortableHeader('stock_quantity', 'Estoque')}
                  {renderSortableHeader('min_stock', 'Minimo')}
                  {renderSortableHeader('expiration_date', 'Prox. validade')}
                  {renderSortableHeader('stock_status', 'Status')}
                  <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map((product) => (
                  <tr key={product.id} className="border-b border-line/80 dark:border-shalom-gold/10">
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <input className="w-44 rounded-lg border border-transparent bg-transparent px-2 py-1 focus:border-shalom-gold/60" value={product.name} onChange={(event) => updateRow(product.id, 'name', event.target.value)} />
                      <p className="mission-muted px-2 text-xs">{product.internal_code}</p>
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <select className="mission-input w-32 px-2 py-1" value={product.category} onChange={(event) => updateRow(product.id, 'category', event.target.value)}>
                        {categories.map((categoryName) => <option key={categoryName} value={categoryName}>{categoryName}</option>)}
                      </select>
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <label className="flex items-center gap-2 text-xs font-semibold">
                        <input type="checkbox" className="h-4 w-4 accent-shalom-orange" checked={Boolean(product.is_donation)} onChange={(event) => updateRow(product.id, 'is_donation', event.target.checked)} />
                        Doacao
                      </label>
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{product.is_donation ? 'Doacao' : money.format(product.cost_price)}</td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <input type="number" inputMode="decimal" min="0" step="0.01" className="mission-input w-24 px-2 py-1" value={product.sale_price} onChange={(event) => updateRow(product.id, 'sale_price', Number(event.target.value))} />
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      {formatQuantityWithUnit(product.stock_quantity, product.unit)}
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <input type="number" inputMode="decimal" min="0" step="0.001" className="mission-input w-20 px-2 py-1" value={product.min_stock} onChange={(event) => updateRow(product.id, 'min_stock', Number(event.target.value))} />
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{formatDate(product.expiration_date)}</td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10"><StatusPill status={product.stock_status} /></td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <div className="flex items-center gap-1.5">
                        <button className="mission-btn border border-line/80 p-2 hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10" onClick={() => selectProductForDetails(product.id)} title="Ver lotes">
                          <Boxes size={16} />
                        </button>
                        <button className="mission-btn border border-line/80 p-2 hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10" onClick={() => saveProduct(product)} title="Salvar">
                          <Save size={16} />
                        </button>
                        {canDeleteProducts ? (
                          <button className="mission-btn border border-shalom-wine/35 p-2 text-shalom-wine hover:bg-shalom-wine/10 dark:border-rose-200/20 dark:text-rose-100 dark:hover:bg-rose-400/10" onClick={() => openDeleteProduct(product)} title="Excluir produto">
                            <Trash2 size={16} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!sortedProducts.length ? (
                  <tr>
                    <td className="border-b border-line/80 px-3 py-4 mission-muted dark:border-shalom-gold/10" colSpan={10}>
                      Nenhum produto cadastrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={productPage}
            pageSize={PAGE_SIZE}
            totalItems={sortedProducts.length}
            itemLabel="produtos"
            onPageChange={(page) => setProductPage(clampPage(page, sortedProducts.length))}
          />
        </div>

        <div className="min-w-0 space-y-5">
          {setupMode ? (
            <form className="mission-panel p-4" onSubmit={importProducts}>
              <div className="mb-4 flex items-center gap-2">
                <Upload size={20} />
                <h2 className="font-display text-lg font-semibold">Importar planilha</h2>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-3">
                <label className="text-sm font-medium">
                  Arquivo CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="mission-input mt-1 w-full px-3 py-2"
                    onChange={(event) => readImportFile(event.target.files?.[0])}
                  />
                </label>
                <label className="text-sm font-medium">
                  CSV
                  <textarea
                    className="mission-input mt-1 min-h-36 w-full px-3 py-2 font-mono text-xs"
                    value={importCsv}
                    onChange={(event) => setImportCsv(event.target.value)}
                    placeholder="produto;categoria;unidade;quantidade;custo;doacao;venda;minimo;fornecedor;validade"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="mission-btn mission-btn-gold mt-4 flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold"
                disabled={importing}
              >
                <Upload size={17} />
                {importing ? 'Importando...' : 'Importar CSV'}
              </button>
            </form>
          ) : null}

          <form className="mission-panel p-4" onSubmit={createProduct}>
            <div className="mb-4 flex items-center gap-2">
              <PackagePlus size={20} />
              <h2 className="font-display text-lg font-semibold">{setupMode ? 'Adicionar item real' : 'Novo produto'}</h2>
            </div>
              <div className="grid min-w-0 grid-cols-1 gap-3">
              <label className="text-sm font-medium">
                Nome
                <input className="mission-input mt-1 w-full px-3 py-2" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <label className="text-sm font-medium">
                Categoria
                <select className="mission-input mt-1 w-full px-3 py-2" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                  <option value="" disabled>Selecione</option>
                  {categories.map((categoryName) => <option key={categoryName} value={categoryName}>{categoryName}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">
                Unidade
                <input className="mission-input mt-1 w-full px-3 py-2" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} />
              </label>
              <label className="text-sm font-medium">
                Fornecedor
                <input className="mission-input mt-1 w-full px-3 py-2" value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-line/80 px-3 py-2 text-sm font-medium dark:border-shalom-gold/10">
                <span>Produto recebido por doacao</span>
                <input type="checkbox" className="h-4 w-4 accent-shalom-orange" checked={Boolean(draft.is_donation)} onChange={(event) => setDraft({ ...draft, is_donation: event.target.checked, cost_price: event.target.checked ? 0 : draft.cost_price })} />
              </label>
              <label className="text-sm font-medium">
                Validade
                <input type="date" className="mission-input mt-1 w-full px-3 py-2" value={draft.expiration_date} onChange={(event) => setDraft({ ...draft, expiration_date: event.target.value })} />
              </label>
              <div className="grid min-w-0 grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                {[
                  ['cost_price', 'Custo', '0.01'],
                  ['sale_price', 'Venda', '0.01'],
                  ['stock_quantity', 'Estoque', '0.001'],
                  ['min_stock', 'Minimo', '0.001']
                ].map(([field, label, step]) => (
                  <label key={field} className="text-sm font-medium">
                    {label}
                    <input type="number" inputMode="decimal" min="0" step={step} className="mission-input mt-1 w-full px-3 py-2 disabled:opacity-60" value={field === 'cost_price' && draft.is_donation ? 0 : draft[field]} disabled={field === 'cost_price' && draft.is_donation} onChange={(event) => setDraft({ ...draft, [field]: Number(event.target.value) })} />
                  </label>
                ))}
              </div>
            </div>
            <button className="mission-btn mission-btn-primary mt-4 flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold">
              <PackagePlus size={17} />
              Cadastrar
            </button>
          </form>

          <form ref={movementFormRef} className="mission-panel p-4" onSubmit={createMovement}>
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal size={20} />
              <h2 className="font-display text-lg font-semibold">Movimentar estoque</h2>
            </div>
            <label className="text-sm font-medium">
              Produto
              <select
                ref={movementProductRef}
                className="mission-input mt-1 w-full px-3 py-2"
                value={adjustment.product_id}
                onChange={(event) => {
                  const productId = event.target.value
                  const prices = getProductPriceValues(productId)
                  setAdjustment({
                    ...adjustment,
                    product_id: productId,
                    batch_id: '',
                    is_donation: movementMode === 'purchase' ? prices.is_donation : adjustment.is_donation,
                    cost_price: movementMode === 'purchase' ? prices.cost_price : adjustment.cost_price,
                    sale_price: movementMode === 'purchase' ? prices.sale_price : adjustment.sale_price
                  })
                }}
              >
                <option value="">Selecione</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 min-[380px]:grid-cols-2">
              <label className="text-sm font-medium">
                Tipo
                <select
                  className="mission-input mt-1 w-full px-3 py-2"
                  value={movementMode}
                  onChange={(event) => {
                    const nextMode = event.target.value
                    setAdjustment((current) => ({
                      ...current,
                      type: nextMode === 'purchase' ? 'purchase' : nextMode === 'waste' ? 'waste' : 'adjustment',
                      operation: nextMode === 'adjustment_out' || nextMode === 'waste' ? 'out' : 'in',
                      batch_id: nextMode === 'purchase' ? '' : current.batch_id,
                      is_donation: nextMode === 'purchase' ? getProductPriceValues(current.product_id).is_donation : current.is_donation,
                      cost_price: nextMode === 'purchase' && current.cost_price === '' ? getProductPriceValues(current.product_id).cost_price : current.cost_price,
                      sale_price: nextMode === 'purchase' && current.sale_price === '' ? getProductPriceValues(current.product_id).sale_price : current.sale_price
                    }))
                  }}
                >
                  <option value="purchase">Compra</option>
                  <option value="adjustment_in">Ajuste entrada</option>
                  <option value="adjustment_out">Ajuste saida</option>
                  <option value="waste">Desperdicio</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Quantidade
                <input type="number" inputMode="decimal" min="0.001" step="0.001" className="mission-input mt-1 w-full px-3 py-2" value={adjustment.quantity} onChange={(event) => setAdjustment({ ...adjustment, quantity: Number(event.target.value) })} />
              </label>
            </div>
            {movementMode === 'purchase' ? (
              <div className="mt-3 grid gap-3">
                <label className="flex items-center justify-between gap-3 rounded-xl border border-line/80 px-3 py-2 text-sm font-medium dark:border-shalom-gold/10">
                  <span>Entrada recebida por doacao</span>
                  <input type="checkbox" className="h-4 w-4 accent-shalom-orange" checked={Boolean(adjustment.is_donation)} onChange={(event) => setAdjustment({ ...adjustment, is_donation: event.target.checked, cost_price: event.target.checked ? 0 : adjustment.cost_price })} />
                </label>
                <div className="grid min-w-0 grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                  <label className="text-sm font-medium">
                    Custo do produto
                    <input type="number" inputMode="decimal" min="0" step="0.01" className="mission-input mt-1 w-full px-3 py-2 disabled:opacity-60" value={adjustment.is_donation ? 0 : (adjustment.cost_price ?? '')} disabled={Boolean(adjustment.is_donation)} onChange={(event) => setAdjustment({ ...adjustment, cost_price: event.target.value })} />
                  </label>
                  <label className="text-sm font-medium">
                    Valor de venda
                    <input type="number" inputMode="decimal" min="0" step="0.01" className="mission-input mt-1 w-full px-3 py-2" value={adjustment.sale_price ?? ''} onChange={(event) => setAdjustment({ ...adjustment, sale_price: event.target.value })} />
                  </label>
                </div>
              </div>
            ) : null}
            {movementMode !== 'purchase' ? (
              <label className="mt-3 block text-sm font-medium">
                Lote {needsMovementBatch ? '' : '(opcional)'}
                <select className="mission-input mt-1 w-full px-3 py-2" value={adjustment.batch_id} onChange={(event) => setAdjustment({ ...adjustment, batch_id: event.target.value })}>
                  <option value="">{needsMovementBatch ? 'Selecione um lote' : 'Criar novo lote'}</option>
                  {movementBatches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      #{batch.id} - {formatDate(batch.expiration_date)} - {formatQuantityWithUnit(batch.quantity_available, batch.unit)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {showsMovementExpiration ? (
              <label className="mt-3 block text-sm font-medium">
                Validade do lote
                <input type="date" className="mission-input mt-1 w-full px-3 py-2" value={adjustment.expiration_date} onChange={(event) => setAdjustment({ ...adjustment, expiration_date: event.target.value })} />
              </label>
            ) : null}
            <label className="mt-3 block text-sm font-medium">
              Observacao
              <input className="mission-input mt-1 w-full px-3 py-2" value={adjustment.notes} onChange={(event) => setAdjustment({ ...adjustment, notes: event.target.value })} />
            </label>
            <button className="mission-btn mission-btn-gold mt-4 flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold">
              <Save size={17} />
              Salvar movimento
            </button>
          </form>
        </div>
      </section>

      <ProductStockLots
        products={products}
        selectedBatches={selectedBatches}
        selectedProduct={selectedProduct}
        selectedProductId={selectedProductId}
        selectedStock={selectedStock}
        onBatchChange={updateSelectedBatch}
        onProductChange={setSelectedProductId}
        onSaveBatch={saveBatch}
      />

      <ProductHistoryPanel
        productHistory={productHistory}
        selectedProduct={selectedProduct}
        selectedProductId={selectedProductId}
      />

      {message ? <p className="rounded-2xl bg-shalom-cream/70 px-4 py-3 text-sm text-shalom-deep shadow-sm dark:bg-white/10 dark:text-shalom-gold">{message}</p> : null}

      {productToDelete ? (
        <DeleteProductModal
          product={productToDelete}
          confirmation={deleteConfirmation}
          deleting={deletingProduct}
          onConfirmationChange={setDeleteConfirmation}
          onClose={() => {
            if (deletingProduct) return
            setProductToDelete(null)
            setDeleteConfirmation('')
          }}
          onConfirm={deleteSelectedProduct}
        />
      ) : null}
    </div>
  )
}
