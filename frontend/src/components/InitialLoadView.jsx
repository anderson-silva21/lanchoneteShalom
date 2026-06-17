import { Boxes, DatabaseZap, ReceiptText, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
import { decimal } from '../utils/formatters'
import { ProductManager } from './ProductManager'

export function InitialLoadView({ refreshKey, onChanged }) {
  const [status, setStatus] = useState(null)
  const [message, setMessage] = useState('')

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.setupStatus())
      setMessage('')
    } catch (err) {
      setMessage(err.message)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus, refreshKey])

  function handleChanged() {
    onChanged()
    loadStatus()
  }

  const counts = status?.counts || {}
  const metrics = [
    { icon: Boxes, label: 'Produtos', value: counts.products || 0 },
    { icon: DatabaseZap, label: 'Lotes', value: counts.stock_batches || 0 },
    { icon: ReceiptText, label: 'Vendas', value: counts.sales || 0 }
  ]

  return (
    <div className="space-y-5">
      <section className="mission-panel p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Carga inicial do estoque</h2>
            <p className="mission-muted text-sm">
              {status?.is_empty ? 'Base pronta para receber os itens reais.' : 'Base com dados operacionais cadastrados.'}
            </p>
          </div>
          <button
            type="button"
            className="mission-btn flex items-center justify-center gap-2 border border-line/80 px-3 py-2 text-sm font-semibold hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10"
            onClick={loadStatus}
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {metrics.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="mission-card p-4">
                <Icon size={20} />
                <p className="mission-muted mt-3 text-sm">{item.label}</p>
                <strong className="mt-1 block text-xl">{decimal.format(item.value)}</strong>
              </div>
            )
          })}
        </div>
        {message ? <p className="mt-4 rounded-2xl bg-shalom-cream/70 px-4 py-3 text-sm text-shalom-deep shadow-sm dark:bg-white/10 dark:text-shalom-gold">{message}</p> : null}
      </section>

      <ProductManager refreshKey={refreshKey} onChanged={handleChanged} setupMode />
    </div>
  )
}
