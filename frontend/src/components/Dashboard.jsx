import {
  AlertTriangle,
  Banknote,
  Boxes,
  CalendarClock,
  LineChart,
  PackagePlus,
  ReceiptText,
  TrendingUp,
  X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { api } from '../services/api'
import { decimal, formatDate, formatQuantityWithUnit, money } from '../utils/formatters'
import { MetricCard } from './MetricCard'
import { StatusPill } from './StatusPill'

const chartColors = ['#142F53', '#184E7F', '#FAE088', '#F27C23', '#7A1E2D', '#A8B8C8']

function formatDays(value) {
  if (!value && value !== 0) return 'Sem consumo recente'
  if (value < 1) return 'Menos de 1 dia'
  return `${decimal.format(value)} dias`
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

export function Dashboard({ refreshKey, onNavigateToProducts }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeModal, setActiveModal] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

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

  return (
    <div className="space-y-5">
      <section className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7">
        <MetricCard icon={Banknote} label="Faturamento hoje" value={money.format(data.kpis.revenue_today)} detail={`${data.kpis.sales_today} vendas`} tone="green" />
        <MetricCard icon={ReceiptText} label="Ticket medio" value={money.format(data.kpis.average_ticket_today)} detail="Media do dia" tone="blue" />
        <MetricCard icon={TrendingUp} label="Lucro estimado" value={money.format(data.kpis.estimated_profit_today)} detail="Baseado em custo" />
        <MetricCard
          icon={AlertTriangle}
          label="Estoque baixo"
          value={data.kpis.low_stock_count}
          detail={`${data.kpis.critical_stock_count} criticos`}
          tone={data.kpis.critical_stock_count ? 'red' : 'amber'}
          onClick={() => setActiveModal('lowStock')}
          ariaLabel="Abrir produtos com estoque baixo"
        />
        <MetricCard icon={LineChart} label="Produtos top" value={data.top_products[0]?.name || '-'} detail={data.top_products[0] ? `${decimal.format(data.top_products[0].quantity)} vendidos` : 'Sem vendas'} />
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

        <div className="mission-panel p-4">
          <h2 className="font-display text-lg font-semibold">Consumo de estoque</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.stock_consumption} dataKey="quantity" nameKey="name" innerRadius={54} outerRadius={92} paddingAngle={2}>
                  {data.stock_consumption.map((entry, index) => (
                    <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => decimal.format(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mission-panel p-4">
          <h2 className="font-display text-lg font-semibold">Produtos parados</h2>
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

        <div className="mission-panel p-4">
          <h2 className="font-display text-lg font-semibold">Horario de pico</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.peak_hours}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7DFCD" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip formatter={(value, name) => name === 'revenue' ? money.format(value) : value} />
                <Bar dataKey="sales" name="Vendas" fill="#FAE088" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

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
