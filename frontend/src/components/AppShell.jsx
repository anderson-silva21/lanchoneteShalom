import { useState } from 'react'
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Boxes,
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
  { key: 'sheet', label: 'Planilha', icon: FileSpreadsheet },
  { key: 'library', label: 'Livraria', icon: BookOpen },
  { key: 'settings', label: 'Sistema', icon: Settings }
]

const roleLabels = {
  admin: 'Admin',
  manager: 'Gerente',
  finance: 'Financeiro',
  cashier: 'Caixa',
  library: 'Livraria'
}

const mobileNavLabels = { sales: 'Vender' }

function getFirstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'Usuario'
}

export function AppShell({ activeView, setActiveView, pageTitle, onBack, user, darkMode, setDarkMode, setupEnabled = false, onLogout, children }) {
  const allowedNavItems = navItems.filter((item) => canAccessView(user?.role, item.key, { setupEnabled }))
  const mobileNavColumns = allowedNavItems.length > 7 ? Math.ceil(allowedNavItems.length / 2) : allowedNavItems.length
  const firstName = getFirstName(user?.name)
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

  function selectView(view) {
    setActiveView(view)
  }

  return (
    <div className={`app-bg relative flex h-[100dvh] min-h-0 flex-col overflow-hidden text-ink dark:text-slate-50 lg:block lg:h-auto lg:min-h-screen lg:overflow-visible ${allowedNavItems.length > 7 ? 'mobile-nav-two-rows' : ''}`}>
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

        <div className="relative mt-5 flex-none">
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
        </div>
      </aside>

      <div className={`flex min-h-0 min-w-0 flex-1 flex-col transition-[padding] duration-200 lg:block lg:min-h-screen ${sidebarCollapsed ? 'lg:pl-[88px]' : 'lg:pl-72'}`}>
        <header className="sticky top-0 z-20 flex-none border-b border-shalom-gold/30 bg-white/78 px-3 py-2 shadow-sm backdrop-blur-2xl dark:border-shalom-gold/15 dark:bg-gradient-to-r dark:from-shalom-night/95 dark:via-[#0A2443]/92 dark:to-shalom-deep/88 dark:shadow-[0_18px_52px_rgba(0,0,0,0.24)] sm:px-4 lg:px-8 lg:py-3">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 lg:items-start lg:gap-3">
              {onBack ? <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center text-shalom-blue dark:text-shalom-gold" onClick={onBack} aria-label="Voltar" title="Voltar"><ArrowLeft size={21} /></button> : null}
              <div className="min-w-0">
                <div className="lg:hidden">
                  <h1 className="truncate font-display text-lg font-semibold leading-tight text-shalom-deep dark:text-white">{pageTitle || allowedNavItems.find((item) => item.key === activeView)?.label}</h1>
                  <p className="truncate text-xs font-semibold text-shalom-deep/80 dark:text-slate-200">{firstName}</p>
                  <p className="truncate text-[11px] font-semibold text-shalom-orange dark:text-shalom-gold">{roleLabels[user?.role] || user?.role}</p>
                </div>
                <div className="hidden lg:block">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-shalom-orange dark:text-shalom-gold/90">Gestao da difusao</p>
                  <h1 className="font-display text-2xl font-semibold leading-tight text-shalom-deep dark:text-white">{pageTitle || allowedNavItems.find((item) => item.key === activeView)?.label}</h1>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center text-shalom-deep transition-colors hover:text-shalom-orange dark:text-shalom-gold dark:hover:text-white"
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? 'Modo claro' : 'Modo escuro'}
                aria-label="Alternar tema"
              >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center text-shalom-wine transition-colors hover:text-shalom-orange dark:text-rose-200 dark:hover:text-white"
                onClick={onLogout}
                title="Sair"
                aria-label="Sair"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-0 pt-4 scrollbar-thin sm:px-5 lg:h-auto lg:overflow-visible lg:overscroll-auto lg:px-8 lg:pb-5 lg:pt-5">{children}</main>
      </div>

      <nav
        className="mobile-bottom-nav relative z-40 h-[var(--mobile-bottom-nav-height)] flex-none border-t border-line/80 bg-white/95 px-1 pb-[calc(0.3125rem_+_env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl dark:border-shalom-gold/15 dark:bg-shalom-night/95 lg:hidden"
        aria-label="Navegacao principal"
      >
        <div
          className="mx-auto grid max-w-lg auto-rows-[3rem] place-items-center"
          style={{ gridTemplateColumns: `repeat(${Math.max(mobileNavColumns, 1)}, minmax(44px, 1fr))` }}
        >
          {allowedNavItems.map((item) => {
            const Icon = item.icon
            const active = activeView === item.key
            const mobileLabel = mobileNavLabels[item.key] || item.label
            return (
              <button
                key={item.key}
                type="button"
                className={`mobile-nav-item ${active ? 'mobile-nav-item-active' : ''}`}
                onClick={() => selectView(item.key)}
                aria-label={mobileLabel}
                aria-current={active ? 'page' : undefined}
                title={mobileLabel}
              >
                <Icon size={21} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
