import { DatabaseZap, KeyRound, Moon, ShieldCheck, Smartphone } from 'lucide-react'

export function SettingsView({ user, darkMode, setDarkMode }) {
  const items = [
    { icon: ShieldCheck, label: 'Perfil', value: user?.role || '-' },
    { icon: KeyRound, label: 'Sessao', value: user?.username || '-' },
    { icon: DatabaseZap, label: 'Base', value: 'SQLite central' },
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
    </div>
  )
}
