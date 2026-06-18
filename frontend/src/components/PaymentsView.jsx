import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  RefreshCw,
  WalletCards
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { formatDate, formatDateTime, money } from '../utils/formatters'

const confirmedPaymentMethods = ['pix', 'cartao', 'dinheiro']

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

function SummaryCard({ icon: Icon, label, value, detail, tone = 'blue' }) {
  const toneClass = tone === 'red'
    ? 'text-shalom-wine dark:text-rose-100'
    : tone === 'green'
      ? 'text-emerald-700 dark:text-emerald-200'
      : 'text-shalom-blue dark:text-shalom-gold'

  return (
    <article className="mission-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mission-muted text-sm font-medium">{label}</p>
          <p className={`mt-2 font-display text-2xl font-semibold ${toneClass}`}>{value}</p>
          {detail ? <p className="mission-muted mt-1 text-sm">{detail}</p> : null}
        </div>
        <span className="rounded-2xl bg-shalom-gold/40 p-3 text-shalom-deep dark:bg-white/10 dark:text-shalom-gold">
          <Icon size={22} />
        </span>
      </div>
    </article>
  )
}

function PaymentMethodSelect({ value, onChange }) {
  return (
    <select className="mission-input w-full px-3 py-2.5" value={value || ''} onChange={(event) => onChange(event.target.value)}>
      <option value="">Metodo</option>
      {confirmedPaymentMethods.map((method) => (
        <option key={method} value={method}>{getPaymentLabel(method)}</option>
      ))}
    </select>
  )
}

export function PaymentsView({ refreshKey, onChanged }) {
  const [pendingPayments, setPendingPayments] = useState([])
  const [closing, setClosing] = useState(null)
  const [events, setEvents] = useState([])
  const [closingDate, setClosingDate] = useState(todayInputValue)
  const [eventId, setEventId] = useState('')
  const [selectedMethods, setSelectedMethods] = useState({})
  const [loading, setLoading] = useState(true)
  const [confirmingId, setConfirmingId] = useState('')
  const [message, setMessage] = useState('')

  const closingParams = useMemo(() => {
    const params = { date: closingDate }
    if (eventId) params.event_id = eventId
    return params
  }, [closingDate, eventId])

  const loadData = useCallback(async () => {
    setLoading(true)
    setMessage('')

    try {
      const [pendingData, closingData, eventData] = await Promise.all([
        api.pendingPayments(),
        api.cashClosing(closingParams),
        api.events()
      ])
      setPendingPayments(pendingData)
      setClosing(closingData)
      setEvents(eventData)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }, [closingParams])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

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

  const summary = closing?.summary || {
    sales_count: 0,
    gross_total: 0,
    paid_total: 0,
    pending_total: 0,
    estimated_profit: 0
  }
  const paymentMethods = closing?.payment_methods || []
  const sales = closing?.sales || []

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={WalletCards} label="Faturamento" value={money.format(summary.gross_total)} detail={`${summary.sales_count} vendas`} />
        <SummaryCard icon={CheckCircle2} label="Pago" value={money.format(summary.paid_total)} detail={formatDate(closing?.date)} tone="green" />
        <SummaryCard icon={Clock3} label="Pendente" value={money.format(summary.pending_total)} detail={`${pendingPayments.length} em aberto`} tone={summary.pending_total > 0 ? 'red' : 'green'} />
        <SummaryCard icon={Banknote} label="Lucro estimado" value={money.format(summary.estimated_profit)} detail="Fechamento do periodo" />
      </section>

      <section className="mission-panel p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <h2 className="font-display text-lg font-semibold">Fechamento</h2>
            <p className="mission-muted text-sm">{closing?.event ? `${closing.event.name} - ${formatDate(closing.event.event_date)}` : 'Geral do dia'}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[160px_minmax(190px,1fr)_auto] sm:items-end">
            <label className="block text-sm font-medium">
              Data
              <input className="mission-input mt-1 w-full px-3 py-2.5" type="date" value={closingDate} onChange={(event) => setClosingDate(event.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              Evento
              <select className="mission-input mt-1 w-full px-3 py-2.5" value={eventId} onChange={(event) => setEventId(event.target.value)}>
                <option value="">Todos</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>{event.name} - {formatDate(event.event_date)}</option>
                ))}
              </select>
            </label>
            <button type="button" className="mission-btn mission-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold" onClick={loadData} disabled={loading}>
              <RefreshCw size={16} />
              Atualizar
            </button>
          </div>
        </div>

        {message ? <p className="mt-4 rounded-2xl bg-shalom-cream/70 px-4 py-3 text-sm text-shalom-deep dark:bg-white/10 dark:text-shalom-gold">{message}</p> : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {paymentMethods.length ? paymentMethods.map((item) => (
            <article key={`${item.payment_method}-${item.payment_status}`} className="mission-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{getPaymentLabel(item.payment_method)}</p>
                  <p className="mission-muted text-sm">{getStatusLabel(item.payment_status)} - {item.sales_count} vendas</p>
                </div>
                <CreditCard size={20} className="text-shalom-orange dark:text-shalom-gold" />
              </div>
              <p className="mt-4 font-display text-xl font-semibold text-shalom-blue dark:text-shalom-gold">{money.format(item.total)}</p>
              <p className="mission-muted mt-1 text-sm">Lucro: {money.format(item.estimated_profit)}</p>
            </article>
          )) : (
            <div className="rounded-2xl border border-dashed border-shalom-gold/50 p-5 text-sm mission-muted md:col-span-2 xl:col-span-4">
              Nenhuma venda no periodo.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="mission-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Pagamentos pendentes</h2>
              <p className="mission-muted text-sm">{pendingPayments.length} registros</p>
            </div>
            <Clock3 size={22} className="text-shalom-orange dark:text-shalom-gold" />
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="rounded-2xl border border-line/80 bg-white/70 p-4 text-sm dark:border-shalom-gold/10 dark:bg-white/10">Carregando pendencias...</div>
            ) : pendingPayments.length ? pendingPayments.map((item) => (
              <article key={item.id} className="mission-card p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">{item.customer_name}</p>
                    <p className="mission-muted text-sm">Venda #{item.id} - {formatDateTime(item.created_at)}</p>
                  </div>
                  <strong className="text-shalom-wine dark:text-rose-100">{money.format(item.total)}</strong>
                </div>

                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                    <dt className="mission-muted">Operador</dt>
                    <dd className="mt-1 font-semibold">{item.sold_by_name || '-'}</dd>
                  </div>
                  <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                    <dt className="mission-muted">Evento</dt>
                    <dd className="mt-1 font-semibold">{item.event_name || '-'}</dd>
                  </div>
                </dl>

                {item.notes ? (
                  <div className="mt-3 rounded-xl bg-shalom-cream/70 p-3 text-sm dark:bg-white/10">
                    <p className="mission-muted">Observacoes</p>
                    <p className="mt-1 whitespace-pre-wrap font-semibold">{item.notes}</p>
                  </div>
                ) : null}

                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <PaymentMethodSelect
                    value={selectedMethods[item.id]}
                    onChange={(value) => setSelectedMethods((current) => ({ ...current, [item.id]: value }))}
                  />
                  <button
                    type="button"
                    className="mission-btn mission-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold"
                    onClick={() => confirmPayment(item.id)}
                    disabled={!selectedMethods[item.id] || confirmingId === String(item.id)}
                  >
                    <CheckCircle2 size={16} />
                    {confirmingId === String(item.id) ? 'Confirmando...' : 'Marcar pago'}
                  </button>
                </div>
              </article>
            )) : (
              <div className="rounded-2xl border border-line/80 bg-white/70 p-4 text-sm dark:border-shalom-gold/10 dark:bg-white/10">
                Nenhum pagamento pendente.
              </div>
            )}
          </div>
        </div>

        <div className="mission-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Vendas do fechamento</h2>
              <p className="mission-muted text-sm">{sales.length} registros</p>
            </div>
            <CalendarDays size={22} className="text-shalom-orange dark:text-shalom-gold" />
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="rounded-2xl border border-line/80 bg-white/70 p-4 text-sm dark:border-shalom-gold/10 dark:bg-white/10">Carregando vendas...</div>
            ) : sales.length ? sales.map((sale) => (
              <article key={sale.id} className="mission-card p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">Venda #{sale.id}</p>
                    <p className="mission-muted text-sm">{formatDateTime(sale.created_at)} - {sale.sold_by_name || '-'}</p>
                  </div>
                  <strong className="text-shalom-blue dark:text-shalom-gold">{money.format(sale.total)}</strong>
                </div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                    <p className="mission-muted">Pagamento</p>
                    <p className="mt-1 font-semibold">{getPaymentLabel(sale.payment_method)}</p>
                  </div>
                  <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                    <p className="mission-muted">Status</p>
                    <p className="mt-1 font-semibold">{getStatusLabel(sale.payment_status)}</p>
                  </div>
                  <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                    <p className="mission-muted">Lucro</p>
                    <p className="mt-1 font-semibold">{money.format(sale.estimated_profit)}</p>
                  </div>
                </div>
                {sale.customer_name || sale.notes ? (
                  <p className="mission-muted mt-3 text-sm">
                    {[sale.customer_name, sale.notes].filter(Boolean).join(' - ')}
                  </p>
                ) : null}
              </article>
            )) : (
              <div className="rounded-2xl border border-line/80 bg-white/70 p-4 text-sm dark:border-shalom-gold/10 dark:bg-white/10">
                Nenhuma venda neste fechamento.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
