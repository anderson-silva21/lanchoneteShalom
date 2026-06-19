import { Save, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../services/api'

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

export function SpreadsheetView({ refreshKey, onChanged, user }) {
  const [sheets, setSheets] = useState([])
  const [activeSheet, setActiveSheet] = useState('produtos')
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [paymentEditingRows, setPaymentEditingRows] = useState({})
  const [saleToDelete, setSaleToDelete] = useState(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletingSale, setDeletingSale] = useState(false)
  const canEditNotes = ['admin', 'finance'].includes(user?.role)
  const canEditProducts = ['admin', 'manager', 'finance'].includes(user?.role)
  const canConfirmPayments = ['admin', 'manager', 'cashier', 'finance'].includes(user?.role)
  const canDeleteSales = user?.role === 'admin'

  useEffect(() => {
    api.sheets().then(setSheets).catch((err) => setMessage(err.message))
  }, [])

  useEffect(() => {
    api.sheet(activeSheet).then(setRows).catch((err) => setMessage(err.message))
    setPaymentEditingRows({})
    setSaleToDelete(null)
    setDeleteConfirmation('')
  }, [activeSheet, refreshKey])

  const columns = rows[0] ? Object.keys(rows[0]) : []
  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, query])

  function getRowId(row) {
    return activeSheet === 'vendas' ? row.venda_id : row.id
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
    return (
      (activeSheet === 'produtos' && canEditProducts)
      || (activeSheet === 'vendas' && (canConfirmPayments || canDeleteSales))
      || (activeSheet === 'movimentacoes' && canEditNotes)
    )
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
    } catch (err) {
      setMessage(err.message)
    } finally {
      setDeletingSale(false)
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

  return (
    <div className="mission-panel p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Planilha central</h2>
          <p className="mission-muted text-sm">{filteredRows.length} linhas</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-shalom-orange/70" size={16} />
            <input className="mission-input w-full py-2 pl-9 pr-3 sm:w-64" placeholder="Filtrar" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {sheets.map((sheet) => (
              <button
                key={sheet.key}
                className={`mission-btn px-3 py-2 text-sm font-medium ${
                  activeSheet === sheet.key
                    ? 'mission-btn-primary'
                    : 'border border-shalom-gold/30 bg-white/70 text-shalom-deep dark:border-shalom-gold/10 dark:bg-white/10 dark:text-slate-200'
                }`}
                onClick={() => setActiveSheet(sheet.key)}
              >
                {sheet.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 max-h-[68vh] overflow-auto rounded-2xl border border-line/80 scrollbar-thin dark:border-shalom-gold/10">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-shalom-cream/95 backdrop-blur dark:bg-shalom-deep/95">
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-shalom-blue/75 dark:border-shalom-gold/10 dark:text-shalom-gold/80">{column}</th>
              ))}
              {hasActionColumn() ? <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10"></th> : null}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, rowIndex) => (
              <tr key={getRowId(row) || rowIndex} className="odd:bg-white/60 even:bg-shalom-mist/40 dark:odd:bg-white/5 dark:even:bg-white/[0.025]">
                {columns.map((column) => {
                  const editable = canEditProducts && activeSheet === 'produtos' && !['id', 'status_estoque', 'status_validade', 'atualizado_em'].includes(column)
                  const canConfirmPayment = canConfirmPayments && isPendingSale(row) && column === 'pagamento'
                  const canUpdatePaymentStatus = canConfirmPayments && isPendingSale(row) && column === 'status_pagamento'
                  const canEditObservation = canEditNotes && ['vendas', 'movimentacoes'].includes(activeSheet) && column === 'observacoes'
                  return (
                    <td key={column} className="whitespace-nowrap border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">
                      {editable ? (
                        <input className="min-w-24 rounded-lg border border-transparent bg-transparent px-2 py-1 focus:border-shalom-gold/60" value={row[column] ?? ''} onChange={(event) => updateCell(getRowId(row), column, event.target.value)} />
                      ) : canEditObservation ? (
                        <input className="min-w-72 rounded-lg border border-transparent bg-transparent px-2 py-1 focus:border-shalom-gold/60" value={row[column] ?? ''} onChange={(event) => updateCell(getRowId(row), column, event.target.value)} />
                      ) : canConfirmPayment ? (
                        <select className="mission-input min-w-40 px-2 py-1" value={row[column] || ''} onChange={(event) => updateCell(getRowId(row), column, event.target.value)}>
                          <option value="pagamento_pendente" disabled>Pagamento pendente</option>
                          {confirmedPaymentMethods.map((method) => (
                            <option key={method} value={method}>{getPaymentLabel(method)}</option>
                          ))}
                        </select>
                      ) : canUpdatePaymentStatus ? (
                        <select className="mission-input min-w-32 px-2 py-1" value={row[column] || 'pendente'} onChange={(event) => updateCell(getRowId(row), column, event.target.value)}>
                          <option value="pendente">Pendente</option>
                          <option value="pago">Pago</option>
                        </select>
                      ) : (
                        column === 'pagamento'
                          ? getPaymentLabel(row[column])
                          : column === 'status_pagamento'
                            ? getPaymentStatusLabel(row[column])
                            : String(row[column] ?? '')
                      )}
                    </td>
                  )
                })}
                {activeSheet === 'produtos' && canEditProducts ? (
                  <td className="border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">
                    <button className="mission-btn border border-line/80 p-2 hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10" onClick={() => saveRow(row)} title="Salvar linha">
                      <Save size={16} />
                    </button>
                  </td>
                ) : null}
                {activeSheet === 'vendas' && (canConfirmPayments || canDeleteSales) ? (
                  <td className="border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">
                    <div className="flex items-center gap-2">
                      {canConfirmPayments && isPendingSale(row) ? (
                        <button className="mission-btn border border-line/80 p-2 hover:bg-shalom-cream/70 disabled:cursor-not-allowed disabled:opacity-45 dark:border-shalom-gold/10 dark:hover:bg-white/10" onClick={() => saveRow(row)} title={row.status_pagamento === 'pago' && row.pagamento !== 'pagamento_pendente' ? 'Confirmar pagamento' : canEditNotes ? 'Salvar observacao' : 'Marque como pago e escolha o metodo'} disabled={!canEditNotes && (row.status_pagamento !== 'pago' || row.pagamento === 'pagamento_pendente')}>
                          <Save size={16} />
                        </button>
                      ) : canEditNotes ? (
                        <button className="mission-btn border border-line/80 p-2 hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10" onClick={() => saveRow(row)} title="Salvar observacao">
                          <Save size={16} />
                        </button>
                      ) : null}
                      {canDeleteSales ? (
                        <button className="mission-btn border border-shalom-wine/35 p-2 text-shalom-wine hover:bg-shalom-wine/10 dark:border-rose-200/20 dark:text-rose-100 dark:hover:bg-rose-400/10" onClick={() => openDeleteSale(row)} title="Excluir venda">
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
                {activeSheet === 'movimentacoes' && canEditNotes ? (
                  <td className="border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">
                    <button className="mission-btn border border-line/80 p-2 hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10" onClick={() => saveRow(row)} title="Salvar observacao">
                      <Save size={16} />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message ? <p className="mt-4 rounded-2xl bg-shalom-cream/70 px-4 py-3 text-sm text-shalom-deep dark:bg-white/10 dark:text-shalom-gold">{message}</p> : null}

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
    </div>
  )
}
