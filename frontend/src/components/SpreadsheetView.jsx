import { ChevronDown, ChevronRight, Download, Filter, Save, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { decimal, formatDateTime, money } from '../utils/formatters'

const paymentLabels = {
  pix: 'Pix',
  cartao: 'Cartao',
  dinheiro: 'Dinheiro',
  pagamento_pendente: 'Pagamento pendente'
}

const confirmedPaymentMethods = ['pix', 'cartao', 'dinheiro']

const paymentStatusLabels = {
  pendente: 'Pendente',
  pago: 'Pago'
}

function getPaymentLabel(value) {
  return paymentLabels[value] || value
}

function getPaymentStatusLabel(value) {
  return paymentStatusLabels[value] || value
}

function DeleteSaleModal({ sale, confirmation, deleting, onConfirmationChange, onClose, onConfirm }) {
  const expectedConfirmation = `EXCLUIR ${sale.venda_id}`

  return createPortal(
    <div className="dashboard-modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dashboard-modal-panel mission-panel text-ink shadow-blue dark:text-slate-50" role="dialog" aria-modal="true" aria-labelledby="delete-sale-title">
        <div className="flex items-start justify-between gap-3 border-b border-line/80 p-4 dark:border-shalom-gold/10">
          <div>
            <h2 id="delete-sale-title" className="font-display text-lg font-semibold text-shalom-wine dark:text-rose-100">Excluir venda #{sale.venda_id}</h2>
            <p className="mission-muted mt-1 text-sm">A venda sera removida do faturamento e o estoque consumido sera estornado.</p>
          </div>
          <button type="button" className="mission-btn border border-line/80 bg-white/70 p-2 dark:border-shalom-gold/10 dark:bg-white/10" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form className="dashboard-modal-body scrollbar-thin space-y-4 p-4" onSubmit={onConfirm}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
              <dt className="mission-muted">Data</dt>
              <dd className="mt-1 font-semibold">{sale.data_hora || '-'}</dd>
            </div>
            <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
              <dt className="mission-muted">Faturamento</dt>
              <dd className="mt-1 font-semibold">R$ {Number(sale.faturamento || 0).toFixed(2).replace('.', ',')}</dd>
            </div>
            <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
              <dt className="mission-muted">Pagamento</dt>
              <dd className="mt-1 font-semibold">{getPaymentLabel(sale.pagamento)}</dd>
            </div>
            <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
              <dt className="mission-muted">Operador</dt>
              <dd className="mt-1 font-semibold">{sale.operador || '-'}</dd>
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
            {deleting ? 'Excluindo...' : 'Excluir venda'}
          </button>
        </form>
      </section>
    </div>,
    document.body
  )
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
              <dd className="mt-1 font-semibold">{product.produto || '-'}</dd>
            </div>
            <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
              <dt className="mission-muted">Codigo</dt>
              <dd className="mt-1 font-semibold">{product.codigo || '-'}</dd>
            </div>
            <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
              <dt className="mission-muted">Categoria</dt>
              <dd className="mt-1 font-semibold">{product.categoria || '-'}</dd>
            </div>
            <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
              <dt className="mission-muted">Estoque</dt>
              <dd className="mt-1 font-semibold">{product.estoque ?? 0} {product.unidade || ''}</dd>
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

export function SpreadsheetView({ refreshKey, onChanged, user }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [sheets, setSheets] = useState([])
  const [activeSheet, setActiveSheet] = useState('itens_vendidos')
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [filtersBySheet, setFiltersBySheet] = useState({})
  const [filterDraft, setFilterDraft] = useState({})
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches)
  const [message, setMessage] = useState('')
  const [paymentEditingRows, setPaymentEditingRows] = useState({})
  const [saleToDelete, setSaleToDelete] = useState(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletingSale, setDeletingSale] = useState(false)
  const [productToDelete, setProductToDelete] = useState(null)
  const [productDeleteConfirmation, setProductDeleteConfirmation] = useState('')
  const [deletingProduct, setDeletingProduct] = useState(false)
  const canEditNotes = ['admin', 'finance'].includes(user?.role)
  const canEditProducts = ['admin', 'manager', 'finance'].includes(user?.role)
  const canDeleteProducts = user?.role === 'admin'
  const canConfirmPayments = ['admin', 'manager', 'cashier', 'finance'].includes(user?.role)
  const canDeleteSales = user?.role === 'admin'
  const canViewCosts = ['admin', 'manager', 'finance'].includes(user?.role)
  const filterRouteMatch = location.pathname.match(/^\/planilha\/filtros\/([^/]+)$/)
  const editRouteMatch = location.pathname.match(/^\/planilha\/editar\/([^/]+)\/([^/]+)$/)
  const editRouteSheet = editRouteMatch?.[1] || ''
  const editRouteId = editRouteMatch?.[2] || ''
  const isFilterRoute = Boolean(filterRouteMatch)
  const isEditRoute = Boolean(editRouteMatch)

  useEffect(() => {
    api.sheets().then(setSheets).catch((err) => setMessage(err.message))
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const updateViewport = (event) => setIsDesktop(event.matches)
    media.addEventListener('change', updateViewport)
    return () => media.removeEventListener('change', updateViewport)
  }, [])

  useEffect(() => {
    api.sheet(activeSheet).then(setRows).catch((err) => setMessage(err.message))
    setPaymentEditingRows({})
    setSaleToDelete(null)
    setDeleteConfirmation('')
    setProductToDelete(null)
    setProductDeleteConfirmation('')
    setPage(1)
  }, [activeSheet, refreshKey])

  useEffect(() => {
    if (!filterRouteMatch?.[1]) return
    setActiveSheet(filterRouteMatch[1])
    setFilterDraft({ ...(filtersBySheet[filterRouteMatch[1]] || {}) })
    // The draft is intentionally captured when the dedicated page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFilterRoute])

  useEffect(() => {
    if (!editRouteSheet) return
    setActiveSheet(editRouteSheet)
  }, [editRouteSheet])

  const columns = useMemo(() => rows[0] ? Object.keys(rows[0]) : [], [rows])
  const activeFilters = useMemo(() => filtersBySheet[activeSheet] || {}, [activeSheet, filtersBySheet])
  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase()
    const dateColumn = {
      lotes: 'criado_em',
      vendas: 'data_hora',
      itens_vendidos: 'data_hora',
      movimentacoes: 'data_hora',
      inventarios_evento: 'registrado_em'
    }[activeSheet]
    return rows.filter((row) => {
      if (term && !Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(term))) return false
      if (dateColumn && activeFilters.start_date && String(row[dateColumn] || '').slice(0, 10) < activeFilters.start_date) return false
      if (dateColumn && activeFilters.end_date && String(row[dateColumn] || '').slice(0, 10) > activeFilters.end_date) return false
      return Object.entries(activeFilters).every(([column, value]) => ['start_date', 'end_date'].includes(column) || !value || String(row[column] ?? '') === String(value))
    })
  }, [activeFilters, activeSheet, query, rows])
  const totalPages = Math.max(Math.ceil(filteredRows.length / pageSize), 1)
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)
  const filterCount = Object.values(activeFilters).filter(Boolean).length
  const orderedSheets = useMemo(() => [...sheets].sort((a, b) => {
    const priority = { itens_vendidos: 0, produtos: 1, vendas: 2 }
    return (priority[a.key] ?? 10) - (priority[b.key] ?? 10)
  }), [sheets])
  const filterFields = useMemo(() => {
    const unique = (column) => [...new Set(rows.map((row) => row[column]).filter((value) => value !== null && value !== undefined && value !== ''))]
      .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'))
      .map((value) => ({ value: String(value), label: column === 'pagamento' ? getPaymentLabel(value) : column === 'status_pagamento' ? getPaymentStatusLabel(value) : String(value) }))
    const dateFields = ['lotes', 'vendas', 'itens_vendidos', 'movimentacoes', 'inventarios_evento'].includes(activeSheet)
      ? [{ key: 'start_date', label: 'Data inicial', type: 'date' }, { key: 'end_date', label: 'Data final', type: 'date' }]
      : []
    const fields = {
      produtos: [['categoria', 'Categoria'], ['status_estoque', 'Status do estoque'], ['status_validade', 'Status da validade']],
      lotes: [['categoria', 'Categoria'], ['status_validade', 'Status da validade']],
      vendas: [['operador', 'Operador / caixa'], ['pagamento', 'Forma de pagamento'], ['status_pagamento', 'Status do pagamento']],
      itens_vendidos: [['operador', 'Operador / caixa'], ['pagamento', 'Forma de pagamento'], ['status_pagamento', 'Status do pagamento']],
      movimentacoes: [['tipo', 'Tipo de movimentacao']],
      inventarios_evento: [['categoria', 'Categoria']],
      indicadores: []
    }[activeSheet] || []
    return [...dateFields, ...fields.map(([key, label]) => ({ key, label, type: 'select', options: unique(key) }))]
  }, [activeSheet, rows])
  const summaryItems = useMemo(() => {
    if (activeSheet === 'itens_vendidos') return [
      ['Itens', decimal.format(filteredRows.reduce((total, row) => total + Number(row.quantidade || 0), 0))],
      ['Faturamento', money.format(filteredRows.reduce((total, row) => total + Number(row.total || 0), 0))],
      ['Lucro', money.format(filteredRows.reduce((total, row) => total + Number(row.lucro || 0), 0))]
    ]
    if (activeSheet === 'produtos') return [
      ['Produtos', decimal.format(filteredRows.length)],
      ['Unidades', decimal.format(filteredRows.reduce((total, row) => total + Number(row.estoque || 0), 0))],
      ['Estoque baixo', decimal.format(filteredRows.filter((row) => row.status_estoque !== 'normal').length)]
    ]
    return []
  }, [activeSheet, filteredRows])
  const desktopColumns = useMemo(() => {
    const preferred = {
      itens_vendidos: ['data_hora', 'venda_id', 'item', 'quantidade', 'preco_unitario', 'total', ...(canViewCosts ? ['custo_unitario', 'lucro'] : []), 'pagamento', 'status_pagamento', 'operador'],
      produtos: ['codigo', 'produto', 'categoria', 'estoque', ...(canViewCosts ? ['custo'] : []), 'preco', 'status_estoque', 'validade'],
      vendas: ['data_hora', 'venda_id', 'operador', 'cliente', 'pagamento', 'status_pagamento', 'faturamento', ...(canViewCosts ? ['lucro_estimado'] : []), 'observacoes'],
      lotes: ['lote_id', 'produto', 'categoria', 'quantidade', 'validade', 'dias_para_vencer', 'status_validade'],
      movimentacoes: ['data_hora', 'produto', 'tipo', 'quantidade', 'antes', 'depois', 'validade', 'observacoes'],
      inventarios_evento: ['inventario_id', 'evento', 'data_evento', 'produto', 'quantidade_sistema', 'quantidade_inventario', 'diferenca', 'ajuste_estoque'],
      indicadores: ['metrica', 'valor']
    }[activeSheet] || columns
    return preferred.filter((column) => columns.includes(column))
  }, [activeSheet, canViewCosts, columns])
  const editRow = isEditRoute ? rows.find((row) => String(getRowId(row)) === decodeURIComponent(editRouteId)) : null

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  function getRowId(row) {
    if (activeSheet === 'vendas') return row.venda_id
    if (activeSheet === 'lotes') return row.lote_id
    if (activeSheet === 'inventarios_evento') return `${row.inventario_id}-${row.codigo_produto || row.produto}`
    if (activeSheet === 'indicadores') return row.metrica
    return row.id
  }

  function updateCell(rowId, column, value) {
    setRows((current) => current.map((row) => getRowId(row) === rowId ? { ...row, [column]: value } : row))
    if (activeSheet === 'vendas' && ['pagamento', 'status_pagamento'].includes(column)) {
      setPaymentEditingRows((current) => ({ ...current, [rowId]: true }))
    }
  }

  function isPendingSale(row) {
    return activeSheet === 'vendas' && !row.pago_em && (row.status_pagamento === 'pendente' || row.pagamento === 'pagamento_pendente' || paymentEditingRows[getRowId(row)])
  }

  function hasActionColumn() {
    return true
  }

  function openDeleteSale(row) {
    setMessage('')
    setSaleToDelete(row)
    setDeleteConfirmation('')
  }

  async function deleteSelectedSale(event) {
    event.preventDefault()
    if (!saleToDelete) return

    const confirmation = `EXCLUIR ${saleToDelete.venda_id}`
    if (deleteConfirmation !== confirmation) {
      setMessage(`Digite ${confirmation} para confirmar.`)
      return
    }

    setMessage('')
    setDeletingSale(true)
    try {
      const result = await api.deleteSheetSale(saleToDelete.venda_id, { confirmation: deleteConfirmation })
      setRows((current) => current.filter((item) => item.venda_id !== saleToDelete.venda_id))
      setPaymentEditingRows((current) => {
        const next = { ...current }
        delete next[saleToDelete.venda_id]
        return next
      })
      setSaleToDelete(null)
      setDeleteConfirmation('')
      onChanged()
      setMessage(result.message || `Venda #${saleToDelete.venda_id} excluida.`)
      if (isEditRoute) closeEditor()
    } catch (err) {
      setMessage(err.message)
    } finally {
      setDeletingSale(false)
    }
  }

  function openDeleteProduct(row) {
    setMessage('')
    setProductToDelete(row)
    setProductDeleteConfirmation('')
  }

  async function deleteSelectedProduct(event) {
    event.preventDefault()
    if (!productToDelete) return

    const confirmation = `EXCLUIR PRODUTO ${productToDelete.id}`
    if (productDeleteConfirmation !== confirmation) {
      setMessage(`Digite ${confirmation} para confirmar.`)
      return
    }

    const deletedProduct = productToDelete
    setMessage('')
    setDeletingProduct(true)
    try {
      const result = await api.deleteProduct(deletedProduct.id, { confirmation: productDeleteConfirmation })
      setRows((current) => current.filter((item) => item.id !== deletedProduct.id))
      setProductToDelete(null)
      setProductDeleteConfirmation('')
      onChanged()
      setMessage(result.message || `Produto ${deletedProduct.produto} excluido.`)
      if (isEditRoute) closeEditor()
    } catch (err) {
      setMessage(err.message)
    } finally {
      setDeletingProduct(false)
    }
  }

  async function saveRow(row) {
    setMessage('')
    try {
      if (activeSheet === 'produtos') {
        await api.updateSheetProduct(row.id, row)
        onChanged()
        setMessage('Linha salva.')
        return
      }

      if (activeSheet === 'vendas') {
        const payload = {}
        const shouldConfirmPayment = isPendingSale(row) && row.status_pagamento === 'pago' && row.pagamento !== 'pagamento_pendente'

        if (canEditNotes) payload.observacoes = row.observacoes ?? ''
        if (shouldConfirmPayment) {
          payload.pagamento = row.pagamento
          payload.status_pagamento = row.status_pagamento
        }

        if (!Object.keys(payload).length) {
          setMessage('Nenhuma alteracao para salvar.')
          return
        }

        const updated = await api.updateSheetSale(row.venda_id, payload)
        setRows((current) => current.map((item) => item.venda_id === updated.venda_id ? updated : item))
        setPaymentEditingRows((current) => {
          const next = { ...current }
          delete next[row.venda_id]
          return next
        })
        onChanged()
        setMessage(shouldConfirmPayment ? 'Pagamento confirmado.' : 'Observacao atualizada.')
        return
      }

      if (activeSheet === 'movimentacoes') {
        if (!canEditNotes) {
          setMessage('Somente administradores e financeiro podem alterar observacoes.')
          return
        }

        const updated = await api.updateSheetMovement(row.id, { observacoes: row.observacoes ?? '' })
        setRows((current) => current.map((item) => item.id === updated.id ? updated : item))
        setMessage('Observacao atualizada.')
        return
      }

      setMessage('Somente Produtos e Vendas permitem edicao rapida.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  function selectSheet(sheet) {
    setActiveSheet(sheet)
    setQuery('')
    setExportOpen(false)
  }

  function openMobileRow(row) {
    const targetSheet = activeSheet === 'itens_vendidos' ? 'vendas' : activeSheet
    const targetId = activeSheet === 'itens_vendidos' ? row.venda_id : getRowId(row)
    if (targetId === null || targetId === undefined) return
    navigate(`/planilha/editar/${targetSheet}/${encodeURIComponent(targetId)}?from=${encodeURIComponent(activeSheet)}`)
  }

  function closeEditor() {
    const sourceSheet = new URLSearchParams(location.search).get('from')
    if (sourceSheet) setActiveSheet(sourceSheet)
    navigate('/planilha')
  }

  function openFilters() {
    setFilterDraft({ ...activeFilters })
    navigate(`/planilha/filtros/${activeSheet}`)
  }

  function applyFilters(event) {
    event.preventDefault()
    setFiltersBySheet((current) => ({ ...current, [activeSheet]: { ...filterDraft } }))
    setPage(1)
    navigate('/planilha')
  }

  function clearFilters() {
    setFiltersBySheet((current) => ({ ...current, [activeSheet]: {} }))
    setFilterDraft({})
    setPage(1)
  }

  function clearSearchAndFilters() {
    setQuery('')
    clearFilters()
  }

  async function exportSheet(format) {
    setExporting(true)
    setMessage('Gerando planilha...')
    try {
      await api.downloadSheet(activeSheet, { q: query, ...activeFilters }, format)
      setMessage('Arquivo gerado.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setExporting(false)
      setExportOpen(false)
    }
  }

  function displayValue(column, value) {
    if (column === 'pagamento') return getPaymentLabel(value)
    if (column === 'status_pagamento') return getPaymentStatusLabel(value)
    if (['data_hora', 'criado_em', 'atualizado_em', 'registrado_em', 'pago_em'].includes(column)) return value ? formatDateTime(value) : '-'
    if (['custo', 'preco', 'faturamento', 'lucro_estimado', 'preco_unitario', 'custo_unitario', 'total', 'lucro'].includes(column)) return money.format(Number(value || 0))
    return String(value ?? '')
  }

  function renderEditableValue(row, column) {
    const rowId = getRowId(row)
    const editable = canEditProducts && activeSheet === 'produtos' && !['id', 'status_estoque', 'status_validade', 'atualizado_em'].includes(column)
    const canConfirmPayment = canConfirmPayments && isPendingSale(row) && column === 'pagamento'
    const canUpdatePaymentStatus = canConfirmPayments && isPendingSale(row) && column === 'status_pagamento'
    const canEditObservation = canEditNotes && ['vendas', 'movimentacoes'].includes(activeSheet) && column === 'observacoes'

    if (editable || canEditObservation) {
      return <input className="mission-input min-w-0 w-full px-2 py-1.5" value={row[column] ?? ''} onChange={(event) => updateCell(rowId, column, event.target.value)} />
    }
    if (canConfirmPayment) {
      return <select className="mission-input w-full min-w-0 px-2 py-1.5" value={row[column] || ''} onChange={(event) => updateCell(rowId, column, event.target.value)}><option value="pagamento_pendente" disabled>Pagamento pendente</option>{confirmedPaymentMethods.map((method) => <option key={method} value={method}>{getPaymentLabel(method)}</option>)}</select>
    }
    if (canUpdatePaymentStatus) {
      return <select className="mission-input w-full min-w-0 px-2 py-1.5" value={row[column] || 'pendente'} onChange={(event) => updateCell(rowId, column, event.target.value)}><option value="pendente">Pendente</option><option value="pago">Pago</option></select>
    }
    return displayValue(column, row[column])
  }

  function rowActions(row) {
    const detailsButton = <button type="button" className="mission-btn border border-line/80 p-2 dark:border-shalom-gold/10" onClick={() => openMobileRow(row)} title="Ver detalhes" aria-label="Ver detalhes"><ChevronRight size={16} /></button>
    if (activeSheet === 'produtos' && canEditProducts) {
      return <div className="flex items-center gap-2"><button type="button" className="mission-btn border border-line/80 p-2 dark:border-shalom-gold/10" onClick={() => saveRow(row)} title="Salvar linha" aria-label="Salvar linha"><Save size={16} /></button>{detailsButton}{canDeleteProducts ? <button type="button" className="mission-btn border border-shalom-wine/35 p-2 text-shalom-wine dark:border-rose-200/20 dark:text-rose-100" onClick={() => openDeleteProduct(row)} title="Excluir produto" aria-label="Excluir produto"><Trash2 size={16} /></button> : null}</div>
    }
    if (activeSheet === 'vendas' && (canConfirmPayments || canDeleteSales)) {
      return <div className="flex items-center gap-2">{canConfirmPayments && isPendingSale(row) ? <button type="button" className="mission-btn border border-line/80 p-2 disabled:opacity-45 dark:border-shalom-gold/10" onClick={() => saveRow(row)} title="Salvar venda" aria-label="Salvar venda" disabled={!canEditNotes && (row.status_pagamento !== 'pago' || row.pagamento === 'pagamento_pendente')}><Save size={16} /></button> : canEditNotes ? <button type="button" className="mission-btn border border-line/80 p-2 dark:border-shalom-gold/10" onClick={() => saveRow(row)} title="Salvar observacao" aria-label="Salvar observacao"><Save size={16} /></button> : null}{detailsButton}{canDeleteSales ? <button type="button" className="mission-btn border border-shalom-wine/35 p-2 text-shalom-wine dark:border-rose-200/20 dark:text-rose-100" onClick={() => openDeleteSale(row)} title="Excluir venda" aria-label="Excluir venda"><Trash2 size={16} /></button> : null}</div>
    }
    if (activeSheet === 'movimentacoes' && canEditNotes) return <div className="flex items-center gap-2"><button type="button" className="mission-btn border border-line/80 p-2 dark:border-shalom-gold/10" onClick={() => saveRow(row)} title="Salvar observacao" aria-label="Salvar observacao"><Save size={16} /></button>{detailsButton}</div>
    return detailsButton
  }

  const mobileFieldPriorities = {
    produtos: ['codigo', 'categoria', 'estoque', 'custo', 'preco', 'status_estoque'],
    lotes: ['codigo_produto', 'categoria', 'quantidade', 'validade', 'status_validade'],
    vendas: ['data_hora', 'operador', 'faturamento', 'pagamento', 'status_pagamento'],
    itens_vendidos: ['data_hora', 'quantidade', 'preco_unitario', 'total', 'lucro'],
    movimentacoes: ['data_hora', 'produto', 'tipo', 'quantidade', 'depois'],
    inventarios_evento: ['evento', 'data_evento', 'produto', 'diferenca', 'ajuste_estoque'],
    indicadores: ['metrica', 'valor']
  }

  function mobileRowTitle(row) {
    if (activeSheet === 'vendas') return `Venda #${row.venda_id}`
    if (activeSheet === 'itens_vendidos') return row.item
    if (activeSheet === 'lotes') return row.produto
    if (activeSheet === 'indicadores') return row.metrica
    return row.produto || row.evento || `Registro #${getRowId(row)}`
  }

  function renderMobileRow(row, rowKey) {
    if (activeSheet === 'itens_vendidos') {
      return <article key={rowKey} className="min-w-0 py-4">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <strong className="break-words text-sm">Venda #{row.venda_id}</strong>
          <span className="mission-muted break-words text-xs">{formatDateTime(row.data_hora)}</span>
        </div>
        <h3 className="mt-3 min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere]">{row.item}</h3>
        <div className="mt-2 grid min-w-0 grid-cols-1 gap-1 text-sm min-[380px]:grid-cols-[minmax(0,1fr)_auto] min-[380px]:items-baseline min-[380px]:gap-3">
          <span className="min-w-0 break-words">{decimal.format(row.quantidade)} x {money.format(row.preco_unitario)}</span>
          <strong className="min-w-0 break-words text-shalom-blue dark:text-shalom-gold">Total {money.format(row.total)}</strong>
        </div>
        <p className="mission-muted mt-2 min-w-0 break-words text-xs">{getPaymentLabel(row.pagamento)} · {getPaymentStatusLabel(row.status_pagamento)} · {row.operador || 'Sem operador'}</p>
        {canViewCosts ? <p className="mission-muted mt-1 min-w-0 break-words text-xs">Custo {money.format(Number(row.custo_unitario || 0) * Number(row.quantidade || 0))} · Lucro {money.format(row.lucro)}</p> : null}
        <button type="button" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-shalom-blue dark:text-shalom-gold" onClick={() => openMobileRow(row)}>Ver detalhes <ChevronRight size={15} /></button>
      </article>
    }

    if (activeSheet === 'produtos') {
      return <article key={rowKey} className="min-w-0 py-4">
        <h3 className="min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere]">{row.produto}</h3>
        <p className="mission-muted mt-1 min-w-0 break-words text-xs">{row.categoria || 'Sem categoria'}</p>
        <dl className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-sm min-[360px]:grid-cols-3">
          <div className="min-w-0"><dt className="mission-muted text-xs">Estoque</dt><dd className="break-words font-semibold">{decimal.format(row.estoque)}</dd></div>
          <div className="min-w-0"><dt className="mission-muted text-xs">Venda</dt><dd className="break-words font-semibold">{money.format(row.preco)}</dd></div>
          {canViewCosts ? <div className="min-w-0"><dt className="mission-muted text-xs">Custo</dt><dd className="break-words font-semibold">{money.format(row.custo)}</dd></div> : null}
        </dl>
        <button type="button" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-shalom-blue dark:text-shalom-gold" onClick={() => openMobileRow(row)}>Ver detalhes <ChevronRight size={15} /></button>
      </article>
    }

    const priorityColumns = (mobileFieldPriorities[activeSheet] || columns.slice(0, 5)).filter((column) => columns.includes(column))
    return <article key={rowKey} className="min-w-0 py-4">
      <strong className="block min-w-0 break-words text-sm [overflow-wrap:anywhere]">{mobileRowTitle(row)}</strong>
      <dl className="mt-3 grid min-w-0 grid-cols-1 gap-2 text-xs min-[380px]:grid-cols-2">{priorityColumns.map((column) => <div key={column} className="min-w-0"><dt className="mission-muted break-words">{column.replaceAll('_', ' ')}</dt><dd className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">{displayValue(column, row[column])}</dd></div>)}</dl>
      <button type="button" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-shalom-blue dark:text-shalom-gold" onClick={() => openMobileRow(row)}>Ver detalhes <ChevronRight size={15} /></button>
    </article>
  }

  function columnLabel(column) {
    return {
      data_hora: 'Data', venda_id: 'Venda', item: 'Produto', produto: 'Produto', quantidade: 'Qtd.', preco_unitario: 'Preco', custo_unitario: 'Custo', total: 'Total', lucro: 'Lucro', pagamento: 'Pagamento', status_pagamento: 'Status', operador: 'Operador', codigo: 'Codigo', categoria: 'Categoria', estoque: 'Estoque', custo: 'Custo', preco: 'Venda', status_estoque: 'Status', validade: 'Validade', faturamento: 'Total', lucro_estimado: 'Lucro', observacoes: 'Observacoes', tipo: 'Tipo', antes: 'Antes', depois: 'Depois', evento: 'Evento', data_evento: 'Data', quantidade_sistema: 'Sistema', quantidade_inventario: 'Inventario', diferenca: 'Diferenca', ajuste_estoque: 'Ajuste', metrica: 'Indicador', valor: 'Valor', lote_id: 'Lote', dias_para_vencer: 'Dias', status_validade: 'Status'
    }[column] || column.replaceAll('_', ' ')
  }

  function desktopColumnClass(column) {
    return ['custo_unitario', 'lucro', 'operador', 'validade', 'observacoes', 'antes', 'depois', 'data_evento', 'ajuste_estoque'].includes(column) ? 'hidden 2xl:table-cell' : ''
  }

  function sheetLabel(sheet) {
    if (sheet.key === 'itens_vendidos') return 'Vendas'
    if (sheet.key === 'produtos') return 'Estoque'
    if (sheet.key === 'vendas') return 'Pagamentos'
    return sheet.label
  }

  if (isEditRoute) {
    const canSaveEditor = (activeSheet === 'produtos' && canEditProducts)
      || (activeSheet === 'vendas' && (canEditNotes || (canConfirmPayments && editRow && isPendingSale(editRow))))
      || (activeSheet === 'movimentacoes' && canEditNotes)
    return (
      <div className="mx-auto w-full min-w-0 max-w-3xl space-y-5">
        {message ? <p className="min-w-0 break-words border-l-2 border-shalom-orange px-3 py-2 text-sm dark:border-shalom-gold" aria-live="polite">{message}</p> : null}
        {editRow ? <>
          <div className="border-b border-line/80 pb-4 dark:border-shalom-gold/10">
            <h2 className="min-w-0 break-words font-display text-lg font-semibold">{mobileRowTitle(editRow)}</h2>
            <p className="mission-muted mt-1 text-sm">{sheetLabel(sheets.find((sheet) => sheet.key === activeSheet) || { key: activeSheet, label: activeSheet })}</p>
          </div>
          <form className="grid min-w-0 gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); saveRow(editRow) }}>
            {columns.filter((column) => canViewCosts || !['custo', 'custo_unitario', 'lucro', 'lucro_estimado'].includes(column)).map((column) => (
              <label key={column} className={`grid min-w-0 gap-1 text-sm font-medium ${['produto', 'item', 'observacoes'].includes(column) ? 'sm:col-span-2' : ''}`}>
                {columnLabel(column)}
                <div className="min-w-0 break-words rounded-md border border-line/70 px-3 py-2 dark:border-shalom-gold/10">{renderEditableValue(editRow, column)}</div>
              </label>
            ))}
            <div className="flex flex-col-reverse gap-2 border-t border-line/80 pt-4 dark:border-shalom-gold/10 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {activeSheet === 'produtos' && canDeleteProducts ? <button type="button" className="mission-btn inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-shalom-wine dark:text-rose-100" onClick={() => openDeleteProduct(editRow)}><Trash2 size={16} /> Excluir produto</button> : null}
                {activeSheet === 'vendas' && canDeleteSales ? <button type="button" className="mission-btn inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-shalom-wine dark:text-rose-100" onClick={() => openDeleteSale(editRow)}><Trash2 size={16} /> Excluir venda</button> : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="mission-btn border border-line/80 px-4 py-2.5 text-sm font-semibold dark:border-shalom-gold/10" onClick={closeEditor}>Cancelar</button>
                {canSaveEditor ? <button type="submit" className="mission-btn mission-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold"><Save size={16} /> Salvar</button> : <span />}
              </div>
            </div>
          </form>
        </> : <p className="mission-muted py-10 text-center text-sm">Carregando detalhes...</p>}

        {saleToDelete ? <DeleteSaleModal sale={saleToDelete} confirmation={deleteConfirmation} deleting={deletingSale} onConfirmationChange={setDeleteConfirmation} onClose={() => { if (!deletingSale) { setSaleToDelete(null); setDeleteConfirmation('') } }} onConfirm={deleteSelectedSale} /> : null}
        {productToDelete ? <DeleteProductModal product={productToDelete} confirmation={productDeleteConfirmation} deleting={deletingProduct} onConfirmationChange={setProductDeleteConfirmation} onClose={() => { if (!deletingProduct) { setProductToDelete(null); setProductDeleteConfirmation('') } }} onConfirm={deleteSelectedProduct} /> : null}
      </div>
    )
  }

  if (isFilterRoute) {
    return (
      <form className="mx-auto grid w-full min-w-0 max-w-3xl gap-6" onSubmit={applyFilters}>
        <p className="mission-muted text-sm">Refine os dados de {sheetLabel(sheets.find((sheet) => sheet.key === activeSheet) || { key: activeSheet, label: 'planilha' })}. A busca por texto continua na tela principal.</p>
        {filterFields.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {filterFields.map((field) => (
              <label key={field.key} className="grid gap-1 text-sm font-medium">
                {field.label}
                {field.type === 'date' ? (
                  <input type="date" className="mission-input w-full min-w-0 px-3 py-2.5" value={filterDraft[field.key] || ''} onChange={(event) => setFilterDraft((current) => ({ ...current, [field.key]: event.target.value }))} />
                ) : (
                  <select className="mission-input w-full min-w-0 px-3 py-2.5" value={filterDraft[field.key] || ''} onChange={(event) => setFilterDraft((current) => ({ ...current, [field.key]: event.target.value }))}>
                    <option value="">Todos</option>
                    {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                )}
              </label>
            ))}
          </div>
        ) : <p className="mission-muted py-8 text-center text-sm">Esta aba nao possui filtros adicionais.</p>}
        <div className="flex flex-col gap-3 border-t border-line/80 pt-4 dark:border-shalom-gold/10 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="mission-btn px-2 py-2 text-sm font-semibold text-shalom-blue dark:text-shalom-gold" onClick={() => setFilterDraft({})}>Limpar filtros</button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="mission-btn border border-line/80 px-4 py-2.5 text-sm font-semibold dark:border-shalom-gold/10" onClick={() => navigate('/planilha')}>Cancelar</button>
            <button type="submit" className="mission-btn mission-btn-primary px-4 py-2.5 text-sm font-semibold">Aplicar filtros</button>
          </div>
        </div>
      </form>
    )
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-full space-y-5 pb-4">
      <div className="w-full min-w-0 max-w-full border-b border-line/80 dark:border-shalom-gold/10">
        <div className="scrollbar-hidden flex w-full min-w-0 max-w-full gap-5 overflow-x-auto border-b border-line/80 dark:border-shalom-gold/10" role="tablist" aria-label="Planilhas">
          {orderedSheets.map((sheet) => (
            <button key={sheet.key} type="button" role="tab" aria-selected={activeSheet === sheet.key} className={`section-text-tab shrink-0 ${activeSheet === sheet.key ? 'section-text-tab-active' : ''}`} onClick={() => selectSheet(sheet.key)}>{sheetLabel(sheet)}</button>
          ))}
        </div>

        <div className="my-4 grid w-full min-w-0 max-w-full grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-shalom-blue/60" size={17} />
            <input className="mission-input w-full py-2.5 pl-10 pr-3" placeholder="Buscar nesta planilha" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} />
          </label>
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 lg:flex lg:w-auto lg:items-center [&>:only-child]:col-span-2">
            {filterFields.length ? <button type="button" className="mission-btn inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-line/80 px-3 py-2 text-sm font-semibold dark:border-shalom-gold/10 lg:flex-none" onClick={openFilters}><Filter size={17} />Filtros{filterCount ? ` (${filterCount})` : ''}</button> : null}
            <div className="relative flex-1 lg:flex-none">
              <button type="button" className="mission-btn inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 border border-line/80 px-2 py-2 text-sm font-semibold disabled:opacity-55 dark:border-shalom-gold/10" onClick={() => setExportOpen((open) => !open)} disabled={exporting} aria-expanded={exportOpen} aria-haspopup="menu"><Download className="shrink-0" size={17} />Exportar<ChevronDown className="shrink-0" size={15} /></button>
              {exportOpen ? <div className="absolute right-0 top-full z-20 mt-1 min-w-36 border border-line bg-white py-1 shadow-lg dark:border-shalom-gold/15 dark:bg-shalom-deep" role="menu">{['xlsx', 'csv', 'pdf'].map((format) => <button key={format} type="button" className="block w-full px-4 py-2 text-left text-sm font-semibold uppercase hover:bg-shalom-mist dark:hover:bg-white/10" onClick={() => exportSheet(format)} role="menuitem">{format}</button>)}</div> : null}
            </div>
          </div>
        </div>
        {filterCount ? <div className="mb-3 flex items-center gap-3 text-xs"><span className="font-semibold text-shalom-blue dark:text-shalom-gold">{filterCount} {filterCount === 1 ? 'filtro ativo' : 'filtros ativos'}</span><button type="button" className="font-semibold underline underline-offset-2" onClick={clearFilters}>Limpar</button></div> : null}
      </div>

      {summaryItems.length ? <section className="grid w-full min-w-0 max-w-full grid-cols-1 gap-x-4 gap-y-2 border-b border-line/80 pb-3 min-[340px]:grid-cols-2 dark:border-shalom-gold/10 sm:grid-cols-3" aria-label="Resumo da planilha">{summaryItems.map(([label, value]) => <p key={label} className="min-w-0 text-xs"><span className="mission-muted block">{label}</span><strong className="block min-w-0 break-words [overflow-wrap:anywhere]">{value}</strong></p>)}</section> : null}

      <div className="w-full min-w-0 max-w-full">
        <div className="mb-3 grid min-w-0 grid-cols-1 gap-2 min-[360px]:grid-cols-[minmax(0,1fr)_auto] min-[360px]:items-center">
          <p className="mission-muted text-sm">{filteredRows.length} {filteredRows.length === 1 ? 'linha' : 'linhas'}</p>
          <select className="mission-input w-full min-w-0 px-3 py-2 text-sm min-[360px]:w-fit" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>{[25, 50, 100, 200].map((size) => <option key={size} value={size}>{size} por pagina</option>)}</select>
        </div>

        {!isDesktop ? <div className="min-w-0 divide-y divide-line/80 border-y border-line/80 dark:divide-shalom-gold/10 dark:border-shalom-gold/10">
          {pagedRows.map((row, rowIndex) => renderMobileRow(row, `${getRowId(row) || 'row'}-${(page - 1) * pageSize + rowIndex}`))}
          {!pagedRows.length ? <div className="py-8 text-center"><p className="text-sm font-medium">{query ? `Nenhum resultado para "${query}".` : 'Nenhum registro encontrado.'}</p>{query || filterCount ? <button type="button" className="mt-2 text-sm font-semibold text-shalom-blue underline underline-offset-2 dark:text-shalom-gold" onClick={clearSearchAndFilters}>Limpar filtros</button> : null}</div> : null}
        </div> : null}

        {isDesktop ? <div className="overflow-x-auto border-y border-line/80 scrollbar-thin dark:border-shalom-gold/10">
          <table className="w-full min-w-[900px] table-auto border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-shalom-cream/95 dark:bg-shalom-deep/95"><tr>{desktopColumns.map((column) => <th key={column} className={`${desktopColumnClass(column)} whitespace-nowrap border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80`}>{columnLabel(column)}</th>)}{hasActionColumn() ? <th className="w-1 whitespace-nowrap border-b border-line px-3 py-2 text-xs font-semibold uppercase text-shalom-blue/75 dark:border-shalom-gold/10">Acoes</th> : null}</tr></thead>
            <tbody>{pagedRows.map((row, rowIndex) => <tr key={`${getRowId(row) || 'row'}-${rowIndex}`} className="transition-colors hover:bg-shalom-gold/10 dark:hover:bg-white/[0.07]">{desktopColumns.map((column) => <td key={column} className={`${desktopColumnClass(column)} max-w-72 whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10`}>{renderEditableValue(row, column)}</td>)}{hasActionColumn() ? <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">{rowActions(row)}</td> : null}</tr>)}</tbody>
          </table>
          {!pagedRows.length ? <div className="px-4 py-8 text-center"><p className="font-medium">{query ? `Nenhum resultado para "${query}".` : 'Nenhum registro encontrado.'}</p>{query || filterCount ? <button type="button" className="mt-2 text-sm font-semibold text-shalom-blue underline underline-offset-2 dark:text-shalom-gold" onClick={clearSearchAndFilters}>Limpar filtros</button> : null}</div> : null}
        </div> : null}

        <div className="mt-4 grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"><button type="button" className="mission-btn min-w-0 border border-line/80 px-2 py-2 text-sm font-semibold disabled:opacity-45 dark:border-shalom-gold/10" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><p className="mission-muted min-w-0 text-center text-xs sm:text-sm">Pagina {page} de {totalPages}</p><button type="button" className="mission-btn min-w-0 border border-line/80 px-2 py-2 text-sm font-semibold disabled:opacity-45 dark:border-shalom-gold/10" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Proxima</button></div>
      </div>

      {message ? <p className="min-w-0 break-words border-l-2 border-shalom-orange px-3 py-2 text-sm text-shalom-deep dark:border-shalom-gold dark:text-shalom-gold">{message}</p> : null}

      {saleToDelete ? (
        <DeleteSaleModal
          sale={saleToDelete}
          confirmation={deleteConfirmation}
          deleting={deletingSale}
          onConfirmationChange={setDeleteConfirmation}
          onClose={() => {
            if (deletingSale) return
            setSaleToDelete(null)
            setDeleteConfirmation('')
          }}
          onConfirm={deleteSelectedSale}
        />
      ) : null}

      {productToDelete ? (
        <DeleteProductModal
          product={productToDelete}
          confirmation={productDeleteConfirmation}
          deleting={deletingProduct}
          onConfirmationChange={setProductDeleteConfirmation}
          onClose={() => {
            if (deletingProduct) return
            setProductToDelete(null)
            setProductDeleteConfirmation('')
          }}
          onConfirm={deleteSelectedProduct}
        />
      ) : null}
    </div>
  )
}
