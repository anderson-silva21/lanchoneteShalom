import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { canAccessView, defaultViewForRole } from './access'
import { AppShell } from './components/AppShell'
import { ChangePasswordScreen } from './components/ChangePasswordScreen'
import { Dashboard } from './components/Dashboard'
import { InitialLoadView } from './components/InitialLoadView'
import { LibraryManager } from './components/LibraryManager'
import { LoginScreen } from './components/LoginScreen'
import { PaymentsView } from './components/PaymentsView'
import { PostEventInventory } from './components/PostEventInventory'
import { ProductManager } from './components/ProductManager'
import { ReportsView } from './components/ReportsView'
import { SalesTerminal } from './components/SalesTerminal'
import { SettingsView } from './components/SettingsView'
import { SpreadsheetView } from './components/SpreadsheetView'
import { PublicLibraryStorefront } from './components/PublicLibraryStorefront'
import { api, getToken, setToken } from './services/api'

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'pointerdown']

const viewPaths = {
  dashboard: '/dashboard',
  setup: '/carga-inicial',
  sales: '/pdv',
  payments: '/financeiro',
  products: '/produtos',
  inventory: '/inventario',
  sheet: '/planilha',
  reports: '/relatorios',
  library: '/gestao-livraria',
  settings: '/sistema'
}

function viewFromPath(pathname) {
  return Object.entries(viewPaths).find(([, path]) => pathname === path || pathname.startsWith(`${path}/`))?.[0] || ''
}

function financeSectionFromPath(pathname) {
  return {
    '/financeiro/fechamento': 'closing',
    '/financeiro/pagamentos-pendentes': 'pending',
    '/financeiro/vendas': 'sales',
    '/financeiro/ofertas': 'offers'
  }[pathname] || 'overview'
}

const routePageTitles = {
  '/dashboard/eventos': 'Eventos',
  '/dashboard/sugestoes-compra': 'Sugestoes de compra',
  '/dashboard/estoque-baixo': 'Estoque baixo',
  '/dashboard/validades': 'Alertas de validade',
  '/financeiro/pagamentos-pendentes': 'Pagamentos pendentes',
  '/gestao-livraria/catalogo/produtos/novo': 'Novo produto',
  '/gestao-livraria/catalogo/categorias/nova': 'Nova categoria'
}

function pageTitleFromPath(pathname) {
  if (routePageTitles[pathname]) return routePageTitles[pathname]
  if (/^\/gestao-livraria\/catalogo\/produtos\/[^/]+$/.test(pathname)) return 'Produto'
  return ''
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const isPublicLibrary = typeof window !== 'undefined' && window.location.pathname.startsWith('/livraria')
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('lanchonete_user')
    return stored ? JSON.parse(stored) : null
  })
  const [activeView, setActiveView] = useState(() => viewFromPath(window.location.pathname) || 'dashboard')
  const [productIntent, setProductIntent] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [setupEnabled, setSetupEnabled] = useState(false)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('lanchonete_theme') === 'dark')
  const inactivityTimerRef = useRef(null)
  const lastActivityRef = useRef(0)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('lanchonete_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    const routeView = viewFromPath(location.pathname)
    if (routeView) setActiveView(routeView)
  }, [location.pathname])

  useEffect(() => {
    if (!getToken()) return undefined
    let mounted = true
    api.me()
      .then(({ user: currentUser }) => {
        if (!mounted) return
        setUser(currentUser)
        localStorage.setItem('lanchonete_user', JSON.stringify(currentUser))
      })
      .catch(() => {
        if (!mounted) return
        setToken('')
        setUser(null)
        localStorage.removeItem('lanchonete_user')
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!user || user.password_must_change || !['admin', 'manager', 'finance'].includes(user.role)) {
      setSetupEnabled(false)
      return undefined
    }

    let mounted = true
    api.setupStatus()
      .then((status) => {
        if (mounted) setSetupEnabled(Boolean(status.setup_enabled))
      })
      .catch(() => {
        if (mounted) setSetupEnabled(false)
      })

    return () => {
      mounted = false
    }
  }, [refreshKey, user])

  async function handleLogin(username, password) {
    const payload = await api.login(username, password)
    setToken(payload.token)
    setUser(payload.user)
    if (!payload.user.password_must_change) {
      const requestedView = viewFromPath(location.pathname)
      const nextView = requestedView && canAccessView(payload.user.role, requestedView)
        ? requestedView
        : defaultViewForRole(payload.user.role)
      setActiveView(nextView)
      if (!requestedView) navigate(viewPaths[nextView], { replace: true })
    }
    localStorage.setItem('lanchonete_user', JSON.stringify(payload.user))
  }

  async function handleChangePassword(currentPassword, newPassword) {
    const payload = await api.changePassword({
      current_password: currentPassword,
      new_password: newPassword
    })
    setToken(payload.token)
    setUser(payload.user)
    const nextView = defaultViewForRole(payload.user.role, { setupEnabled })
    setActiveView(nextView)
    navigate(viewPaths[nextView], { replace: true })
    localStorage.setItem('lanchonete_user', JSON.stringify(payload.user))
  }

  const logout = useCallback(() => {
    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = null
    }
    setToken('')
    setUser(null)
    setActiveView('dashboard')
    setProductIntent(null)
    localStorage.removeItem('lanchonete_user')
  }, [])

  useEffect(() => {
    if (!user) return undefined

    function scheduleLogout() {
      if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current)

      const elapsed = Date.now() - lastActivityRef.current
      const remaining = Math.max(INACTIVITY_TIMEOUT_MS - elapsed, 0)
      inactivityTimerRef.current = window.setTimeout(() => {
        logout()
      }, remaining)
    }

    function registerActivity() {
      lastActivityRef.current = Date.now()
      scheduleLogout()
    }

    registerActivity()
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, registerActivity, { passive: true })
    })

    return () => {
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, registerActivity)
      })
    }
  }, [logout, user])

  function refresh() {
    setRefreshKey((key) => key + 1)
  }

  function navigateToProducts(intent = {}) {
    setProductIntent({ ...intent, requestedAt: Date.now() })
    setActiveView('products')
    const params = new URLSearchParams()
    if (intent.action) params.set('action', intent.action)
    if (intent.status) params.set('status', intent.status)
    if (intent.productId) params.set('productId', intent.productId)
    navigate(`/produtos${params.size ? `?${params}` : ''}`)
  }

  useEffect(() => {
    if (location.pathname !== '/produtos') return
    const params = new URLSearchParams(location.search)
    const action = params.get('action')
    if (!action) return
    setProductIntent({
      action,
      status: params.get('status') || undefined,
      productId: params.get('productId') || undefined,
      requestedAt: Date.now()
    })
  }, [location.pathname, location.search])

  function navigateToView(view) {
    setActiveView(view)
    navigate(viewPaths[view] || '/')
  }

  if (isPublicLibrary) {
    return <PublicLibraryStorefront />
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />
  }

  if (user.password_must_change) {
    return <ChangePasswordScreen user={user} onChangePassword={handleChangePassword} onLogout={logout} />
  }

  const requestedView = viewFromPath(location.pathname) || activeView
  const currentView = canAccessView(user.role, requestedView, { setupEnabled }) ? requestedView : defaultViewForRole(user.role, { setupEnabled })
  const pageTitle = pageTitleFromPath(location.pathname)
  const canRegisterInventoryEvent = canAccessView(user.role, 'dashboard', { setupEnabled })
  const views = {
    dashboard: <Dashboard refreshKey={refreshKey} onNavigateToProducts={navigateToProducts} user={user} />,
    setup: <InitialLoadView refreshKey={refreshKey} onChanged={refresh} />,
    sales: <SalesTerminal onSaleComplete={refresh} />,
    payments: <PaymentsView refreshKey={refreshKey} onChanged={refresh} initialSection={financeSectionFromPath(location.pathname)} />,
    products: <ProductManager refreshKey={refreshKey} onChanged={refresh} intent={productIntent} user={user} />,
    inventory: <PostEventInventory refreshKey={refreshKey} onChanged={refresh} onRegisterEvent={canRegisterInventoryEvent ? () => setActiveView('dashboard') : undefined} />,
    sheet: <SpreadsheetView refreshKey={refreshKey} onChanged={refresh} user={user} />,
    reports: <ReportsView user={user} />,
    library: <LibraryManager user={user} />,
    settings: <SettingsView user={user} darkMode={darkMode} setDarkMode={setDarkMode} setupEnabled={setupEnabled} onSetupEnabledChange={setSetupEnabled} onChanged={refresh} />
  }

  return (
    <AppShell
      activeView={currentView}
      setActiveView={navigateToView}
      pageTitle={pageTitle}
      onBack={pageTitle ? () => navigate(-1) : undefined}
      user={user}
      darkMode={darkMode}
      setDarkMode={setDarkMode}
      setupEnabled={setupEnabled}
      onLogout={logout}
    >
      {views[currentView]}
    </AppShell>
  )
}

export default App
