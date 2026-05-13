import {
  AlertTriangle,
  Banknote,
  Boxes,
  LineChart,
  ReceiptText,
  TrendingUp
} from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { decimal, money } from '../utils/formatters'
import { MetricCard } from './MetricCard'
import { StatusPill } from './StatusPill'

const chartColors = ['#142F53', '#184E7F', '#FAE088', '#F27C23', '#7A1E2D', '#A8B8C8']

export function Dashboard({ refreshKey }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    api.dashboard()
      .then((payload) => mounted && setData(payload))
      .catch((err) => mounted && setError(err.message))
    return () => {
      mounted = false
    }
  }, [refreshKey])

  if (error) {
    return <div className="mission-panel p-4 text-shalom-wine dark:text-rose-100">{error}</div>
  }

  if (!data) {
    return <div className="mission-panel p-6">Carregando dashboard...</div>
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard icon={Banknote} label="Faturamento hoje" value={money.format(data.kpis.revenue_today)} detail={`${data.kpis.sales_today} vendas`} tone="green" />
        <MetricCard icon={ReceiptText} label="Ticket medio" value={money.format(data.kpis.average_ticket_today)} detail="Media do dia" tone="blue" />
        <MetricCard icon={TrendingUp} label="Lucro estimado" value={money.format(data.kpis.estimated_profit_today)} detail="Baseado em custo" />
        <MetricCard icon={AlertTriangle} label="Estoque baixo" value={data.kpis.low_stock_count} detail={`${data.kpis.critical_stock_count} criticos`} tone={data.kpis.critical_stock_count ? 'red' : 'amber'} />
        <MetricCard icon={LineChart} label="Produtos top" value={data.top_products[0]?.name || '-'} detail={data.top_products[0] ? `${decimal.format(data.top_products[0].quantity)} vendidos` : 'Sem vendas'} />
        <MetricCard icon={Boxes} label="Sugestoes" value={data.purchase_suggestions.length} detail="Compras indicadas" tone="amber" />
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <div className="mission-panel p-4 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Vendas por periodo</h2>
              <p className="mission-muted text-sm">Faturamento, lucro e quantidade</p>
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
                <Tooltip formatter={(value, name) => name === 'sales' ? value : money.format(value)} />
                <Legend />
                <Area type="monotone" name="Faturamento" dataKey="revenue" stroke="#184E7F" fill="url(#revenue)" strokeWidth={2.4} />
                <Area type="monotone" name="Lucro" dataKey="profit" stroke="#F27C23" fill="#F27C2320" strokeWidth={2.4} />
                <Bar name="Vendas" dataKey="sales" fill="#FAE088" radius={[5, 5, 0, 0]} />
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
                    {decimal.format(item.stock_quantity)} {item.unit} em estoque
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
    </div>
  )
}
