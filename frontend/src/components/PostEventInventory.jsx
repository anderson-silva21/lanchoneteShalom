import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  History,
  PlusCircle,
  RefreshCcw,
  Save,
  Search
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { decimal, formatDateTime, formatQuantityWithUnit } from '../utils/formatters'

function roundQuantity(value) {
  return Number(Number(value || 0).toFixed(3))
}

function parseQuantity(value) {
  return Number(String(value ?? '').trim().replace(',', '.'))
}

function createEmptyEvent() {
  return {
    event_id: '',
    event_name: '',
    event_date: '',
    notes: ''
  }
}

function buildReportTotals(items) {
  return {
    inventoried_items: items.length,
    adjusted_items: items.filter((item) => roundQuantity(item.quantity_change) !== 0).length,
    consumed_items: items.filter((item) => Number(item.consumed_quantity) > 0).length
  }
}

function formatSignedQuantity(value, unit) {
  const quantity = Number(value || 0)
  if (quantity === 0) return formatQuantityWithUnit(0, unit)
  return `${quantity > 0 ? '+' : ''}${formatQuantityWithUnit(quantity, unit)}`
}

export function PostEventInventory({ refreshKey, onChanged, onRegisterEvent }) {
  const [products, setProducts] = useState([])
  const [events, setEvents] = useState([])
  const [history, setHistory] = useState([])
  const [eventDraft, setEventDraft] = useState(createEmptyEvent)
  const [quantities, setQuantities] = useState({})
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [report, setReport] = useState(null)
  const [savedInventory, setSavedInventory] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const [conflictDetails, setConflictDetails] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const [productRows, eventRows, inventoryRows] = await Promise.all([
        api.products(),
        api.events().catch(() => []),
        api.postEventInventories().catch(() => [])
      ])
      setProducts(productRows)
      setEvents(eventRows)
      setHistory(inventoryRows)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  const categories = useMemo(() => (
    [...new Set(products.map((product) => product.category).filter(Boolean))].sort((left, right) => left.localeCompare(right))
  ), [products])

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase()
    return products.filter((product) => {
      const matchesCategory = !category || product.category === category
      if (!matchesCategory) return false
      if (!term) return true
      return [product.name, product.category, product.internal_code, product.supplier]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [category, products, query])

  const filledCount = useMemo(() => Object.values(quantities).filter((value) => String(value ?? '').trim() !== '').length, [quantities])
  const activeReport = report
  const reportItems = activeReport?.items || []

  function clearReportState() {
    setReport(null)
    setSavedInventory(null)
    setConfirmed(false)
    setConflictDetails([])
  }

  function updateEventDraft(field, value) {
    setEventDraft((current) => ({ ...current, [field]: value }))
    clearReportState()
  }

  function selectEvent(eventId) {
    const selectedEvent = events.find((item) => String(item.id) === String(eventId))
    setEventDraft((current) => ({
      ...current,
      event_id: eventId,
      event_name: selectedEvent?.name || '',
      event_date: selectedEvent?.event_date || ''
    }))
    clearReportState()
  }

  function updateQuantity(productId, value) {
    setQuantities((current) => ({ ...current, [productId]: value }))
    clearReportState()
  }

  function getInventoryEntries() {
    const invalid = []
    const entries = []

    products.forEach((product) => {
      const rawValue = quantities[product.id]
      if (String(rawValue ?? '').trim() === '') return

      const physicalQuantity = parseQuantity(rawValue)
      if (!Number.isFinite(physicalQuantity) || physicalQuantity < 0) {
        invalid.push(product.name)
        return
      }

      entries.push({ product, physicalQuantity: roundQuantity(physicalQuantity) })
    })

    return { entries, invalid }
  }

  function generateReport(event) {
    event.preventDefault()
    setMessage('')
    setConflictDetails([])

    const selectedEvent = events.find((item) => String(item.id) === String(eventDraft.event_id))
    if (!selectedEvent) {
      setMessage('Selecione um evento registrado.')
      return
    }

    const { entries, invalid } = getInventoryEntries()
    if (invalid.length > 0) {
      setMessage(`Quantidade invalida em: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '...' : ''}`)
      return
    }

    if (entries.length === 0) {
      setMessage('Informe ao menos uma quantidade fisica.')
      return
    }

    const items = entries.map(({ product, physicalQuantity }) => {
      const quantityBefore = roundQuantity(product.stock_quantity)
      const difference = roundQuantity(quantityBefore - physicalQuantity)
      const quantityChange = roundQuantity(physicalQuantity - quantityBefore)

      return {
        product_id: product.id,
        product_name: product.name,
        category: product.category,
        internal_code: product.internal_code,
        unit: product.unit,
        quantity_before: quantityBefore,
        physical_quantity: physicalQuantity,
        difference,
        consumed_quantity: Math.max(difference, 0),
        quantity_change: quantityChange
      }
    })

    setReport({
      event_id: selectedEvent.id,
      event_name: selectedEvent.name,
      event_date: selectedEvent.event_date,
      notes: eventDraft.notes.trim() || null,
      items,
      totals: buildReportTotals(items)
    })
    setSavedInventory(null)
    setConfirmed(false)
    setMessage('Relatorio gerado.')
  }

  async function confirmInventory() {
    if (!report || savedInventory) return
    if (!confirmed) {
      setMessage('Confirme a atualizacao do estoque.')
      return
    }

    setSaving(true)
    setMessage('')
    setConflictDetails([])

    try {
      const saved = await api.createPostEventInventory({
        event_id: report.event_id,
        notes: report.notes,
        items: report.items.map((item) => ({
          product_id: item.product_id,
          physical_quantity: item.physical_quantity,
          expected_stock_quantity: item.quantity_before
        }))
      })

      setReport(saved)
      setSavedInventory(saved)
      setQuantities({})
      setConfirmed(true)
      setEventDraft(createEmptyEvent())
      await loadData()
      onChanged?.()
      setMessage(`Inventario #${saved.id} confirmado.`)
    } catch (err) {
      setMessage(err.message)
      setConflictDetails(err.payload?.details || [])
    } finally {
      setSaving(false)
    }
  }

  async function loadInventory(id) {
    setMessage('')
    setConflictDetails([])
    try {
      const inventory = await api.postEventInventory(id)
      setReport(inventory)
      setSavedInventory(inventory)
      setConfirmed(true)
      setQuantities({})
      setMessage(`Inventario #${inventory.id} carregado.`)
    } catch (err) {
      setMessage(err.message)
    }
  }

  function startNewInventory() {
    setEventDraft(createEmptyEvent())
    setQuantities({})
    setMessage('')
    clearReportState()
  }

  return (
    <div className="min-w-0 space-y-5">
      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form className="min-w-0 space-y-5" onSubmit={generateReport}>
          <section className="mission-panel min-w-0 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={21} />
                  <h2 className="font-display text-lg font-semibold">Inventario pos-evento</h2>
                </div>
                <p className="mission-muted mt-1 text-sm">{products.length} produtos cadastrados</p>
              </div>
              <button type="button" className="mission-btn border border-line/80 px-3 py-2 text-sm font-semibold hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10" onClick={startNewInventory}>
                <span className="flex items-center gap-2">
                  <RefreshCcw size={16} />
                  Novo
                </span>
              </button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
              <label className="text-sm font-medium">
                Evento
                <select className="mission-input mt-1 w-full px-3 py-2" value={eventDraft.event_id} onChange={(event) => selectEvent(event.target.value)}>
                  <option value="">Selecione</option>
                  {events.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} - {item.event_date}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Data
                <input type="date" className="mission-input mt-1 w-full px-3 py-2" value={eventDraft.event_date} readOnly />
              </label>
              {!events.length ? (
                <div className="rounded-xl border border-line/80 bg-white/70 p-3 text-sm dark:border-shalom-gold/10 dark:bg-white/10 lg:col-span-2">
                  <p className="mission-muted">Nenhum evento disponivel para inventario. Registre um evento antes de iniciar a contagem.</p>
                  {onRegisterEvent ? (
                    <button
                      type="button"
                      className="mission-btn mission-btn-gold mt-3 flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2 font-semibold sm:w-auto"
                      onClick={onRegisterEvent}
                    >
                      <PlusCircle size={17} />
                      Registrar evento
                    </button>
                  ) : null}
                </div>
              ) : null}
              <label className="text-sm font-medium lg:col-span-2">
                Observacoes
                <textarea className="mission-input mt-1 min-h-20 w-full resize-y px-3 py-2" value={eventDraft.notes} onChange={(event) => updateEventDraft('notes', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="mission-panel min-w-0 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">Produtos</h2>
                <p className="mission-muted text-sm">{filledCount} itens com quantidade informada</p>
              </div>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-shalom-orange/70" size={16} />
                  <input className="mission-input w-full py-2 pl-9 pr-3 sm:w-64" placeholder="Filtrar" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                <select className="mission-input px-3 py-2" value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">Categorias</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4 space-y-3 lg:hidden">
              {loading ? (
                <div className="rounded-xl border border-line/80 bg-white/70 p-4 text-sm dark:border-shalom-gold/10 dark:bg-white/10">Carregando produtos...</div>
              ) : filteredProducts.length ? filteredProducts.map((product) => (
                <article key={product.id} className="mission-card min-w-0 p-3">
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{product.name}</p>
                      <p className="mission-muted text-xs">{product.category} - {product.internal_code}</p>
                      <p className="mission-muted mt-1 text-xs">{product.supplier || '-'}</p>
                    </div>
                    <span className="self-start rounded-xl bg-shalom-mist/70 px-2.5 py-1 text-xs font-semibold dark:bg-white/10">
                      {formatQuantityWithUnit(product.stock_quantity, product.unit)}
                    </span>
                  </div>
                  <label className="mt-3 block text-sm font-medium">
                    Quantidade no inventario
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.001"
                      className="mission-input mt-1 w-full px-3 py-2"
                      value={quantities[product.id] ?? ''}
                      onChange={(event) => updateQuantity(product.id, event.target.value)}
                      aria-label={`Quantidade fisica de ${product.name}`}
                    />
                  </label>
                </article>
              )) : (
                <div className="rounded-xl border border-line/80 bg-white/70 p-4 text-sm dark:border-shalom-gold/10 dark:bg-white/10">Nenhum produto encontrado.</div>
              )}
            </div>

            <div className="mt-4 hidden max-h-[58vh] min-w-0 overflow-auto rounded-2xl border border-line/80 scrollbar-thin dark:border-shalom-gold/10 lg:block">
              <table className="min-w-[860px] w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-shalom-cream/95 backdrop-blur dark:bg-shalom-deep/95">
                  <tr>
                    <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">Produto</th>
                    <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">Categoria</th>
                    <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">Codigo</th>
                    <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">Sistema</th>
                    <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">Inventario</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="border-b border-line/70 px-3 py-4 dark:border-shalom-gold/10" colSpan={5}>Carregando produtos...</td>
                    </tr>
                  ) : filteredProducts.map((product) => (
                    <tr key={product.id} className="odd:bg-white/60 even:bg-shalom-mist/40 dark:odd:bg-white/5 dark:even:bg-white/[0.025]">
                      <td className="border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">
                        <p className="font-semibold">{product.name}</p>
                        <p className="mission-muted text-xs">{product.supplier || '-'}</p>
                      </td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{product.category}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 font-mono text-xs dark:border-shalom-gold/10">{product.internal_code}</td>
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{formatQuantityWithUnit(product.stock_quantity, product.unit)}</td>
                      <td className="border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.001"
                          className="mission-input w-32 px-3 py-2"
                          value={quantities[product.id] ?? ''}
                          onChange={(event) => updateQuantity(product.id, event.target.value)}
                          aria-label={`Quantidade fisica de ${product.name}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-xl bg-shalom-mist/70 px-3 py-2 dark:bg-white/10">
                  <span className="mission-muted block text-xs">Produtos</span>
                  <strong>{decimal.format(products.length)}</strong>
                </div>
                <div className="rounded-xl bg-shalom-mist/70 px-3 py-2 dark:bg-white/10">
                  <span className="mission-muted block text-xs">Filtrados</span>
                  <strong>{decimal.format(filteredProducts.length)}</strong>
                </div>
                <div className="rounded-xl bg-shalom-mist/70 px-3 py-2 dark:bg-white/10">
                  <span className="mission-muted block text-xs">Informados</span>
                  <strong>{decimal.format(filledCount)}</strong>
                </div>
              </div>
              <button type="submit" className="mission-btn mission-btn-primary flex items-center justify-center gap-2 px-4 py-3 font-semibold">
                <FileText size={17} />
                Gerar relatorio
              </button>
            </div>
          </section>
        </form>

        <aside className="mission-panel min-w-0 p-4">
          <div className="mb-4 flex items-center gap-2">
            <History size={20} />
            <h2 className="font-display text-lg font-semibold">Ultimos inventarios</h2>
          </div>
          <div className="max-h-80 divide-y divide-line/70 overflow-y-auto scrollbar-thin dark:divide-shalom-gold/10 xl:max-h-[36rem]">
            {history.length ? history.map((inventory) => (
              <button
                key={inventory.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-shalom-orange dark:hover:text-shalom-gold"
                onClick={() => loadInventory(inventory.id)}
              >
                <span>
                  <span className="block font-semibold">{inventory.event_name}</span>
                  <span className="mission-muted text-sm">{formatDateTime(inventory.created_at)}</span>
                </span>
                <span className="rounded-xl bg-shalom-mist/70 px-2.5 py-1 text-sm font-semibold dark:bg-white/10">
                  {decimal.format(inventory.inventoried_items)}
                </span>
              </button>
            )) : (
              <p className="mission-muted text-sm">Sem inventarios registrados.</p>
            )}
          </div>
        </aside>
      </section>

      {activeReport ? (
        <section className="mission-panel min-w-0 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                {savedInventory ? <CheckCircle2 size={21} /> : <FileText size={21} />}
                <h2 className="font-display text-lg font-semibold">Relatorio de consumo</h2>
              </div>
              <p className="mission-muted mt-1 text-sm">
                {activeReport.event_name} - {activeReport.event_date}
                {savedInventory?.id ? ` - #${savedInventory.id}` : ''}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-shalom-mist/70 px-3 py-2 dark:bg-white/10">
                <span className="mission-muted block text-xs">Inventariados</span>
                <strong>{decimal.format(activeReport.totals?.inventoried_items || reportItems.length)}</strong>
              </div>
              <div className="rounded-xl bg-shalom-mist/70 px-3 py-2 dark:bg-white/10">
                <span className="mission-muted block text-xs">Consumidos</span>
                <strong>{decimal.format(activeReport.totals?.consumed_items || 0)}</strong>
              </div>
              <div className="rounded-xl bg-shalom-mist/70 px-3 py-2 dark:bg-white/10">
                <span className="mission-muted block text-xs">Ajustados</span>
                <strong>{decimal.format(activeReport.totals?.adjusted_items || 0)}</strong>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3 lg:hidden">
            {reportItems.map((item) => (
              <article key={`${item.product_id}-${item.internal_code}`} className="mission-card min-w-0 p-3">
                <div>
                  <p className="break-words font-semibold">{item.product_name}</p>
                  <p className="mission-muted text-xs">{item.category} - {item.internal_code}</p>
                </div>
                <dl className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-sm min-[380px]:grid-cols-2">
                  <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                    <dt className="mission-muted text-xs">Sistema</dt>
                    <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.quantity_before, item.unit)}</dd>
                  </div>
                  <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                    <dt className="mission-muted text-xs">Inventario</dt>
                    <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.physical_quantity, item.unit)}</dd>
                  </div>
                  <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                    <dt className="mission-muted text-xs">Diferenca</dt>
                    <dd className={`mt-1 font-semibold ${item.difference > 0 ? 'text-shalom-wine dark:text-rose-100' : item.difference < 0 ? 'text-shalom-blue dark:text-shalom-gold' : ''}`}>
                      {formatSignedQuantity(item.difference, item.unit)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                    <dt className="mission-muted text-xs">Consumido</dt>
                    <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.consumed_quantity, item.unit)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <div className="mt-4 hidden min-w-0 overflow-x-auto rounded-2xl border border-line/80 scrollbar-thin dark:border-shalom-gold/10 lg:block">
            <table className="min-w-[980px] w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-shalom-cream/95 dark:bg-shalom-deep/95">
                <tr>
                  <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">Produto</th>
                  <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">Categoria</th>
                  <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">Sistema</th>
                  <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">Inventario</th>
                  <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">Diferenca</th>
                  <th className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">Consumido</th>
                </tr>
              </thead>
              <tbody>
                {reportItems.map((item) => (
                  <tr key={`${item.product_id}-${item.internal_code}`} className="odd:bg-white/60 even:bg-shalom-mist/40 dark:odd:bg-white/5 dark:even:bg-white/[0.025]">
                    <td className="border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">
                      <p className="font-semibold">{item.product_name}</p>
                      <p className="mission-muted font-mono text-xs">{item.internal_code}</p>
                    </td>
                    <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{item.category}</td>
                    <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{formatQuantityWithUnit(item.quantity_before, item.unit)}</td>
                    <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{formatQuantityWithUnit(item.physical_quantity, item.unit)}</td>
                    <td className={`whitespace-nowrap border-b border-line/70 px-3 py-2 font-semibold dark:border-shalom-gold/10 ${item.difference > 0 ? 'text-shalom-wine dark:text-rose-100' : item.difference < 0 ? 'text-shalom-blue dark:text-shalom-gold' : ''}`}>
                      {formatSignedQuantity(item.difference, item.unit)}
                    </td>
                    <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 font-semibold dark:border-shalom-gold/10">{formatQuantityWithUnit(item.consumed_quantity, item.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!savedInventory ? (
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="flex items-start gap-3 text-sm font-medium">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-shalom-orange" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                <span>Confirmo a atualizacao do estoque deste inventario.</span>
              </label>
              <button type="button" className="mission-btn mission-btn-gold flex items-center justify-center gap-2 px-4 py-3 font-semibold" disabled={!confirmed || saving} onClick={confirmInventory}>
                <Save size={17} />
                {saving ? 'Confirmando...' : 'Confirmar e atualizar estoque'}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {conflictDetails.length ? (
        <section className="mission-panel min-w-0 p-4 text-shalom-wine dark:text-rose-100">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={20} />
            <h2 className="font-display text-lg font-semibold">Estoque alterado</h2>
          </div>
          <div className="divide-y divide-line/70 dark:divide-shalom-gold/10">
            {conflictDetails.map((item) => (
              <div key={item.product_id} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="font-semibold">{item.product_name}</span>
                <span>Sistema: {decimal.format(item.current_stock_quantity)} | Relatorio: {decimal.format(item.expected_stock_quantity)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {message ? <p className="rounded-2xl bg-shalom-cream/70 px-4 py-3 text-sm text-shalom-deep dark:bg-white/10 dark:text-shalom-gold">{message}</p> : null}
    </div>
  )
}
