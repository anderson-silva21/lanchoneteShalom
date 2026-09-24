import {
  Boxes,
  CalendarPlus,
  ChevronRight,
  ExternalLink,
  PackagePlus,
  Pencil,
  Save
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
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
import { decimal, formatDate, formatQuantityWithUnit, money } from '../utils/formatters'
import { BackToDashboard } from './BackToDashboard'
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

function validityLabel(item) {
  if (item.expiration_status === 'expired') return `Vencido ha ${Math.abs(Number(item.days_to_expire || 0))} dias`
  if (Number(item.days_to_expire) === 0) return 'Vence hoje'
  return `Vence em ${decimal.format(item.days_to_expire)} dias`
}

function DashboardMetric({ label, value, detail }) {
  return (
    <div className="min-w-0 border-l-2 border-shalom-blue/20 py-1 pl-3 dark:border-shalom-gold/25">
      <dt className="mission-muted text-xs font-medium">{label}</dt>
      <dd className="mt-1 min-w-0 break-words font-display text-xl font-semibold leading-tight text-shalom-deep dark:text-white sm:text-2xl">{value}</dd>
      {detail ? <p className="mission-muted mt-1 truncate text-xs">{detail}</p> : null}
    </div>
  )
}

function DashboardActionRow({ label, detail, value, critical = false, to }) {
  return (
    <Link className="group flex min-h-14 w-full items-center gap-3 border-b border-line/70 py-2.5 text-left transition-colors hover:text-shalom-blue dark:border-shalom-gold/10 dark:hover:text-shalom-gold" to={to} state={{ from: '/dashboard' }}>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-semibold">{label}</strong>
        <span className="mission-muted block truncate text-xs">{detail}</span>
      </span>
      <span className={`shrink-0 text-sm font-semibold ${critical ? 'text-shalom-wine dark:text-rose-200' : 'text-shalom-deep dark:text-slate-100'}`}>{value}</span>
      <ChevronRight className="shrink-0 opacity-40 transition-transform group-hover:translate-x-0.5" size={18} aria-hidden="true" />
    </Link>
  )
}

function DashboardPage({ description, children, footer }) {
  return (
    <section className="mx-auto w-full max-w-5xl pb-4">
      {description ? <p className="mission-muted border-b border-line/70 pb-4 text-sm dark:border-shalom-gold/10">{description}</p> : null}
      <div className="py-4">{children}</div>
      <div className="flex flex-col items-start gap-2 border-t border-line/80 pt-3 dark:border-shalom-gold/10 sm:flex-row sm:items-center sm:justify-between">
        {footer}
        <BackToDashboard className={footer ? '' : 'sm:ml-auto'} />
      </div>
    </section>
  )
}

export function Dashboard({ refreshKey, onNavigateToProducts, user }) {
  const location = useLocation()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [eventDraft, setEventDraft] = useState(createEmptyEventDraft)
  const [eventSaving, setEventSaving] = useState(false)
  const [eventMessage, setEventMessage] = useState('')
  const [registeredEvent, setRegisteredEvent] = useState(null)
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [editingEventId, setEditingEventId] = useState('')
  const [eventEditDraft, setEventEditDraft] = useState(createEmptyEventDraft)
  const [eventUpdatingId, setEventUpdatingId] = useState('')
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

  function openProducts(intent) {
    onNavigateToProducts?.(intent)
  }

  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    try {
      const eventData = await api.events()
      setEvents(eventData)
    } catch (err) {
      setEventMessage(err.message)
    } finally {
      setEventsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (location.pathname === '/dashboard/eventos') loadEvents()
  }, [loadEvents, location.pathname])

  function openEventModal() {
    setEventDraft(createEmptyEventDraft())
    setEventMessage('')
    setRegisteredEvent(null)
    setEditingEventId('')
  }

  async function registerEvent(event) {
    event.preventDefault()
    setEventSaving(true)
    setEventMessage('')
    setRegisteredEvent(null)

    try {
      const created = await api.createEvent(eventDraft)
      setRegisteredEvent(created)
      await loadEvents()
      setReloadKey((key) => key + 1)
    } catch (err) {
      setEventMessage(err.message)
    } finally {
      setEventSaving(false)
    }
  }

  function startEditingEvent(item) {
    setEventMessage('')
    setRegisteredEvent(null)
    setEditingEventId(String(item.id))
    setEventEditDraft({
      name: item.name,
      event_date: item.event_date,
      notes: item.notes || ''
    })
  }

  async function saveEventEdit(formEvent) {
    formEvent.preventDefault()
    setEventUpdatingId(editingEventId)
    setEventMessage('')
    setRegisteredEvent(null)

    try {
      const updated = await api.updateEvent(editingEventId, eventEditDraft)
      setRegisteredEvent(updated)
      setEditingEventId('')
      await loadEvents()
      setReloadKey((key) => key + 1)
    } catch (err) {
      setEventMessage(err.message)
    } finally {
      setEventUpdatingId('')
    }
  }

  if (error) {
    return (
      <div className="border-l-2 border-shalom-wine py-1 pl-4 text-shalom-wine dark:text-rose-100" role="alert">
        <p className="font-semibold">Nao foi possivel carregar a dashboard.</p>
        <p className="mt-1 text-sm">{error}</p>
        <button type="button" className="mission-btn mission-btn-primary mt-4 px-4 py-2 text-sm font-semibold" onClick={() => setReloadKey((key) => key + 1)}>
          Tentar novamente
        </button>
      </div>
    )
  }

  if (loading || !data) {
    return <p className="mission-muted py-6 text-sm" role="status">Carregando dashboard...</p>
  }

  const suggestions = data.purchase_suggestions || []
  const lowStockProducts = data.low_stock_products || []
  const expirationAlerts = data.expiration_alerts || []
  const missingExpirationProducts = data.missing_expiration_products || []
  const eventRevenue = data.event_revenue || []
  const canOpenTelegramGroup = user?.role === 'finance' && data.telegram_group_url
  const eventNameOptions = Array.from(new Set(events.map((event) => event.name).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  const isDashboardHome = location.pathname === '/dashboard' || location.pathname === '/'

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-7 pb-4">
      {isDashboardHome ? <>
      <section aria-labelledby="dashboard-summary-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="dashboard-summary-title" className="font-display text-lg font-semibold">Hoje</h2>
            <p className="mission-muted text-sm">Resumo da operacao</p>
          </div>
          {canOpenTelegramGroup ? (
            <a
              className="inline-flex min-h-11 items-center justify-center gap-2 px-2 text-sm font-semibold text-shalom-blue hover:text-shalom-orange dark:text-shalom-gold"
              href={data.telegram_group_url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} />
              <span className="hidden sm:inline">Grupo do Telegram</span>
            </a>
          ) : null}
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-5 min-[350px]:grid-cols-2 lg:grid-cols-4 lg:gap-x-6">
          <DashboardMetric label="Faturamento" value={money.format(data.kpis.revenue_today)} detail="Total vendido hoje" />
          <DashboardMetric label="Vendas" value={decimal.format(data.kpis.sales_today)} detail="Vendas concluidas" />
          <DashboardMetric label="Ticket medio" value={money.format(data.kpis.average_ticket_today)} detail="Media por venda" />
          <DashboardMetric label="Lucro estimado" value={money.format(data.kpis.estimated_profit_today)} detail="Baseado em custo" />
        </dl>
      </section>

      <section className="grid gap-7 border-t border-line/80 pt-6 dark:border-shalom-gold/10 lg:grid-cols-2 lg:gap-10" aria-label="Pendencias e estoque">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">Pendencias</h2>
          <div className="mt-2">
            <DashboardActionRow
              label="Estoque baixo"
              detail={`${data.kpis.critical_stock_count} criticos`}
              value={decimal.format(data.kpis.low_stock_count)}
              critical={Boolean(data.kpis.critical_stock_count)}
              to="/dashboard/estoque-baixo"
            />
            <DashboardActionRow
              label="Sugestoes de compra"
              detail="Compras indicadas"
              value={decimal.format(suggestions.length)}
              to="/dashboard/sugestoes-compra"
            />
            <DashboardActionRow
              label="Validades em atencao"
              detail={`${data.kpis.expired_count} vencidos`}
              value={decimal.format(data.kpis.validity_attention_count)}
              critical={Boolean(data.kpis.expired_count)}
              to="/dashboard/validades"
            />
            <DashboardActionRow
              label="Pagamentos pendentes"
              detail={money.format(data.kpis.pending_payment_total || 0)}
              value={decimal.format(data.kpis.pending_payment_count || 0)}
              critical={Boolean(data.kpis.pending_payment_count)}
              to="/financeiro/pagamentos-pendentes"
            />
          </div>
        </div>

        <div className="min-w-0 lg:border-l lg:border-line/80 lg:pl-10 dark:lg:border-shalom-gold/10">
          <h2 className="font-display text-lg font-semibold">Estoque em atencao</h2>
          <div className="mt-2 divide-y divide-line/70 dark:divide-shalom-gold/10">
            {data.alerts.slice(0, 6).map((item) => (
              <div key={item.id} className="flex min-h-14 items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="mission-muted truncate text-xs">
                    {formatQuantityWithUnit(item.stock_quantity, item.unit)} em estoque
                  </p>
                </div>
                <StatusPill status={item.status} />
              </div>
            ))}
            {!data.alerts.length ? <p className="mission-muted py-4 text-sm">Nenhum alerta de estoque.</p> : null}
          </div>
        </div>
      </section>

      <section className="border-t border-line/80 pt-6 dark:border-shalom-gold/10" aria-labelledby="dashboard-performance-title">
        <h2 id="dashboard-performance-title" className="font-display text-lg font-semibold">Desempenho</h2>
        <div className="mt-4 grid min-w-0 gap-7 xl:grid-cols-2 xl:gap-10">
          <div className="min-w-0">
            <h3 className="font-semibold">Vendas por periodo</h3>
            <p className="mission-muted text-sm">Faturamento e lucro</p>
            <div className="mt-3 h-60 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.sales_by_day}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7DFCD" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} width={46} fontSize={12} />
                  <Tooltip formatter={(value) => money.format(value)} />
                  <Legend />
                  <Area type="monotone" name="Faturamento" dataKey="revenue" stroke="#184E7F" fill="#184E7F18" strokeWidth={2.4} />
                  <Area type="monotone" name="Lucro" dataKey="profit" stroke="#F27C23" fill="#F27C2314" strokeWidth={2.4} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="min-w-0 xl:border-l xl:border-line/80 xl:pl-10 dark:xl:border-shalom-gold/10">
            <h3 className="font-semibold">Mais vendidos</h3>
            <p className="mission-muted text-sm">Produtos com maior saida</p>
            <div className="mt-3 h-60 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.top_products} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E7DFCD" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={108} tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip formatter={(value) => decimal.format(value)} />
                  <Bar dataKey="quantity" fill="#184E7F" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-7 border-t border-line/80 pt-6 dark:border-shalom-gold/10 xl:grid-cols-2 xl:gap-10" aria-label="Operacao de estoque">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">Saidas de estoque</h2>
          <p className="mission-muted text-sm">8 produtos mais consumidos nos ultimos 14 dias, incluindo combos</p>
          <div className="mt-3 h-60 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stock_consumption} layout="vertical" margin={{ left: 8, right: 18 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E7DFCD" />
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis dataKey="name" type="category" width={108} tickLine={false} axisLine={false} fontSize={12} />
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

        <div className="min-w-0 xl:border-l xl:border-line/80 xl:pl-10 dark:xl:border-shalom-gold/10">
          <h2 className="font-display text-lg font-semibold">Produtos parados</h2>
          <p className="mission-muted text-sm">6 produtos com menos vendas diretas nos ultimos 30 dias</p>
          <div className="mt-3 divide-y divide-line/70 dark:divide-shalom-gold/10">
            {data.slow_products.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="mission-muted truncate text-xs">{item.category}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold">{decimal.format(item.sold_quantity)} vendidos</span>
              </div>
            ))}
            {!data.slow_products.length ? <p className="mission-muted py-4 text-sm">Nenhum produto para exibir.</p> : null}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-7 border-t border-line/80 pt-6 dark:border-shalom-gold/10 xl:grid-cols-2 xl:gap-10" aria-label="Receitas detalhadas">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">Receita por categoria</h2>
          <div className="mt-3 h-60 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.category_revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7DFCD" />
                <XAxis dataKey="category" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={44} />
                <Tooltip formatter={(value) => money.format(value)} />
                <Bar dataKey="revenue" name="Faturamento" fill="#184E7F" radius={[8, 8, 0, 0]} />
                <Bar dataKey="profit" name="Lucro" fill="#F27C23" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 xl:border-l xl:border-line/80 xl:pl-10 dark:xl:border-shalom-gold/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold">Receita por evento</h2>
              <p className="mission-muted text-sm">Faturamento das vendas vinculadas a cada evento neste ano</p>
            </div>
            <Link to="/dashboard/eventos" state={{ from: '/dashboard' }} className="mission-btn mission-btn-primary flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-semibold" onClick={openEventModal}>
              <CalendarPlus size={17} />
              Registrar
            </Link>
          </div>
          <div className="mt-3 h-60 sm:h-72">
            {eventRevenue.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eventRevenue} layout="vertical" margin={{ left: 8, right: 96 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E7DFCD" />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis dataKey="name" type="category" width={110} tickLine={false} axisLine={false} fontSize={12} />
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
              <div className="flex h-full flex-col items-center justify-center border-y border-line/70 py-6 text-center dark:border-shalom-gold/10">
                <p className="font-semibold">Nenhuma receita por evento encontrada.</p>
                <p className="mission-muted mt-1 text-sm">Vincule um evento ao registrar vendas no PDV.</p>
                <button type="button" className="mt-3 min-h-11 px-3 text-sm font-semibold text-shalom-blue dark:text-shalom-gold" onClick={() => setReloadKey((key) => key + 1)}>
                  Atualizar dados
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
      </> : null}

      {location.pathname === '/dashboard/eventos' ? (
        <DashboardPage
          description="Todas as vendas realizadas nesta data serao vinculadas automaticamente ao evento."
        >
          <form className="space-y-4" onSubmit={registerEvent}>
            <label className="block text-sm font-medium">
              Usar nome existente
              <select
                className="mission-input mt-2 w-full px-3 py-2.5"
                value={eventNameOptions.includes(eventDraft.name) ? eventDraft.name : ''}
                onChange={(event) => setEventDraft((current) => ({ ...current, name: event.target.value }))}
              >
                <option value="">Novo nome</option>
                {eventNameOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
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

            {eventMessage ? <p className="border-l-2 border-shalom-wine px-3 py-1 text-sm text-shalom-wine dark:text-rose-100">{eventMessage}</p> : null}

            {registeredEvent ? (
              <div className="border-l-2 border-emerald-500 px-3 py-1 text-sm">
                <p className="font-semibold">Evento {registeredEvent.reassigned_sales !== undefined ? 'atualizado' : 'registrado'} para {formatDate(registeredEvent.event_date)}.</p>
                <p className="mission-muted mt-1">
                  {registeredEvent.assigned_sales} vendas vinculadas, totalizando {money.format(registeredEvent.assigned_revenue)}.
                </p>
                {registeredEvent.unassigned_sales ? (
                  <p className="mission-muted mt-1">{registeredEvent.unassigned_sales} vendas da data anterior foram desvinculadas.</p>
                ) : null}
              </div>
            ) : null}

            <button type="submit" className="mission-btn mission-btn-primary flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold sm:w-auto" disabled={eventSaving}>
              <CalendarPlus size={18} />
              {eventSaving ? 'Registrando...' : 'Registrar evento'}
            </button>
          </form>

          <div className="mt-5 border-t border-line/80 pt-4 dark:border-shalom-gold/10">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-display text-base font-semibold">Eventos cadastrados</h3>
              <button type="button" className="mission-btn border border-line/80 px-3 py-2 text-sm font-semibold hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10" onClick={loadEvents} disabled={eventsLoading}>
                Atualizar
              </button>
            </div>

            {eventsLoading ? (
              <p className="mission-muted py-4 text-sm">Carregando eventos...</p>
            ) : events.length ? (
              <div className="divide-y divide-line/70 dark:divide-shalom-gold/10">
                {events.map((item) => (
                  editingEventId === String(item.id) ? (
                    <form key={item.id} className="space-y-3 py-4" onSubmit={saveEventEdit}>
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                        <label className="text-sm font-medium">
                          Nome
                          <input
                            className="mission-input mt-1 w-full px-3 py-2"
                            value={eventEditDraft.name}
                            onChange={(event) => setEventEditDraft((current) => ({ ...current, name: event.target.value }))}
                            required
                          />
                        </label>
                        <label className="text-sm font-medium">
                          Data
                          <input
                            className="mission-input mt-1 w-full px-3 py-2"
                            type="date"
                            value={eventEditDraft.event_date}
                            onChange={(event) => setEventEditDraft((current) => ({ ...current, event_date: event.target.value }))}
                            required
                          />
                        </label>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          className="mission-btn border border-line/80 px-3 py-2 text-sm font-semibold hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10"
                          onClick={() => setEditingEventId('')}
                          disabled={eventUpdatingId === String(item.id)}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="mission-btn mission-btn-primary flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold"
                          disabled={eventUpdatingId === String(item.id)}
                        >
                          <Save size={16} />
                          {eventUpdatingId === String(item.id) ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <article key={item.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{item.name}</p>
                          <p className="mission-muted text-sm">{formatDate(item.event_date)} - {item.assigned_sales || 0} vendas - {money.format(item.assigned_revenue || 0)}</p>
                        </div>
                        <button
                          type="button"
                          className="mission-btn shrink-0 border border-line/80 p-2 hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10"
                          onClick={() => startEditingEvent(item)}
                          title="Editar evento"
                          aria-label={`Editar evento ${item.name}`}
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    </article>
                  )
                ))}
              </div>
            ) : (
              <p className="mission-muted py-4 text-sm">Nenhum evento registrado.</p>
            )}
          </div>
        </DashboardPage>
      ) : null}

      {location.pathname === '/dashboard/sugestoes-compra' ? (
        <DashboardPage
          description="Itens com reposicao recomendada com base no estoque minimo e no consumo recente."
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
          <div>
            <div className="border-y border-line/70 py-3 text-sm dark:border-shalom-gold/10">
              <p className="font-semibold">Como calculamos</p>
              <p className="mission-muted mt-1">
                O uso medio diario e o total vendido nos ultimos 14 dias dividido por 14. A sugestao completa o estoque ate o maior valor entre duas vezes o estoque minimo e sete dias de uso medio, descontando o estoque atual e arredondando para cima.
              </p>
            </div>
            {suggestions.length ? (
              <div className="mt-3 divide-y divide-line/70 dark:divide-shalom-gold/10">
                {suggestions.map((item) => (
                  <article key={item.id} className="py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="mission-muted text-sm">{item.category}{item.supplier ? ` - ${item.supplier}` : ''}</p>
                      </div>
                      <StatusPill status={item.status} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                      <div className="border-l-2 border-shalom-blue/15 pl-2 dark:border-shalom-gold/20">
                        <dt className="mission-muted">Estoque atual</dt>
                        <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.stock_quantity, item.unit)}</dd>
                      </div>
                      <div className="border-l-2 border-shalom-blue/15 pl-2 dark:border-shalom-gold/20">
                        <dt className="mission-muted">Minimo</dt>
                        <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.min_stock, item.unit)}</dd>
                      </div>
                      <div className="border-l-2 border-shalom-blue/15 pl-2 dark:border-shalom-gold/20">
                        <dt className="mission-muted">Uso medio</dt>
                        <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.avg_daily_usage, item.unit)}/dia</dd>
                      </div>
                      <div className="border-l-2 border-shalom-blue/15 pl-2 dark:border-shalom-gold/20">
                        <dt className="mission-muted">Comprar</dt>
                        <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.suggested_purchase, item.unit)}</dd>
                      </div>
                    </dl>
                    <p className="mission-muted mt-3 text-sm">Previsao de ruptura: {formatDays(item.days_to_out)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mission-muted py-4 text-sm">Nenhuma compra sugerida no momento.</p>
            )}
          </div>
        </DashboardPage>
      ) : null}

      {location.pathname === '/dashboard/estoque-baixo' ? (
        <DashboardPage
          description="Produtos ativos com quantidade atual abaixo ou igual ao estoque minimo."
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
            <div className="divide-y divide-line/70 dark:divide-shalom-gold/10">
              {lowStockProducts.map((item) => (
                <article key={item.id} className="py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="mission-muted text-sm">{item.category} - {item.internal_code}</p>
                    </div>
                    <StatusPill status={item.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                    <div className="border-l-2 border-shalom-blue/15 pl-2 dark:border-shalom-gold/20">
                      <dt className="mission-muted">Atual</dt>
                      <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.stock_quantity, item.unit)}</dd>
                    </div>
                    <div className="border-l-2 border-shalom-blue/15 pl-2 dark:border-shalom-gold/20">
                      <dt className="mission-muted">Minimo</dt>
                      <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.min_stock, item.unit)}</dd>
                    </div>
                    <div className="border-l-2 border-shalom-blue/15 pl-2 dark:border-shalom-gold/20">
                      <dt className="mission-muted">Fornecedor</dt>
                      <dd className="mt-1 font-semibold">{item.supplier || '-'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <p className="mission-muted py-4 text-sm">Nenhum produto abaixo do estoque minimo.</p>
          )}
        </DashboardPage>
      ) : null}

      {location.pathname === '/dashboard/validades' ? (
        <DashboardPage
          description="Produtos com estoque vencido, proximo do vencimento ou sem validade cadastrada."
        >
          {expirationAlerts.length ? (
            <div className="divide-y divide-line/70 dark:divide-shalom-gold/10">
              {expirationAlerts.map((item) => (
                <article key={`${item.id}-${item.batch_id || 'produto'}`} className="py-4">
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
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                    <div className="border-l-2 border-shalom-blue/15 pl-2 dark:border-shalom-gold/20">
                      <dt className="mission-muted">Validade</dt>
                      <dd className="mt-1 font-semibold">{formatDate(item.expiration_date)}</dd>
                    </div>
                    <div className="border-l-2 border-shalom-blue/15 pl-2 dark:border-shalom-gold/20">
                      <dt className="mission-muted">Estoque</dt>
                      <dd className="mt-1 font-semibold">{formatQuantityWithUnit(item.stock_quantity, item.unit)}</dd>
                    </div>
                    <div className="border-l-2 border-shalom-blue/15 pl-2 dark:border-shalom-gold/20">
                      <dt className="mission-muted">Fornecedor</dt>
                      <dd className="mt-1 font-semibold">{item.supplier || '-'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <p className="mission-muted py-4 text-sm">Nenhum produto vencido ou proximo do vencimento.</p>
          )}

          {missingExpirationProducts.length ? (
            <div className="mt-4">
              <h3 className="font-display text-base font-semibold">Sem validade cadastrada</h3>
              <div className="mt-2 divide-y divide-line/70 dark:divide-shalom-gold/10">
                {missingExpirationProducts.map((item) => (
                  <div key={item.id} className="flex min-h-14 flex-col justify-center gap-1 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-semibold">{item.name}</span>
                    <span className="mission-muted">{formatQuantityWithUnit(item.stock_quantity, item.unit)} em estoque</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DashboardPage>
      ) : null}
    </div>
  )
}
