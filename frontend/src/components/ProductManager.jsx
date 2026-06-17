import { ArrowDown, ArrowUp, ArrowUpDown, Boxes, PackagePlus, Save, Search, SlidersHorizontal } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../services/api'
import { decimal, formatDate, formatQuantityWithUnit, money } from '../utils/formatters'
import { StatusPill } from './StatusPill'

function createEmptyProduct(category = '') {
  return {
    name: '',
    category,
    cost_price: 0,
    sale_price: 0,
    stock_quantity: 0,
    min_stock: 0,
    supplier: '',
    unit: 'unidade',
    expiration_date: ''
  }
}

const nonnegativeProductFields = ['cost_price', 'sale_price', 'stock_quantity', 'min_stock']
const numericProductSortFields = new Set(['cost_price', 'sale_price', 'stock_quantity', 'min_stock'])

function createEmptyAdjustment(productId = '') {
  return {
    product_id: productId,
    type: 'purchase',
    operation: 'in',
    batch_id: '',
    quantity: 1,
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

function getBatchStatusClass(status) {
  if (status === 'expired') return 'bg-shalom-wine/10 text-shalom-wine ring-shalom-wine/25 dark:bg-shalom-wine/25 dark:text-rose-100'
  if (status === 'critical') return 'bg-shalom-orange/15 text-shalom-wine ring-shalom-orange/25 dark:bg-shalom-orange/20 dark:text-shalom-gold'
  if (status === 'warning') return 'bg-shalom-gold/35 text-shalom-deep ring-shalom-orange/20 dark:bg-shalom-gold/20 dark:text-shalom-gold'
  if (status === 'missing') return 'bg-shalom-mist text-shalom-blue ring-shalom-blue/10 dark:bg-white/10 dark:text-slate-200'
  return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-100 dark:ring-emerald-400/20'
}

function getBatchStatusLabel(batch) {
  if (batch.expiration_status === 'expired') return `Vencido ha ${Math.abs(Number(batch.days_to_expire || 0))} dias`
  if (batch.expiration_status === 'critical' && Number(batch.days_to_expire) === 0) return 'Vence hoje'
  if (batch.expiration_status === 'critical' || batch.expiration_status === 'warning') return `Vence em ${decimal.format(batch.days_to_expire)} dias`
  if (batch.expiration_status === 'missing') return 'Sem validade'
  if (batch.expiration_status === 'empty') return 'Esgotado'
  return 'Ok'
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

export function ProductManager({ refreshKey, onChanged, intent }) {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' })
  const [draft, setDraft] = useState(() => createEmptyProduct('Lanches'))
  const [adjustment, setAdjustment] = useState(() => createEmptyAdjustment())
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedStock, setSelectedStock] = useState(null)
  const [movementStock, setMovementStock] = useState(null)
  const [message, setMessage] = useState('')
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
    setSelectedProductId((current) => current || (rows[0]?.id ? String(rows[0].id) : ''))
    const categoryNames = categoryRows.map((item) => item.category)
    setCategories(categoryNames)
    setDraft((current) => {
      if (categoryNames.includes(current.category)) return current
      return { ...current, category: categoryNames[0] || '' }
    })
  }, [status])

  useEffect(() => {
    loadProducts().catch((err) => setMessage(err.message))
  }, [loadProducts, refreshKey])

  useEffect(() => {
    if (!selectedProductId) {
      setSelectedStock(null)
      return
    }

    let mounted = true
    setSelectedStock(null)
    api.productStock(selectedProductId, { include_empty: '1' })
      .then((stock) => {
        if (mounted) setSelectedStock(stock)
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

  async function createProduct(event) {
    event.preventDefault()
    setMessage('')
    if (!draft.category) {
      setMessage('Selecione uma categoria.')
      return
    }
    if (nonnegativeProductFields.some((field) => Number(draft[field]) < 0)) {
      setMessage('Valores numericos nao podem ser negativos.')
      return
    }
    try {
      await api.createProduct(draft)
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
    if (nonnegativeProductFields.some((field) => Number(product[field]) < 0)) {
      setMessage('Valores numericos nao podem ser negativos.')
      return
    }
    try {
      await api.updateProduct(product.id, product)
      await loadProducts()
      onChanged()
      setMessage('Produto atualizado.')
    } catch (err) {
      setMessage(err.message)
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
      expiration_date: adjustment.expiration_date,
      notes: adjustment.notes
    }

    if (adjustment.batch_id) payload.batch_id = adjustment.batch_id
    if (mode === 'purchase' && adjustment.cost_price !== '') payload.cost_price = Number(adjustment.cost_price)
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

  const getProductPriceValues = useCallback((productId) => {
    const product = products.find((item) => String(item.id) === String(productId))
    return {
      cost_price: product?.cost_price ?? '',
      sale_price: product?.sale_price ?? ''
    }
  }, [products])

  function toggleSort(sortKey) {
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

  useEffect(() => {
    if (movementMode !== 'purchase' || !adjustment.product_id) return

    const prices = getProductPriceValues(adjustment.product_id)
    if (prices.cost_price === '' && prices.sale_price === '') return
    if (adjustment.cost_price !== '' && adjustment.sale_price !== '') return

    setAdjustment((current) => {
      if (getMovementMode(current) !== 'purchase' || String(current.product_id) !== String(adjustment.product_id)) return current

      const nextCostPrice = current.cost_price === '' ? prices.cost_price : current.cost_price
      const nextSalePrice = current.sale_price === '' ? prices.sale_price : current.sale_price
      if (nextCostPrice === current.cost_price && nextSalePrice === current.sale_price) return current

      return {
        ...current,
        cost_price: nextCostPrice,
        sale_price: nextSalePrice
      }
    })
  }, [adjustment.cost_price, adjustment.product_id, adjustment.sale_price, getProductPriceValues, movementMode])

  return (
    <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="mission-panel p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Cadastro de produtos</h2>
              <p className="mission-muted text-sm">{filtered.length} itens ativos</p>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-shalom-orange/70" size={16} />
                <input
                  className="mission-input w-full py-2 pl-9 pr-3 sm:w-64"
                  placeholder="Buscar"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <select className="mission-input px-3 py-2" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todos</option>
                <option value="low">Baixo</option>
                <option value="critical">Critico</option>
              </select>
            </div>
          </div>

          <div
            ref={productTableTopScrollRef}
            className="mt-4 overflow-x-auto scrollbar-thin"
            onScroll={() => syncProductTableScroll(productTableTopScrollRef, productTableScrollRef)}
            aria-label="Rolagem superior da tabela de produtos"
          >
            <div className="h-px min-w-[1080px]" />
          </div>

          <div
            ref={productTableScrollRef}
            className="mt-1 overflow-x-auto scrollbar-thin"
            onScroll={() => syncProductTableScroll(productTableScrollRef, productTableTopScrollRef)}
          >
            <table className="min-w-[1080px] w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.12em] text-shalom-blue/70 dark:text-shalom-gold/80">
                  {renderSortableHeader('name', 'Produto')}
                  {renderSortableHeader('category', 'Categoria')}
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
                {sortedProducts.map((product) => (
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
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{money.format(product.cost_price)}</td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <input type="number" min="0" step="0.01" className="mission-input w-24 px-2 py-1" value={product.sale_price} onChange={(event) => updateRow(product.id, 'sale_price', Number(event.target.value))} />
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      {formatQuantityWithUnit(product.stock_quantity, product.unit)}
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <input type="number" min="0" step="1" className="mission-input w-20 px-2 py-1" value={product.min_stock} onChange={(event) => updateRow(product.id, 'min_stock', Number(event.target.value))} />
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{formatDate(product.expiration_date)}</td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10"><StatusPill status={product.stock_status} /></td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <div className="flex items-center gap-1.5">
                        <button className="mission-btn border border-line/80 p-2 hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10" onClick={() => setSelectedProductId(String(product.id))} title="Ver lotes">
                          <Boxes size={16} />
                        </button>
                        <button className="mission-btn border border-line/80 p-2 hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10" onClick={() => saveProduct(product)} title="Salvar">
                          <Save size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          <form className="mission-panel p-4" onSubmit={createProduct}>
            <div className="mb-4 flex items-center gap-2">
              <PackagePlus size={20} />
              <h2 className="font-display text-lg font-semibold">Novo produto</h2>
            </div>
            <div className="grid gap-3">
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
              <label className="text-sm font-medium">
                Validade
                <input type="date" className="mission-input mt-1 w-full px-3 py-2" value={draft.expiration_date} onChange={(event) => setDraft({ ...draft, expiration_date: event.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['cost_price', 'Custo', '0.01'],
                  ['sale_price', 'Venda', '0.01'],
                  ['stock_quantity', 'Estoque', '1'],
                  ['min_stock', 'Minimo', '1']
                ].map(([field, label, step]) => (
                  <label key={field} className="text-sm font-medium">
                    {label}
                    <input type="number" min="0" step={step} className="mission-input mt-1 w-full px-3 py-2" value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: Number(event.target.value) })} />
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
                    cost_price: movementMode === 'purchase' ? prices.cost_price : adjustment.cost_price,
                    sale_price: movementMode === 'purchase' ? prices.sale_price : adjustment.sale_price
                  })
                }}
              >
                <option value="">Selecione</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
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
                <input type="number" min="1" step="1" className="mission-input mt-1 w-full px-3 py-2" value={adjustment.quantity} onChange={(event) => setAdjustment({ ...adjustment, quantity: Number(event.target.value) })} />
              </label>
            </div>
            {movementMode === 'purchase' ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-sm font-medium">
                  Custo do produto
                  <input type="number" min="0" step="0.01" className="mission-input mt-1 w-full px-3 py-2" value={adjustment.cost_price ?? ''} onChange={(event) => setAdjustment({ ...adjustment, cost_price: event.target.value })} />
                </label>
                <label className="text-sm font-medium">
                  Valor de venda
                  <input type="number" min="0" step="0.01" className="mission-input mt-1 w-full px-3 py-2" value={adjustment.sale_price ?? ''} onChange={(event) => setAdjustment({ ...adjustment, sale_price: event.target.value })} />
                </label>
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

      <section className="mission-panel p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Boxes size={20} />
            <div>
              <h2 className="font-display text-lg font-semibold">Lotes de estoque</h2>
              <p className="mission-muted text-sm">
                {selectedProduct ? `${selectedProduct.name} - ${formatQuantityWithUnit(selectedStock?.totalQuantity || selectedProduct.stock_quantity || 0, selectedProduct.unit)}` : 'Selecione um produto'}
              </p>
            </div>
          </div>
          <select className="mission-input px-3 py-2" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
            <option value="">Produto</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto scrollbar-thin">
          <table className="min-w-[760px] w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.12em] text-shalom-blue/70 dark:text-shalom-gold/80">
                <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Lote</th>
                <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Validade</th>
                <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Quantidade</th>
                <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Dias</th>
                <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Alerta</th>
              </tr>
            </thead>
            <tbody>
              {selectedProductId && selectedStock === null ? (
                <tr>
                  <td className="border-b border-line/80 px-3 py-3 dark:border-shalom-gold/10" colSpan={5}>Carregando lotes...</td>
                </tr>
              ) : selectedBatches.length ? selectedBatches.map((batch) => (
                <tr key={batch.id} className="border-b border-line/80 dark:border-shalom-gold/10">
                  <td className="border-b border-line/80 px-3 py-2 font-mono text-xs dark:border-shalom-gold/10">#{batch.id}</td>
                  <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{formatDate(batch.expiration_date)}</td>
                  <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{formatQuantityWithUnit(batch.quantity_available, batch.unit)}</td>
                  <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                    {batch.days_to_expire === null || batch.days_to_expire === undefined ? '-' : decimal.format(batch.days_to_expire)}
                  </td>
                  <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getBatchStatusClass(batch.expiration_status)}`}>
                      {getBatchStatusLabel(batch)}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="border-b border-line/80 px-3 py-3 mission-muted dark:border-shalom-gold/10" colSpan={5}>
                    Nenhum lote para este produto.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {message ? <p className="rounded-2xl bg-shalom-cream/70 px-4 py-3 text-sm text-shalom-deep shadow-sm dark:bg-white/10 dark:text-shalom-gold">{message}</p> : null}
    </div>
  )
}
