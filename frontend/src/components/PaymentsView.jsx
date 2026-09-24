import { CheckCircle2, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { decimal, formatDate, formatDateTime, money } from '../utils/formatters'
import { BackToDashboard } from './BackToDashboard'
import { PaginationControls } from './PaginationControls'
import { OfferComboManager } from './finance/OfferComboManager'

const confirmedPaymentMethods = ['pix', 'cartao', 'dinheiro']
const PAGE_SIZE = 10
const financeSections = [
  ['overview', 'Visao geral'],
  ['closing', 'Fechamento'],
  ['pending', 'Pendencias'],
  ['sales', 'Vendas'],
  ['offers', 'Ofertas']
]
const financeSectionPaths = {
  overview: '/financeiro',
  closing: '/financeiro/fechamento',
  pending: '/financeiro/pagamentos-pendentes',
  sales: '/financeiro/vendas',
  offers: '/financeiro/ofertas'
}

const paymentLabels = {
  pix: 'Pix',
  cartao: 'Cartao',
  dinheiro: 'Dinheiro',
  pagamento_pendente: 'Pagamento pendente'
}

const statusLabels = {
  paid: 'Pago',
  pending: 'Pendente'
}

function todayInputValue() {
  const date = new Date()
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 10)
}

function getPaymentLabel(value) {
  return paymentLabels[value] || value || '-'
}

function getStatusLabel(value) {
  return statusLabels[value] || value || '-'
}

function clampPage(page, totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  return Math.min(Math.max(1, page), totalPages)
}

function SummaryMetric({ label, value, detail, tone = 'blue' }) {
  const toneClass = tone === 'red'
    ? 'text-shalom-wine dark:text-rose-100'
    : tone === 'green'
      ? 'text-emerald-700 dark:text-emerald-200'
      : 'text-shalom-blue dark:text-shalom-gold'

  return (
    <div className="min-w-0 px-3 py-3 sm:px-4">
      <p className="mission-muted text-xs font-medium">{label}</p>
      <p className={`mt-1 truncate font-display text-xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mission-muted mt-0.5 truncate text-xs">{detail}</p>
    </div>
  )
}

function PaymentMethodSelect({ value, onChange }) {
  return (
    <select className="mission-input w-full px-3 py-2.5" value={value || ''} onChange={(event) => onChange(event.target.value)}>
      <option value="">Metodo</option>
      {confirmedPaymentMethods.map((method) => <option key={method} value={method}>{getPaymentLabel(method)}</option>)}
    </select>
  )
}

function SaleItemsList({ items }) {
  return (
    <div className="mt-3 border-t border-line/70 pt-3 text-sm dark:border-shalom-gold/10">
      <p className="mission-muted font-medium">Produtos vendidos</p>
      {items?.length ? (
        <ul className="mt-2">
          {items.map((item) => (
            <li key={item.id} className="flex min-w-0 items-start justify-between gap-3 border-b border-line/60 py-2 last:border-0 dark:border-shalom-gold/10">
              <span className="min-w-0"><strong className="block truncate">{item.item_name}</strong><span className="mission-muted text-xs">{decimal.format(item.quantity)} x {money.format(item.unit_price)}</span></span>
              <strong className="shrink-0 text-shalom-blue dark:text-shalom-gold">{money.format(item.line_total)}</strong>
            </li>
          ))}
        </ul>
      ) : <p className="mission-muted mt-2">Sem itens detalhados.</p>}
    </div>
  )
}

export function PaymentsView({ refreshKey, onChanged, initialSection = 'overview' }) {
  const navigate = useNavigate()
  const [pendingPayments, setPendingPayments] = useState([])
  const [closing, setClosing] = useState(null)
  const [events, setEvents] = useState([])
  const [closingDate, setClosingDate] = useState(todayInputValue)
  const [eventId, setEventId] = useState('')
  const [selectedMethods, setSelectedMethods] = useState({})
  const [closingNotes, setClosingNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmingId, setConfirmingId] = useState('')
  const [savingClosing, setSavingClosing] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingPage, setPendingPage] = useState(1)
  const [salesPage, setSalesPage] = useState(1)
  const [activeSection, setActiveSection] = useState(initialSection)
  const [expandedPendingId, setExpandedPendingId] = useState('')
  const [expandedSaleId, setExpandedSaleId] = useState('')

  function selectSection(section) {
    setActiveSection(section)
    navigate(financeSectionPaths[section] || '/financeiro')
  }

  const closingParams = useMemo(() => {
    const params = { date: closingDate }
    if (eventId) params.event_id = eventId
    return params
  }, [closingDate, eventId])

  const loadData = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const [pendingData, closingData, eventData] = await Promise.all([api.pendingPayments(), api.cashClosing(closingParams), api.events()])
      setPendingPayments(pendingData)
      setClosing(closingData)
      setEvents(eventData)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }, [closingParams])

  useEffect(() => { loadData() }, [loadData, refreshKey])
  useEffect(() => { setActiveSection(initialSection) }, [initialSection])

  async function confirmPayment(saleId) {
    const paymentMethod = selectedMethods[saleId]
    if (!paymentMethod) {
      setMessage('Escolha o metodo de pagamento.')
      return
    }
    setConfirmingId(String(saleId))
    setMessage('')
    try {
      await api.confirmSalePayment(saleId, { payment_method: paymentMethod })
      setSelectedMethods((current) => {
        const next = { ...current }
        delete next[saleId]
        return next
      })
      await loadData()
      onChanged?.()
      setMessage('Pagamento confirmado.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setConfirmingId('')
    }
  }

  async function saveClosing() {
    setMessage('')
    setSavingClosing(true)
    try {
      const payload = { date: closingDate, notes: closingNotes }
      if (eventId) payload.event_id = eventId
      const nextClosing = await api.saveCashClosing(payload)
      setClosing(nextClosing)
      setClosingNotes('')
      onChanged?.()
      setMessage('Fechamento registrado.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSavingClosing(false)
    }
  }

  const summary = closing?.summary || { sales_count: 0, gross_total: 0, paid_total: 0, pending_total: 0, estimated_profit: 0 }
  const paymentMethods = closing?.payment_methods || []
  const sales = closing?.sales || []
  const paginatedPendingPayments = pendingPayments.slice((pendingPage - 1) * PAGE_SIZE, pendingPage * PAGE_SIZE)
  const paginatedSales = sales.slice((salesPage - 1) * PAGE_SIZE, salesPage * PAGE_SIZE)

  useEffect(() => { setPendingPage((current) => clampPage(current, pendingPayments.length)) }, [pendingPayments.length])
  useEffect(() => { setSalesPage((current) => clampPage(current, sales.length)) }, [sales.length])

  return (
    <div className="-mx-3 -mt-4 min-w-0 sm:-mx-5 lg:mx-0 lg:mt-0">
      <div className="scrollbar-hidden flex gap-5 overflow-x-auto border-b border-line/80 px-3 pt-1 dark:border-shalom-gold/10 sm:px-5 lg:px-0 lg:pt-0" role="tablist" aria-label="Areas do financeiro">
        {financeSections.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={activeSection === key} className={`section-text-tab ${activeSection === key ? 'section-text-tab-active' : ''}`} onClick={() => selectSection(key)}>{label}</button>
        ))}
      </div>

      {message ? <p className="mx-3 mt-3 border-l-2 border-shalom-orange px-3 py-2 text-sm text-shalom-deep dark:border-shalom-gold dark:text-shalom-gold sm:mx-5 lg:mx-0">{message}</p> : null}

      {activeSection === 'overview' ? (
        <div>
          <section className="grid grid-cols-2 divide-x divide-y divide-line/70 border-b border-line/80 dark:divide-shalom-gold/10 dark:border-shalom-gold/10 lg:grid-cols-4 lg:divide-y-0" aria-label="Resumo financeiro">
            <SummaryMetric label="Faturamento" value={money.format(summary.gross_total)} detail={`${summary.sales_count} vendas`} />
            <SummaryMetric label="Pago" value={money.format(summary.paid_total)} detail={formatDate(closing?.date)} tone="green" />
            <SummaryMetric label="Pendente" value={money.format(summary.pending_total)} detail={`${pendingPayments.length} em aberto`} tone={summary.pending_total > 0 ? 'red' : 'green'} />
            <SummaryMetric label="Lucro estimado" value={money.format(summary.estimated_profit)} detail="No periodo" />
          </section>

          <div className="grid min-w-0 lg:grid-cols-2 lg:divide-x lg:divide-line/70 dark:lg:divide-shalom-gold/10">
            <section className="border-b border-line/70 px-3 py-4 dark:border-shalom-gold/10 sm:px-5 lg:border-b-0 lg:px-0 lg:pr-5">
              <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Fechamento atual</h2><p className="mission-muted text-sm">{closing?.event ? closing.event.name : 'Geral do dia'} - {formatDate(closing?.date)}</p></div><button type="button" className="flex h-11 w-11 items-center justify-center text-shalom-blue" onClick={() => selectSection('closing')} aria-label="Abrir fechamento" title="Abrir fechamento"><ChevronRight size={20} /></button></div>
              {closing?.registered_closing ? <p className="mt-3 border-l-2 border-emerald-500 px-3 text-sm text-emerald-700 dark:text-emerald-200">Registrado em {formatDateTime(closing.registered_closing.created_at)}.</p> : <p className="mission-muted mt-3 text-sm">Ainda nao registrado para este periodo.</p>}
              <div className="mt-3 divide-y divide-line/70 dark:divide-shalom-gold/10">
                {paymentMethods.slice(0, 4).map((item) => <div key={`${item.payment_method}-${item.payment_status}`} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{getPaymentLabel(item.payment_method)} <span className="mission-muted">({getStatusLabel(item.payment_status)})</span></span><strong>{money.format(item.total)}</strong></div>)}
                {!paymentMethods.length ? <p className="mission-muted py-3 text-sm">Nenhuma venda no periodo.</p> : null}
              </div>
            </section>

            <section className="px-3 py-4 sm:px-5 lg:px-0 lg:pl-5">
              <button type="button" className="flex min-h-16 w-full items-center justify-between gap-3 border-b border-line/70 py-2 text-left dark:border-shalom-gold/10" onClick={() => selectSection('pending')}><span><strong className="block">Pagamentos pendentes</strong><span className="mission-muted text-sm">{pendingPayments.length} registros - {money.format(summary.pending_total)}</span></span><ChevronRight size={20} className="shrink-0 opacity-45" /></button>
              <button type="button" className="flex min-h-16 w-full items-center justify-between gap-3 border-b border-line/70 py-2 text-left dark:border-shalom-gold/10" onClick={() => selectSection('sales')}><span><strong className="block">Vendas do fechamento</strong><span className="mission-muted text-sm">{sales.length} registros no periodo</span></span><ChevronRight size={20} className="shrink-0 opacity-45" /></button>
              <button type="button" className="flex min-h-16 w-full items-center justify-between gap-3 py-2 text-left" onClick={() => selectSection('offers')}><span><strong className="block">Ofertas e combos</strong><span className="mission-muted text-sm">Configuracoes exibidas no PDV</span></span><ChevronRight size={20} className="shrink-0 opacity-45" /></button>
            </section>
          </div>
        </div>
      ) : null}

      {activeSection === 'closing' ? (
        <section className="px-3 py-4 sm:px-5 lg:px-0">
          <div className="grid min-w-0 gap-3 md:grid-cols-[160px_minmax(200px,1fr)_auto] md:items-end">
            <label className="text-sm font-medium">Data<input className="mission-input mt-1 w-full px-3 py-2.5" type="date" value={closingDate} onChange={(event) => { setClosingDate(event.target.value); setSalesPage(1) }} /></label>
            <label className="text-sm font-medium">Evento<select className="mission-input mt-1 w-full px-3 py-2.5" value={eventId} onChange={(event) => { setEventId(event.target.value); setSalesPage(1) }}><option value="">Todos</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name} - {formatDate(event.event_date)}</option>)}</select></label>
            <button type="button" className="flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-shalom-blue dark:text-shalom-gold" onClick={loadData} disabled={loading}><RefreshCw size={16} />Atualizar</button>
          </div>

          {closing?.registered_closing ? <p className="mt-4 border-l-2 border-emerald-500 px-3 py-1 text-sm text-emerald-700 dark:text-emerald-200">Fechamento registrado em {formatDateTime(closing.registered_closing.created_at)} por {closing.registered_closing.created_by_name || '-'}.</p> : null}

          <div className="mt-5 border-y border-line/70 dark:border-shalom-gold/10">
            {paymentMethods.length ? paymentMethods.map((item) => (
              <div key={`${item.payment_method}-${item.payment_status}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line/60 py-3 last:border-0 dark:border-shalom-gold/10 sm:grid-cols-[minmax(0,1fr)_120px_140px]">
                <div><p className="font-semibold">{getPaymentLabel(item.payment_method)}</p><p className="mission-muted text-xs">{getStatusLabel(item.payment_status)} - {item.sales_count} vendas</p></div>
                <p className="hidden text-sm sm:block">Lucro {money.format(item.estimated_profit)}</p>
                <strong className="text-right text-shalom-blue dark:text-shalom-gold">{money.format(item.total)}</strong>
              </div>
            )) : <p className="mission-muted py-5 text-sm">Nenhuma venda no periodo.</p>}
          </div>

          <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="text-sm font-medium">Observacoes do fechamento<input className="mission-input mt-1 w-full px-3 py-2.5" value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} /></label>
            <button type="button" className="mission-btn mission-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={saveClosing} disabled={loading || savingClosing}><CheckCircle2 size={16} />{savingClosing ? 'Registrando...' : 'Registrar fechamento'}</button>
          </div>
        </section>
      ) : null}

      {activeSection === 'pending' ? (
        <section className="min-w-0">
          <p className="mission-muted border-b border-line/70 px-3 py-3 text-sm dark:border-shalom-gold/10 sm:px-5 lg:px-0">{pendingPayments.length} pagamentos pendentes</p>
          {loading ? <p className="mission-muted px-3 py-8 text-sm sm:px-5 lg:px-0">Carregando pendencias...</p> : paginatedPendingPayments.length ? paginatedPendingPayments.map((item) => {
            const expanded = String(expandedPendingId) === String(item.id)
            return <article key={item.id} className="border-b border-line/70 dark:border-shalom-gold/10">
              <button type="button" className="flex min-h-[72px] w-full min-w-0 items-center gap-3 px-3 py-3 text-left hover:bg-shalom-mist/45 dark:hover:bg-white/5 sm:px-5 lg:px-0" onClick={() => setExpandedPendingId(expanded ? '' : String(item.id))} aria-expanded={expanded}>
                <span className="min-w-0 flex-1"><strong className="block truncate">{item.customer_name}</strong><span className="mission-muted block truncate text-xs">Venda #{item.id} - {formatDateTime(item.created_at)}</span></span>
                <strong className="shrink-0 text-shalom-wine dark:text-rose-100">{money.format(item.total)}</strong>
                {expanded ? <ChevronDown size={18} className="shrink-0 opacity-45" /> : <ChevronRight size={18} className="shrink-0 opacity-45" />}
              </button>
              {expanded ? <div className="px-3 pb-4 sm:px-5 lg:px-0">
                <dl className="grid gap-x-6 gap-y-2 border-y border-line/60 py-3 text-sm dark:border-shalom-gold/10 sm:grid-cols-2"><div><dt className="mission-muted text-xs">Operador</dt><dd className="font-semibold">{item.sold_by_name || '-'}</dd></div><div><dt className="mission-muted text-xs">Evento</dt><dd className="font-semibold">{item.event_name || '-'}</dd></div></dl>
                {item.notes ? <p className="mt-3 whitespace-pre-wrap break-words text-sm"><span className="mission-muted">Observacoes: </span>{item.notes}</p> : null}
                <SaleItemsList items={item.items} />
                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><PaymentMethodSelect value={selectedMethods[item.id]} onChange={(value) => setSelectedMethods((current) => ({ ...current, [item.id]: value }))} /><button type="button" className="mission-btn mission-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={() => confirmPayment(item.id)} disabled={!selectedMethods[item.id] || confirmingId === String(item.id)}><CheckCircle2 size={16} />{confirmingId === String(item.id) ? 'Confirmando...' : 'Marcar pago'}</button></div>
              </div> : null}
            </article>
          }) : <p className="mission-muted px-3 py-8 text-sm sm:px-5 lg:px-0">Nenhum pagamento pendente.</p>}
          <div className="px-3 sm:px-5 lg:px-0"><PaginationControls page={pendingPage} pageSize={PAGE_SIZE} totalItems={pendingPayments.length} itemLabel="pendencias" onPageChange={(page) => setPendingPage(clampPage(page, pendingPayments.length))} /></div>
          <div className="mx-3 border-t border-line/70 pt-3 dark:border-shalom-gold/10 sm:mx-5 lg:mx-0"><BackToDashboard /></div>
        </section>
      ) : null}

      {activeSection === 'sales' ? (
        <section className="min-w-0">
          <p className="mission-muted border-b border-line/70 px-3 py-3 text-sm dark:border-shalom-gold/10 sm:px-5 lg:px-0">{sales.length} vendas no fechamento</p>
          {loading ? <p className="mission-muted px-3 py-8 text-sm sm:px-5 lg:px-0">Carregando vendas...</p> : paginatedSales.length ? paginatedSales.map((sale) => {
            const expanded = String(expandedSaleId) === String(sale.id)
            return <article key={sale.id} className="border-b border-line/70 dark:border-shalom-gold/10">
              <button type="button" className="grid min-h-[72px] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-3 text-left hover:bg-shalom-mist/45 dark:hover:bg-white/5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_130px_130px_auto] lg:px-0" onClick={() => setExpandedSaleId(expanded ? '' : String(sale.id))} aria-expanded={expanded}>
                <span className="min-w-0"><strong className="block truncate">Venda #{sale.id}</strong><span className="mission-muted block truncate text-xs">{formatDateTime(sale.created_at)} - {sale.sold_by_name || '-'}</span></span>
                <span className="mission-muted hidden text-sm lg:block">{getPaymentLabel(sale.payment_method)}</span>
                <strong className="shrink-0 text-shalom-blue dark:text-shalom-gold">{money.format(sale.total)}</strong>
                {expanded ? <ChevronDown size={18} className="shrink-0 opacity-45" /> : <ChevronRight size={18} className="shrink-0 opacity-45" />}
              </button>
              {expanded ? <div className="px-3 pb-4 sm:px-5 lg:px-0">
                <dl className="grid gap-x-6 gap-y-2 border-y border-line/60 py-3 text-sm dark:border-shalom-gold/10 sm:grid-cols-3"><div><dt className="mission-muted text-xs">Pagamento</dt><dd className="font-semibold">{getPaymentLabel(sale.payment_method)}</dd></div><div><dt className="mission-muted text-xs">Status</dt><dd className="font-semibold">{getStatusLabel(sale.payment_status)}</dd></div><div><dt className="mission-muted text-xs">Lucro</dt><dd className="font-semibold">{money.format(sale.estimated_profit)}</dd></div></dl>
                {sale.customer_name || sale.notes ? <p className="mission-muted mt-3 break-words text-sm">{[sale.customer_name, sale.notes].filter(Boolean).join(' - ')}</p> : null}
                <SaleItemsList items={sale.items} />
              </div> : null}
            </article>
          }) : <p className="mission-muted px-3 py-8 text-sm sm:px-5 lg:px-0">Nenhuma venda neste fechamento.</p>}
          <div className="px-3 sm:px-5 lg:px-0"><PaginationControls page={salesPage} pageSize={PAGE_SIZE} totalItems={sales.length} itemLabel="vendas" onPageChange={(page) => setSalesPage(clampPage(page, sales.length))} /></div>
        </section>
      ) : null}

      {activeSection === 'offers' ? <OfferComboManager /> : null}
    </div>
  )
}
