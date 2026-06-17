import { DatabaseZap, KeyRound, Moon, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
import { decimal } from '../utils/formatters'

export function SettingsView({ user, darkMode, setDarkMode, onChanged = () => {} }) {
  const [status, setStatus] = useState(null)
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [resetting, setResetting] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.setupStatus())
    } catch (err) {
      setMessage(err.message)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  async function resetOperationalData(event) {
    event.preventDefault()
    setMessage('')
    setResetting(true)
    try {
      const result = await api.resetOperationalData({ confirmation })
      setStatus(result.status)
      setConfirmation('')
      onChanged()
      setMessage(result.message)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setResetting(false)
    }
  }

  const counts = status?.counts || {}
  const items = [
    { icon: ShieldCheck, label: 'Perfil', value: user?.role || '-' },
    { icon: KeyRound, label: 'Sessao', value: user?.username || '-' },
    { icon: DatabaseZap, label: 'Produtos', value: decimal.format(counts.products || 0) },
    { icon: Smartphone, label: 'PWA', value: 'Instalavel' }
  ]

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="mission-panel p-4">
        <h2 className="font-display text-lg font-semibold">Sistema</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="mission-card p-4">
                <Icon size={20} />
                <p className="mission-muted mt-3 text-sm">{item.label}</p>
                <strong className="mt-1 block">{item.value}</strong>
              </div>
            )
          })}
        </div>
      </section>

      <aside className="mission-panel p-4">
        <h2 className="font-display text-lg font-semibold">Preferencias</h2>
        <button
          className="mission-btn mt-4 flex w-full items-center justify-between border border-shalom-gold/30 px-4 py-3 font-medium dark:border-shalom-gold/10"
          onClick={() => setDarkMode(!darkMode)}
        >
          <span className="flex items-center gap-2">
            <Moon size={18} />
            Modo escuro
          </span>
          <span className={`h-6 w-11 rounded-full p-1 transition ${darkMode ? 'bg-shalom-gold' : 'bg-shalom-blue/25'}`}>
            <span className={`block h-4 w-4 rounded-full bg-white transition ${darkMode ? 'translate-x-5' : ''}`} />
          </span>
        </button>
      </aside>

      <section className="mission-panel p-4 xl:col-span-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Base de dados</h2>
            <p className="mission-muted text-sm">Remove dados operacionais e mantem os usuarios de acesso.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="mission-card px-3 py-2">
              <span className="mission-muted block text-xs">Lotes</span>
              <strong>{decimal.format(counts.stock_batches || 0)}</strong>
            </div>
            <div className="mission-card px-3 py-2">
              <span className="mission-muted block text-xs">Vendas</span>
              <strong>{decimal.format(counts.sales || 0)}</strong>
            </div>
            <div className="mission-card px-3 py-2">
              <span className="mission-muted block text-xs">Movimentos</span>
              <strong>{decimal.format(counts.inventory_movements || 0)}</strong>
            </div>
          </div>
        </div>

        <form className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]" onSubmit={resetOperationalData}>
          <label className="text-sm font-medium">
            Confirmacao
            <input
              className="mission-input mt-1 w-full px-3 py-2"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="APAGAR"
            />
          </label>
          <button
            type="submit"
            className="mission-btn flex items-center justify-center gap-2 border border-shalom-wine/35 px-4 py-3 font-semibold text-shalom-wine hover:bg-shalom-wine/10 disabled:cursor-not-allowed disabled:opacity-55 dark:border-rose-200/20 dark:text-rose-100 dark:hover:bg-rose-400/10 lg:self-end"
            disabled={confirmation !== 'APAGAR' || resetting}
          >
            <Trash2 size={17} />
            {resetting ? 'Limpando...' : 'Zerar dados'}
          </button>
        </form>
        {message ? <p className="mt-4 rounded-2xl bg-shalom-cream/70 px-4 py-3 text-sm text-shalom-deep shadow-sm dark:bg-white/10 dark:text-shalom-gold">{message}</p> : null}
      </section>
    </div>
  )
}
