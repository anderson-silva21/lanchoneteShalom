import { useState } from 'react'
import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  LogOut,
  Moon,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  Sun,
  WalletCards
} from 'lucide-react'
import { canAccessView } from '../access'
import { BrandMark } from './BrandMark'

const navItems = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'setup', label: 'Carga inicial', icon: PackagePlus },
  { key: 'sales', label: 'PDV', icon: ReceiptText },
  { key: 'payments', label: 'Financeiro', icon: WalletCards },
  { key: 'products', label: 'Produtos', icon: Boxes },
  { key: 'inventory', label: 'Inventario', icon: ClipboardCheck },
  { key: 'sheet', label: 'Planilha', icon: FileSpreadsheet },
  { key: 'reports', label: 'Relatorios', icon: ClipboardList },
  { key: 'settings', label: 'Sistema', icon: Settings }
]

export function AppShell({ activeView, setActiveView, user, darkMode, setDarkMode, setupEnabled = false, onLogout, children }) {
  const allowedNavItems = navItems.filter((item) => canAccessView(user?.role, item.key, { setupEnabled }))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem('lanchonete_sidebar_collapsed') === 'true'
  )

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current
      window.localStorage.setItem('lanchonete_sidebar_collapsed', String(next))
      return next
    })
  }

  return (
    <div className="app-bg min-h-screen text-ink dark:text-slate-50">
      <aside
        className={`fixed inset-y-0 left-0 hidden flex-col overflow-hidden border-r border-shalom-gold/30 bg-gradient-to-b from-white via-shalom-cream/95 to-shalom-mist text-shalom-deep shadow-soft transition-[width,padding] duration-200 dark:border-shalom-gold/20 dark:from-shalom-night dark:via-[#0B2747] dark:to-shalom-night dark:text-white dark:shadow-blue lg:flex ${
          sidebarCollapsed ? 'w-[88px] px-3 py-4' : 'w-72 px-5 py-6'
        }`}
      >
        <span className="pointer-events-none absolute -left-24 top-10 h-48 w-48 rounded-full bg-shalom-gold/25 blur-3xl dark:bg-shalom-gold/10" />
        <span className="pointer-events-none absolute bottom-32 right-[-110px] h-64 w-64 rounded-full bg-shalom-orange/15 blur-3xl dark:bg-shalom-orange/10" />
        <div className={`relative mb-4 flex flex-none ${sidebarCollapsed ? 'justify-center' : 'justify-end'}`}>
          <button
            className="mission-btn flex h-10 w-10 items-center justify-center border border-shalom-gold/35 bg-white/75 text-shalom-deep shadow-sm hover:border-shalom-orange/60 hover:bg-shalom-cream dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:border-shalom-gold/60 dark:hover:bg-white/20 dark:hover:text-shalom-gold"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
        </div>

        <div
          className={`relative flex flex-none items-center rounded-2xl border border-shalom-gold/35 bg-white/75 text-shalom-deep shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-white ${
            sidebarCollapsed ? 'mb-5 justify-center p-2' : 'mb-8 gap-3 p-3'
          }`}
          title={sidebarCollapsed ? 'SH82' : undefined}
        >
          <BrandMark size={sidebarCollapsed ? 'sm' : 'md'} dark={darkMode} />
          {!sidebarCollapsed && (
            <div>
              <p className="font-display text-base font-semibold">SH82</p>
              <p className="text-xs font-semibold text-shalom-orange dark:text-shalom-gold">servir com paz e excelencia</p>
            </div>
          )}
        </div>

        {!sidebarCollapsed && (
          <div className="relative mb-6 flex-none rounded-2xl border border-shalom-gold/35 bg-white/75 p-4 text-shalom-deep shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-shalom-orange dark:text-shalom-gold">Centro missionario</p>
            <p className="mt-2 text-sm leading-6 text-shalom-deep/82 dark:text-white/90">Organizacao simples para cuidar bem de cada venda, compra e pessoa servida.</p>
          </div>
        )}

        <nav className={`scrollbar-thin relative min-h-0 flex-1 space-y-1.5 overflow-y-auto ${sidebarCollapsed ? '' : 'pr-1'}`}>
          {allowedNavItems.map((item) => {
            const Icon = item.icon
            const active = activeView === item.key
            return (
              <button
                key={item.key}
                className={`mission-btn flex w-full items-center py-3 text-sm font-semibold ${
                  sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3.5 text-left'
                } ${
                  active
                    ? 'border border-shalom-orange/30 bg-shalom-gold text-shalom-deep shadow-glow'
                    : 'border border-shalom-gold/35 bg-white/75 text-shalom-deep hover:border-shalom-orange/60 hover:bg-shalom-cream hover:text-shalom-blue dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:border-shalom-gold/60 dark:hover:bg-white/20 dark:hover:text-shalom-gold'
                }`}
                onClick={() => setActiveView(item.key)}
                title={sidebarCollapsed ? item.label : undefined}
                aria-label={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className="shrink-0" size={18} />
                {!sidebarCollapsed && item.label}
              </button>
            )
          })}
        </nav>

        <div className="relative mt-5 flex-none space-y-3">
          <div
            className={`rounded-2xl border border-shalom-gold/35 bg-white/75 text-shalom-deep shadow-sm backdrop-blur dark:border-white/20 dark:bg-white/10 dark:text-white ${
              sidebarCollapsed ? 'flex h-12 items-center justify-center p-2' : 'p-3'
            }`}
            title={sidebarCollapsed ? `${user?.name} (${user?.role})` : undefined}
          >
            {sidebarCollapsed ? (
              <span className="font-display text-base font-semibold uppercase text-shalom-orange dark:text-shalom-gold">{user?.name?.charAt(0)}</span>
            ) : (
              <>
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs font-semibold capitalize text-shalom-orange dark:text-shalom-gold">{user?.role}</p>
              </>
            )}
          </div>
          <button
            className={`mission-btn flex w-full items-center justify-center border border-shalom-gold/40 bg-white/65 py-2.5 text-sm font-semibold text-shalom-deep hover:border-shalom-orange/60 hover:bg-shalom-cream hover:text-shalom-blue dark:border-white/20 dark:bg-white/5 dark:text-white dark:hover:border-shalom-gold/50 dark:hover:bg-white/15 dark:hover:text-shalom-gold ${
              sidebarCollapsed ? 'px-2' : 'gap-2 px-3'
            }`}
            onClick={onLogout}
            title={sidebarCollapsed ? 'Sair' : undefined}
            aria-label={sidebarCollapsed ? 'Sair' : undefined}
          >
            <LogOut size={16} />
            {!sidebarCollapsed && 'Sair'}
          </button>
        </div>
      </aside>

      <div className={`transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-[88px]' : 'lg:pl-72'}`}>
        <header className="sticky top-0 z-20 border-b border-shalom-gold/30 bg-white/78 px-4 py-3 shadow-sm backdrop-blur-2xl dark:border-shalom-gold/15 dark:bg-gradient-to-r dark:from-shalom-night/95 dark:via-[#0A2443]/92 dark:to-shalom-deep/88 dark:shadow-[0_18px_52px_rgba(0,0,0,0.24)] sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-shalom-orange dark:text-shalom-gold/90 sm:text-sm">Gestao da difusao</p>
                <h1 className="font-display text-xl font-semibold text-shalom-deep dark:text-white sm:text-2xl">{allowedNavItems.find((item) => item.key === activeView)?.label}</h1>
              </div>
              <div className="flex items-center gap-2 lg:hidden">
                <div className="max-w-[42vw] rounded-2xl border border-shalom-gold/35 bg-white/75 px-3 py-2 text-right text-shalom-deep shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-white">
                  <p className="truncate text-sm font-semibold">{user?.name}</p>
                  <p className="text-xs font-semibold capitalize text-shalom-orange dark:text-shalom-gold">{user?.role}</p>
                </div>
                <button
                  className="mission-btn flex min-w-11 items-center justify-center border border-shalom-gold/40 bg-white/75 px-3 py-2 text-shalom-deep shadow-sm hover:border-shalom-orange/60 hover:bg-shalom-cream dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:border-shalom-gold/50 dark:hover:bg-white/20 dark:hover:text-shalom-gold"
                  onClick={onLogout}
                  title="Sair"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
              <div className="flex gap-1 lg:hidden">
                {allowedNavItems.map((item) => {
                  const Icon = item.icon
                  const active = activeView === item.key
                  return (
                    <button
                      key={item.key}
                      className={`mission-btn flex min-w-11 items-center justify-center px-3 py-2 text-sm font-medium ${
                        active
                          ? 'mission-btn-primary'
                          : 'border border-shalom-gold/30 bg-white/70 text-shalom-deep dark:border-shalom-gold/20 dark:bg-white/10 dark:text-slate-200'
                      }`}
                      onClick={() => setActiveView(item.key)}
                      title={item.label}
                    >
                      <Icon size={18} />
                    </button>
                  )
                })}
              </div>
              <button
                className="mission-btn flex min-w-11 items-center justify-center border border-shalom-gold/30 bg-white/70 px-3 py-2 text-shalom-deep dark:border-shalom-gold/20 dark:bg-white/10 dark:text-shalom-gold"
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? 'Modo claro' : 'Modo escuro'}
              >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>
        </header>

        <main className="animate-rise px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
