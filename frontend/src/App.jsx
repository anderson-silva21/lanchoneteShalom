import { useCallback, useEffect, useRef, useState } from 'react'
import { canAccessView, defaultViewForRole } from './access'
import { AppShell } from './components/AppShell'
import { ChangePasswordScreen } from './components/ChangePasswordScreen'
import { Dashboard } from './components/Dashboard'
import { InitialLoadView } from './components/InitialLoadView'
import { LoginScreen } from './components/LoginScreen'
import { PaymentsView } from './components/PaymentsView'
import { PostEventInventory } from './components/PostEventInventory'
import { ProductManager } from './components/ProductManager'
import { ReportsView } from './components/ReportsView'
import { SalesTerminal } from './components/SalesTerminal'
import { SettingsView } from './components/SettingsView'
import { SpreadsheetView } from './components/SpreadsheetView'
import { api, getToken, setToken } from './services/api'

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'pointerdown']

function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('lanchonete_user')
    return stored ? JSON.parse(stored) : null
  })
  const [activeView, setActiveView] = useState('dashboard')
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
    if (!payload.user.password_must_change) setActiveView(defaultViewForRole(payload.user.role))
    localStorage.setItem('lanchonete_user', JSON.stringify(payload.user))
  }

  async function handleChangePassword(currentPassword, newPassword) {
    const payload = await api.changePassword({
      current_password: currentPassword,
      new_password: newPassword
    })
    setToken(payload.token)
    setUser(payload.user)
    setActiveView(defaultViewForRole(payload.user.role, { setupEnabled }))
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
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />
  }

  if (user.password_must_change) {
    return <ChangePasswordScreen user={user} onChangePassword={handleChangePassword} onLogout={logout} />
  }

  const currentView = canAccessView(user.role, activeView, { setupEnabled }) ? activeView : defaultViewForRole(user.role, { setupEnabled })
  const canRegisterInventoryEvent = canAccessView(user.role, 'dashboard', { setupEnabled })
  const views = {
    dashboard: <Dashboard refreshKey={refreshKey} onNavigateToProducts={navigateToProducts} user={user} />,
    setup: <InitialLoadView refreshKey={refreshKey} onChanged={refresh} />,
    sales: <SalesTerminal onSaleComplete={refresh} />,
    payments: <PaymentsView refreshKey={refreshKey} onChanged={refresh} />,
    products: <ProductManager refreshKey={refreshKey} onChanged={refresh} intent={productIntent} user={user} />,
    inventory: <PostEventInventory refreshKey={refreshKey} onChanged={refresh} onRegisterEvent={canRegisterInventoryEvent ? () => setActiveView('dashboard') : undefined} />,
    sheet: <SpreadsheetView refreshKey={refreshKey} onChanged={refresh} user={user} />,
    reports: <ReportsView user={user} />,
    settings: <SettingsView user={user} darkMode={darkMode} setDarkMode={setDarkMode} setupEnabled={setupEnabled} onSetupEnabledChange={setSetupEnabled} onChanged={refresh} />
  }

  return (
    <AppShell
      activeView={currentView}
      setActiveView={setActiveView}
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
