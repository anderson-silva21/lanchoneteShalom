import { useState } from 'react'
import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  LogOut,
  MoreHorizontal,
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

const roleLabels = {
  admin: 'Admin',
  manager: 'Gerente',
  finance: 'Financeiro',
  cashier: 'Caixa'
}

const mobilePrimaryLabels = {
  sales: 'Vender',
  products: 'Estoque',
  payments: 'Pagamentos'
}

const mobilePrimaryOrder = ['sales', 'products', 'payments']

export function AppShell({ activeView, setActiveView, user, darkMode, setDarkMode, setupEnabled = false, onLogout, children }) {
  const allowedNavItems = navItems.filter((item) => canAccessView(user?.role, item.key, { setupEnabled }))
  const mobilePrimaryItems = mobilePrimaryOrder
    .map((key) => allowedNavItems.find((item) => item.key === key))
    .filter(Boolean)
  const mobileSecondaryItems = allowedNavItems.filter((item) => !mobilePrimaryItems.some((primary) => primary.key === item.key))
  const isMobileMoreActive = mobileSecondaryItems.some((item) => item.key === activeView)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem('lanchonete_sidebar_collapsed') === 'true'
  )
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current
      window.localStorage.setItem('lanchonete_sidebar_collapsed', String(next))
      return next
    })
  }

  function selectView(view) {
    setActiveView(view)
    setMobileMenuOpen(false)
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
                onClick={() => selectView(item.key)}
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
                <p className="text-xs font-semibold text-shalom-orange dark:text-shalom-gold">{roleLabels[user?.role] || user?.role}</p>
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
        <header className="sticky top-0 z-20 border-b border-shalom-gold/30 bg-white/78 px-3 py-2 shadow-sm backdrop-blur-2xl dark:border-shalom-gold/15 dark:bg-gradient-to-r dark:from-shalom-night/95 dark:via-[#0A2443]/92 dark:to-shalom-deep/88 dark:shadow-[0_18px_52px_rgba(0,0,0,0.24)] sm:px-4 lg:px-8 lg:py-3">
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-shalom-orange dark:text-shalom-gold/90">SH82</p>
              <h1 className="truncate font-display text-xl font-semibold leading-tight text-shalom-deep dark:text-white">{allowedNavItems.find((item) => item.key === activeView)?.label}</h1>
            </div>
            <button
              className="mission-btn flex min-h-11 min-w-11 shrink-0 items-center justify-center border border-shalom-gold/30 bg-white/70 px-3 py-2 text-shalom-deep dark:border-shalom-gold/20 dark:bg-white/10 dark:text-shalom-gold"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? 'Modo claro' : 'Modo escuro'}
              aria-label={darkMode ? 'Modo claro' : 'Modo escuro'}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>

          <div className="hidden lg:flex lg:items-center lg:justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-shalom-orange dark:text-shalom-gold/90 sm:text-sm">Gestao da difusao</p>
                <h1 className="font-display text-xl font-semibold text-shalom-deep dark:text-white sm:text-2xl">{allowedNavItems.find((item) => item.key === activeView)?.label}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="mission-btn flex min-w-11 items-center justify-center border border-shalom-gold/30 bg-white/70 px-3 py-2 text-shalom-deep dark:border-shalom-gold/20 dark:bg-white/10 dark:text-shalom-gold"
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? 'Modo claro' : 'Modo escuro'}
                aria-label={darkMode ? 'Modo claro' : 'Modo escuro'}
              >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>
        </header>

        <main className="animate-rise h-[calc(100dvh_-_8.2rem_-_env(safe-area-inset-bottom))] min-w-0 overflow-y-auto px-3 pb-6 pt-4 scrollbar-thin sm:px-5 lg:h-auto lg:overflow-visible lg:px-8 lg:pb-5 lg:pt-5">{children}</main>
      </div>

      {mobileMenuOpen ? (
        <div className="fixed inset-x-3 bottom-[calc(5.25rem_+_env(safe-area-inset-bottom))] z-40 lg:hidden">
          <div className="mission-panel min-w-0 max-h-[calc(100dvh_-_9rem_-_env(safe-area-inset-bottom))] overflow-y-auto p-2 shadow-blue">
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <div className="min-w-0 rounded-2xl border border-shalom-gold/30 bg-white/78 p-3 text-shalom-deep dark:border-shalom-gold/20 dark:bg-white/10 dark:text-slate-100">
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <p className="text-xs font-semibold text-shalom-orange dark:text-shalom-gold">{roleLabels[user?.role] || user?.role}</p>
              </div>
              {mobileSecondaryItems.map((item) => {
                const Icon = item.icon
                const active = activeView === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`mission-btn flex min-h-12 w-full min-w-0 items-center gap-3 px-3 py-2 text-left text-sm font-semibold ${
                      active
                        ? 'mission-btn-primary'
                        : 'border border-shalom-gold/30 bg-white/78 text-shalom-deep dark:border-shalom-gold/20 dark:bg-white/10 dark:text-slate-100'
                    }`}
                    onClick={() => selectView(item.key)}
                  >
                    <Icon className="shrink-0" size={18} />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </button>
                )
              })}
              <button
                type="button"
                className="mission-btn flex min-h-12 w-full min-w-0 items-center gap-3 border border-shalom-gold/30 bg-white/78 px-3 py-2 text-left text-sm font-semibold text-shalom-deep dark:border-shalom-gold/20 dark:bg-white/10 dark:text-slate-100"
                onClick={() => setDarkMode(!darkMode)}
              >
                {darkMode ? <Sun className="shrink-0" size={18} /> : <Moon className="shrink-0" size={18} />}
                <span className="min-w-0 truncate">{darkMode ? 'Modo claro' : 'Modo escuro'}</span>
              </button>
              <button
                type="button"
                className="mission-btn flex min-h-12 w-full min-w-0 items-center gap-3 border border-shalom-wine/25 bg-white/78 px-3 py-2 text-left text-sm font-semibold text-shalom-wine dark:border-rose-200/20 dark:bg-white/10 dark:text-rose-100"
                onClick={onLogout}
              >
                <LogOut className="shrink-0" size={18} />
                <span className="min-w-0 truncate">Sair</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <nav
        className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-shalom-gold/30 bg-white/92 px-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_40px_rgba(20,47,83,0.14)] backdrop-blur-2xl dark:border-shalom-gold/15 dark:bg-shalom-night/94 lg:hidden"
        aria-label="Navegacao principal"
      >
        <div
          className="mx-auto grid max-w-lg gap-1"
          style={{ gridTemplateColumns: `repeat(${mobilePrimaryItems.length + 1}, minmax(0, 1fr))` }}
        >
          {mobilePrimaryItems.map((item) => {
            const Icon = item.icon
            const active = activeView === item.key
            return (
              <button
                key={item.key}
                type="button"
                className={`mission-btn flex min-h-[3.35rem] flex-col items-center justify-center gap-1 px-1.5 py-1.5 text-[11px] font-semibold leading-tight ${
                  active
                    ? 'mission-btn-primary'
                    : 'border border-shalom-gold/25 bg-white/78 text-shalom-deep dark:border-shalom-gold/15 dark:bg-white/10 dark:text-slate-100'
                }`}
                onClick={() => selectView(item.key)}
                aria-label={mobilePrimaryLabels[item.key] || item.label}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{mobilePrimaryLabels[item.key] || item.label}</span>
              </button>
            )
          })}

          <button
            type="button"
            className={`mission-btn flex min-h-[3.35rem] flex-col items-center justify-center gap-1 px-1.5 py-1.5 text-[11px] font-semibold leading-tight ${
              isMobileMoreActive || mobileMenuOpen
                ? 'mission-btn-primary'
                : 'border border-shalom-gold/25 bg-white/78 text-shalom-deep dark:border-shalom-gold/15 dark:bg-white/10 dark:text-slate-100'
            }`}
            onClick={() => setMobileMenuOpen((current) => !current)}
            aria-expanded={mobileMenuOpen}
            aria-label="Abrir outras telas"
          >
            <MoreHorizontal size={18} aria-hidden="true" />
            <span>Mais</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
