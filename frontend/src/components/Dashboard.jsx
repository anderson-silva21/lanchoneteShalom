import {
  AlertTriangle,
  Banknote,
  Boxes,
  CalendarClock,
  CalendarPlus,
  ExternalLink,
  LineChart,
  PackagePlus,
  ReceiptText,
  TrendingUp,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { api } from '../services/api'
import { decimal, formatDate, formatDateTime, formatQuantityWithUnit, money } from '../utils/formatters'
import { MetricCard } from './MetricCard'
import { StatusPill } from './StatusPill'

function formatDays(value) {
  if (!value && value !== 0) return 'Sem consumo recente'
  if (value < 1) return 'Menos de 1 dia'
  return `${decimal.format(value)} dias`
}

function todayInputValue() {
  const date = new Date()
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 10)
}

function createEmptyEventDraft() {
  return {
    name: '',
    event_date: todayInputValue(),
    notes: ''
  }
}

const confirmedPaymentMethods = ['pix', 'cartao', 'dinheiro']

const paymentLabels = {
  pix: 'Pix',
  cartao: 'Cartao',
  dinheiro: 'Dinheiro'
}

function getPaymentLabel(value) {
  return paymentLabels[value] || value
}

function validityLabel(item) {
  if (item.expiration_status === 'expired') return `Vencido ha ${Math.abs(Number(item.days_to_expire || 0))} dias`
  if (Number(item.days_to_expire) === 0) return 'Vence hoje'
  return `Vence em ${decimal.format(item.days_to_expire)} dias`
}

function DashboardModal({ title, description, children, footer, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return createPortal(
    <div
      className="dashboard-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="dashboard-modal-panel mission-panel text-ink shadow-blue dark:text-slate-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-modal-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line/80 p-4 dark:border-shalom-gold/10">
          <div>
            <h2 id="dashboard-modal-title" className="font-display text-lg font-semibold sm:text-xl">{title}</h2>
            {description ? <p className="mission-muted mt-1 text-sm">{description}</p> : null}
          </div>
          <button
            type="button"
            className="mission-btn border border-line/80 bg-white/70 p-2 text-shalom-deep hover:bg-shalom-cream dark:border-shalom-gold/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            onClick={onClose}
            aria-label="Fechar modal"
            autoFocus
          >
            <X size={18} />
          </button>
        </div>
        <div className="dashboard-modal-body scrollbar-thin p-4">
          {children}
        </div>
        {footer ? <div className="border-t border-line/80 p-4 dark:border-shalom-gold/10">{footer}</div> : null}
      </section>
    </div>,
    document.body
  )
}

export function Dashboard({ refreshKey, onNavigateToProducts, user }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeModal, setActiveModal] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [eventDraft, setEventDraft] = useState(createEmptyEventDraft)
  const [eventSaving, setEventSaving] = useState(false)
  const [eventMessage, setEventMessage] = useState('')
  const [registeredEvent, setRegisteredEvent] = useState(null)
  const [pendingPaymentMethods, setPendingPaymentMethods] = useState({})
  const [pendingPaymentConfirming, setPendingPaymentConfirming] = useState('')
  const [pendingPaymentMessage, setPendingPaymentMessage] = useState('')
  const retriedEventRevenueRef = useRef(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    api.dashboard()
      .then((payload) => {
        if (!mounted) return
        setData(payload)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err.message)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [refreshKey, reloadKey])

  useEffect(() => {
    if (loading || !data || Array.isArray(data.event_revenue) || retriedEventRevenueRef.current) return
    retriedEventRevenueRef.current = true
    setReloadKey((key) => key + 1)
  }, [data, loading])

  useEffect(() => {
    if (!activeModal) return undefined
    function handleKeyDown(event) {
      if (event.key === 'Escape') setActiveModal('')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeModal])

  function openProducts(intent) {
    setActiveModal('')
    onNavigateToProducts?.(intent)
  }

  function openEventModal() {
    setEventDraft(createEmptyEventDraft())
    setEventMessage('')
    setRegisteredEvent(null)
    setActiveModal('event')
  }

  async function registerEvent(event) {
    event.preventDefault()
    setEventSaving(true)
    setEventMessage('')
    setRegisteredEvent(null)

    try {
      const created = await api.createEvent(eventDraft)
      setRegisteredEvent(created)
      setReloadKey((key) => key + 1)
    } catch (err) {
      setEventMessage(err.message)
    } finally {
      setEventSaving(false)
    }
  }

  async function confirmPendingPayment(saleId) {
    const paymentMethod = pendingPaymentMethods[saleId]
    if (!paymentMethod) {
      setPendingPaymentMessage('Escolha o metodo de pagamento.')
      return
    }

    setPendingPaymentConfirming(String(saleId))
    setPendingPaymentMessage('')

    try {
      await api.confirmSheetSalePayment(saleId, {
        pagamento: paymentMethod,
        status_pagamento: 'pago'
      })
      setPendingPaymentMethods((current) => {
        const next = { ...current }
        delete next[saleId]
        return next
      })
      setReloadKey((key) => key + 1)
      setPendingPaymentMessage('Pagamento confirmado.')
    } catch (err) {
      setPendingPaymentMessage(err.message)
    } finally {
      setPendingPaymentConfirming('')
    }
  }

  if (error) {
    return (
      <div className="mission-panel p-4 text-shalom-wine dark:text-rose-100">
        <p className="font-semibold">Nao foi possivel carregar a dashboard.</p>
        <p className="mt-1 text-sm">{error}</p>
        <button type="button" className="mission-btn mission-btn-primary mt-4 px-4 py-2 text-sm font-semibold" onClick={() => setReloadKey((key) => key + 1)}>
          Tentar novamente
        </button>
      </div>
    )
  }

  if (loading || !data) {
    return <div className="mission-panel p-6">Carregando dashboard...</div>
  }

  const suggestions = data.purchase_suggestions || []
  const lowStockProducts = data.low_stock_products || []
  const expirationAlerts = data.expiration_alerts || []
  const missingExpirationProducts = data.missing_expiration_products || []
  const eventRevenue = data.event_revenue || []
  const pendingPayments = data.pending_payments || []
  const canOpenTelegramGroup = user?.role === 'finance' && data.telegram_group_url

  return (
    <div className="space-y-5">
      {canOpenTelegramGroup ? (
        <section className="flex justify-end">
          <a
            className="mission-btn mission-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold"
            href={data.telegram_group_url}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} />
            Acessar grupo do Telegram
          </a>
        </section>
      ) : null}
      <section className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Banknote} label="Faturamento hoje" value={money.format(data.kpis.revenue_today)} detail={`${data.kpis.sales_today} vendas`} tone="green" />
        <MetricCard icon={ReceiptText} label="Ticket medio" value={money.format(data.kpis.average_ticket_today)} detail="Media do dia" tone="blue" />
        <MetricCard icon={TrendingUp} label="Lucro estimado" value={money.format(data.kpis.estimated_profit_today)} detail="Baseado em custo" />
        <MetricCard icon={LineChart} label="Produto mais vendido" value={data.top_products[0]?.name || '-'} detail={data.top_products[0] ? `${decimal.format(data.top_products[0].quantity)} vendidos` : 'Sem vendas'} />
      </section>

      <section className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={AlertTriangle}
          label="Estoque baixo"
          value={data.kpis.low_stock_count}
          detail={`${data.kpis.critical_stock_count} criticos`}
          tone={data.kpis.critical_stock_count ? 'red' : 'amber'}
          onClick={() => setActiveModal('lowStock')}
          ariaLabel="Abrir produtos com estoque baixo"
        />
        <MetricCard
          icon={Boxes}
          label="Sugestoes"
          value={suggestions.length}
          detail="Compras indicadas"
          onClick={() => setActiveModal('suggestions')}
          ariaLabel="Abrir sugestoes de compra"
        />
        <MetricCard
          icon={CalendarClock}
          label="Validades"
          value={data.kpis.validity_attention_count}
          detail={`${data.kpis.expired_count} vencidos`}
          tone={data.kpis.expired_count ? 'red' : 'amber'}
          onClick={() => setActiveModal('expiration')}
          ariaLabel="Abrir alertas de validade"
        />
        <MetricCard
          icon={Banknote}
          label="Pagamentos pendentes"
          value={data.kpis.pending_payment_count || 0}
          detail={money.format(data.kpis.pending_payment_total || 0)}
          tone={data.kpis.pending_payment_count ? 'red' : 'green'}
          onClick={() => setActiveModal('pendingPayments')}
          ariaLabel="Abrir pagamentos pendentes"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <div className="mission-panel p-4 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Vendas por periodo</h2>
              <p className="mission-muted text-sm">Faturamento e lucro</p>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.sales_by_day}>
                <defs>
                  <linearGradient id="revenue" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#184E7F" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#FAE088" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7DFCD" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={46} />
                <Tooltip formatter={(value) => money.format(value)} />
                <Legend />
                <Area type="monotone" name="Faturamento" dataKey="revenue" stroke="#184E7F" fill="url(#revenue)" strokeWidth={2.4} />
                <Area type="monotone" name="Lucro" dataKey="profit" stroke="#F27C23" fill="#F27C2320" strokeWidth={2.4} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mission-panel p-4">
          <h2 className="font-display text-lg font-semibold">Alertas de estoque</h2>
          <div className="mt-4 space-y-3">
            {data.alerts.slice(0, 6).map((item) => (
              <div key={item.id} className="mission-card flex items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="mission-muted text-sm">
                    {formatQuantityWithUnit(item.stock_quantity, item.unit)} em estoque
                  </p>
                </div>
                <StatusPill status={item.status} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <div className="mission-panel p-4">
          <h2 className="font-display text-lg font-semibold">Mais vendidos</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.top_products} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E7DFCD" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={108} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => decimal.format(value)} />
                <Bar dataKey="quantity" fill="#184E7F" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="dashboard-chart-panel mission-panel p-4">
          <h2 className="font-display text-lg font-semibold">Saidas de estoque por vendas</h2>
          <p className="mission-muted text-sm">8 produtos mais consumidos nos ultimos 14 dias, incluindo combos</p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stock_consumption} layout="vertical" margin={{ left: 8, right: 18 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E7DFCD" />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" width={108} tickLine={false} axisLine={false} />
                <Tooltip
                  allowEscapeViewBox={{ x: true, y: true }}
                  wrapperStyle={{ zIndex: 50 }}
                  formatter={(value, name, item) => [
                    formatQuantityWithUnit(value, item.payload.unit),
                    name
                  ]}
                />
                <Bar dataKey="quantity" name="Quantidade consumida" fill="#F27C23" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mission-panel p-4">
          <h2 className="font-display text-lg font-semibold">Produtos parados</h2>
          <p className="mission-muted text-sm">6 produtos com menos vendas diretas nos ultimos 30 dias</p>
          <div className="mt-4 divide-y divide-line/70 dark:divide-shalom-gold/10">
            {data.slow_products.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="mission-muted text-sm">{item.category}</p>
                </div>
                <span className="rounded-full bg-shalom-gold/30 px-2.5 py-1 text-sm font-semibold text-shalom-deep dark:bg-shalom-gold/20 dark:text-shalom-gold">{decimal.format(item.sold_quantity)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="mission-panel p-4">
          <h2 className="font-display text-lg font-semibold">Receita por categoria</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.category_revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7DFCD" />
                <XAxis dataKey="category" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => money.format(value)} />
                <Bar dataKey="revenue" name="Faturamento" fill="#184E7F" radius={[8, 8, 0, 0]} />
                <Bar dataKey="profit" name="Lucro" fill="#F27C23" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="dashboard-chart-panel mission-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Receita por evento</h2>
              <p className="mission-muted text-sm">Faturamento das vendas vinculadas a cada evento neste ano</p>
            </div>
            <button type="button" className="mission-btn mission-btn-primary flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-semibold" onClick={openEventModal}>
              <CalendarPlus size={17} />
              Registrar
            </button>
          </div>
          <div className="mt-4 h-72">
            {eventRevenue.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eventRevenue} layout="vertical" margin={{ left: 8, right: 96 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E7DFCD" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" width={132} tickLine={false} axisLine={false} />
                  <Tooltip
                    allowEscapeViewBox={{ x: true, y: true }}
                    wrapperStyle={{ zIndex: 50 }}
                    formatter={(value) => [money.format(value), 'Faturamento']}
                  />
                  <Bar dataKey="revenue" name="Faturamento" fill="#184E7F" radius={[0, 8, 8, 0]} minPointSize={4}>
                    <LabelList dataKey="revenue" position="right" formatter={(value) => money.format(value)} fill="#184E7F" fontSize={12} fontWeight={600} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-shalom-gold/50 p-6 text-center">
                <p className="font-semibold">Nenhuma receita por evento encontrada.</p>
                <p className="mission-muted mt-1 text-sm">Vincule um evento ao registrar vendas no PDV.</p>
                <button type="button" className="mission-btn mission-btn-primary mt-4 px-4 py-2 text-sm font-semibold" onClick={() => setReloadKey((key) => key + 1)}>
                  Atualizar dados
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {activeModal === 'event' ? (
        <DashboardModal
          title="Registrar evento"
          description="Todas as vendas realizadas nesta data serao vinculadas automaticamente ao evento."
          onClose={() => setActiveModal('')}
        >
          <form className="space-y-4" onSubmit={registerEvent}>
            <label className="block text-sm font-medium">
              Nome do evento
              <input
                className="mission-input mt-2 w-full px-3 py-2.5"
                value={eventDraft.name}
                onChange={(event) => setEventDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ex.: Servos Apostolicos"
                required
              />
            </label>
            <label className="block text-sm font-medium">
              Data do evento
              <input
                className="mission-input mt-2 w-full px-3 py-2.5"
                type="date"
                value={eventDraft.event_date}
                onChange={(event) => setEventDraft((current) => ({ ...current, event_date: event.target.value }))}
                required
              />
            </label>
            <label className="block text-sm font-medium">
              Observacoes
              <textarea
                className="mission-input mt-2 min-h-20 w-full px-3 py-2.5"
                value={eventDraft.notes}
                onChange={(event) => setEventDraft((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>

            {eventMessage ? <p className="rounded-xl bg-shalom-wine/10 px-3 py-2 text-sm text-shalom-wine dark:text-rose-100">{eventMessage}</p> : null}

            {registeredEvent ? (
              <div className="rounded-xl bg-shalom-mist/70 p-3 text-sm dark:bg-white/10">
                <p className="font-semibold">Evento registrado para {formatDate(registeredEvent.event_date)}.</p>
                <p className="mission-muted mt-1">
                  {registeredEvent.assigned_sales} vendas existentes atribuidas, totalizando {money.format(registeredEvent.assigned_revenue)}.
                </p>
              </div>
            ) : null}

            <button type="submit" className="mission-btn mission-btn-primary flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" disabled={eventSaving}>
              <CalendarPlus size={18} />
              {eventSaving ? 'Registrando...' : 'Registrar evento'}
            </button>
          </form>
        </DashboardModal>
      ) : null}

      {activeModal === 'suggestions' ? (
        <DashboardModal
          title="Sugestoes de compra"
          description="Itens com reposicao recomendada com base no estoque minimo e no consumo recente."
          onClose={() => setActiveModal('')}
          footer={(
            <button
              type="button"
              className="mission-btn mission-btn-gold flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold sm:w-auto"
              onClick={() => openProducts({ action: 'purchase', productId: suggestions[0]?.id })}
            >
              <PackagePlus size={17} />
              Registrar compra
            </button>
          )}
        >
          <div className="space-y-3">
            <div className="rounded-xl bg-shalom-mist/70 p-3 text-sm dark:bg-white/10">
              <p className="font-semibold">Como calculamos</p>
              <p className="mission-muted mt-1">
                O uso medio diario e o total vendido nos ultimos 14 dias dividido por 14. A sugestao completa o estoque ate o maior valor entre duas vezes o estoque minimo e sete dias de uso medio, descontando o estoque atual e arredondando para cima.
              </p>
            </div>
            {suggestions.length ? (
              <div className="space-y-3">
                {suggestions.map((item) => (
                  <article key={item.id} className="mission-card p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="mission-muted text-sm">{item.category}{item.supplier ? ` - ${item.supplier}` : ''}</p>
                      </div>
                      <StatusPill status={item.status} />
                    </div>
                    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                      <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                        <dt className="mission-muted">Estoque atual</dt>
                        <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.stock_quantity, item.unit)}</dd>
                      </div>
                      <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                        <dt className="mission-muted">Minimo</dt>
                        <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.min_stock, item.unit)}</dd>
                      </div>
                      <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                        <dt className="mission-muted">Uso medio</dt>
                        <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.avg_daily_usage, item.unit)}/dia</dd>
                      </div>
                      <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                        <dt className="mission-muted">Comprar</dt>
                        <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.suggested_purchase, item.unit)}</dd>
                      </div>
                    </dl>
                    <p className="mission-muted mt-3 text-sm">Previsao de ruptura: {formatDays(item.days_to_out)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-line/80 bg-white/70 p-4 text-sm dark:border-shalom-gold/10 dark:bg-white/10">
                Nenhuma compra sugerida no momento.
              </div>
            )}
          </div>
        </DashboardModal>
      ) : null}

      {activeModal === 'pendingPayments' ? (
        <DashboardModal
          title="Pagamentos pendentes"
          description="Vendas registradas como pendentes, com cliente e observacoes para acompanhamento."
          onClose={() => setActiveModal('')}
        >
          {pendingPaymentMessage ? <p className="mb-3 rounded-xl bg-shalom-cream/70 px-3 py-2 text-sm text-shalom-deep dark:bg-white/10 dark:text-shalom-gold">{pendingPaymentMessage}</p> : null}
          {pendingPayments.length ? (
            <div className="space-y-3">
              {pendingPayments.map((item) => (
                <article key={item.id} className="mission-card p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{item.customer_name}</p>
                      <p className="mission-muted text-sm">
                        Venda #{item.id} - {formatDateTime(item.created_at)}
                      </p>
                    </div>
                    <strong className="text-shalom-wine dark:text-rose-100">{money.format(item.total)}</strong>
                  </div>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                      <dt className="mission-muted">Operador</dt>
                      <dd className="mt-1 font-semibold">{item.sold_by_name || '-'}</dd>
                    </div>
                    <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                      <dt className="mission-muted">Evento</dt>
                      <dd className="mt-1 font-semibold">{item.event_name || '-'}</dd>
                    </div>
                    <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                      <dt className="mission-muted">Observacoes</dt>
                      <dd className="mt-1 font-semibold whitespace-pre-wrap">{item.notes || '-'}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="text-sm font-medium">
                      Metodo de pagamento
                      <select
                        className="mission-input mt-1 w-full px-3 py-2"
                        value={pendingPaymentMethods[item.id] || ''}
                        onChange={(event) => setPendingPaymentMethods((current) => ({ ...current, [item.id]: event.target.value }))}
                      >
                        <option value="">Selecione</option>
                        {confirmedPaymentMethods.map((method) => (
                          <option key={method} value={method}>{getPaymentLabel(method)}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="mission-btn mission-btn-primary flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => confirmPendingPayment(item.id)}
                      disabled={!pendingPaymentMethods[item.id] || pendingPaymentConfirming === String(item.id)}
                    >
                      <Banknote size={16} />
                      {pendingPaymentConfirming === String(item.id) ? 'Confirmando...' : 'Marcar como pago'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-line/80 bg-white/70 p-4 text-sm dark:border-shalom-gold/10 dark:bg-white/10">
              Nenhum pagamento pendente.
            </div>
          )}
        </DashboardModal>
      ) : null}

      {activeModal === 'lowStock' ? (
        <DashboardModal
          title="Estoque baixo"
          description="Produtos ativos com quantidade atual abaixo ou igual ao estoque minimo."
          onClose={() => setActiveModal('')}
          footer={(
            <button
              type="button"
              className="mission-btn mission-btn-primary flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold sm:w-auto"
              onClick={() => openProducts({ action: 'viewStock', status: 'low' })}
            >
              <Boxes size={17} />
              Ver estoque
            </button>
          )}
        >
          {lowStockProducts.length ? (
            <div className="space-y-3">
              {lowStockProducts.map((item) => (
                <article key={item.id} className="mission-card p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="mission-muted text-sm">{item.category} - {item.internal_code}</p>
                    </div>
                    <StatusPill status={item.status} />
                  </div>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                      <dt className="mission-muted">Atual</dt>
                      <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.stock_quantity, item.unit)}</dd>
                    </div>
                    <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                      <dt className="mission-muted">Minimo</dt>
                      <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.min_stock, item.unit)}</dd>
                    </div>
                    <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                      <dt className="mission-muted">Fornecedor</dt>
                      <dd className="mt-1 font-semibold">{item.supplier || '-'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-line/80 bg-white/70 p-4 text-sm dark:border-shalom-gold/10 dark:bg-white/10">
              Nenhum produto abaixo do estoque minimo.
            </div>
          )}
        </DashboardModal>
      ) : null}

      {activeModal === 'expiration' ? (
        <DashboardModal
          title="Alertas de validade"
          description="Produtos com estoque vencido, proximo do vencimento ou sem validade cadastrada."
          onClose={() => setActiveModal('')}
        >
          {expirationAlerts.length ? (
            <div className="space-y-3">
              {expirationAlerts.map((item) => (
                <article key={`${item.id}-${item.batch_id || 'produto'}`} className="mission-card p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="mission-muted text-sm">{item.category} - {item.internal_code}{item.batch_id ? ` - Lote #${item.batch_id}` : ''}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                      item.expiration_status === 'expired'
                        ? 'bg-shalom-wine/10 text-shalom-wine ring-shalom-wine/25 dark:bg-shalom-wine/25 dark:text-rose-100'
                        : item.expiration_status === 'critical'
                          ? 'bg-shalom-orange/15 text-shalom-wine ring-shalom-orange/25 dark:bg-shalom-orange/20 dark:text-shalom-gold'
                          : 'bg-shalom-gold/35 text-shalom-deep ring-shalom-orange/20 dark:bg-shalom-gold/20 dark:text-shalom-gold'
                    }`}
                    >
                      {validityLabel(item)}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                      <dt className="mission-muted">Validade</dt>
                      <dd className="mt-1 font-semibold">{formatDate(item.expiration_date)}</dd>
                    </div>
                    <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                      <dt className="mission-muted">Estoque</dt>
                      <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.stock_quantity, item.unit)}</dd>
                    </div>
                    <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                      <dt className="mission-muted">Fornecedor</dt>
                      <dd className="mt-1 font-semibold">{item.supplier || '-'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-line/80 bg-white/70 p-4 text-sm dark:border-shalom-gold/10 dark:bg-white/10">
              Nenhum produto vencido ou proximo do vencimento.
            </div>
          )}

          {missingExpirationProducts.length ? (
            <div className="mt-4">
              <h3 className="font-display text-base font-semibold">Sem validade cadastrada</h3>
              <div className="mt-3 space-y-2">
                {missingExpirationProducts.map((item) => (
                  <div key={item.id} className="flex flex-col gap-1 rounded-xl bg-shalom-mist/70 p-3 text-sm dark:bg-white/10 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-semibold">{item.name}</span>
                    <span className="mission-muted">{formatQuantityWithUnit(item.stock_quantity, item.unit)} em estoque</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DashboardModal>
      ) : null}
    </div>
  )
}
