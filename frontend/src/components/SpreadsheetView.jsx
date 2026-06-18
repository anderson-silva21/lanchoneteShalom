import { Save, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'

const paymentLabels = {
  pix: 'Pix',
  cartao: 'Cartao',
  dinheiro: 'Dinheiro',
  delivery: 'Delivery',
  pagamento_pendente: 'Pagamento pendente'
}

const confirmedPaymentMethods = ['pix', 'cartao', 'dinheiro', 'delivery']

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

export function SpreadsheetView({ refreshKey, onChanged, user }) {
  const [sheets, setSheets] = useState([])
  const [activeSheet, setActiveSheet] = useState('produtos')
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [paymentEditingRows, setPaymentEditingRows] = useState({})
  const isAdmin = user?.role === 'admin'
  const canEditProducts = user?.role === 'admin' || user?.role === 'manager'
  const canConfirmPayments = ['admin', 'manager', 'cashier'].includes(user?.role)

  useEffect(() => {
    api.sheets().then(setSheets).catch((err) => setMessage(err.message))
  }, [])

  useEffect(() => {
    api.sheet(activeSheet).then(setRows).catch((err) => setMessage(err.message))
    setPaymentEditingRows({})
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
      || (activeSheet === 'vendas' && (canConfirmPayments || isAdmin))
      || (activeSheet === 'movimentacoes' && isAdmin)
    )
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

        if (isAdmin) payload.observacoes = row.observacoes ?? ''
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
        if (!isAdmin) {
          setMessage('Somente administradores podem alterar observacoes.')
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
                  const canEditObservation = isAdmin && ['vendas', 'movimentacoes'].includes(activeSheet) && column === 'observacoes'
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
                {activeSheet === 'vendas' && canConfirmPayments ? (
                  <td className="border-b border-line/70 px-3 py-2 dark:border-shalom-gold/10">
                    {isPendingSale(row) ? (
                      <button className="mission-btn border border-line/80 p-2 hover:bg-shalom-cream/70 disabled:cursor-not-allowed disabled:opacity-45 dark:border-shalom-gold/10 dark:hover:bg-white/10" onClick={() => saveRow(row)} title={row.status_pagamento === 'pago' && row.pagamento !== 'pagamento_pendente' ? 'Confirmar pagamento' : isAdmin ? 'Salvar observacao' : 'Marque como pago e escolha o metodo'} disabled={!isAdmin && (row.status_pagamento !== 'pago' || row.pagamento === 'pagamento_pendente')}>
                        <Save size={16} />
                      </button>
                    ) : isAdmin ? (
                      <button className="mission-btn border border-line/80 p-2 hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10" onClick={() => saveRow(row)} title="Salvar observacao">
                        <Save size={16} />
                      </button>
                    ) : null}
                  </td>
                ) : null}
                {activeSheet === 'movimentacoes' && isAdmin ? (
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
    </div>
  )
}
