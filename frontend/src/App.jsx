import { useCallback, useEffect, useRef, useState } from 'react'
import { AppShell } from './components/AppShell'
import { Dashboard } from './components/Dashboard'
import { LoginScreen } from './components/LoginScreen'
import { ProductManager } from './components/ProductManager'
import { ReportsView } from './components/ReportsView'
import { SalesTerminal } from './components/SalesTerminal'
import { SettingsView } from './components/SettingsView'
import { SpreadsheetView } from './components/SpreadsheetView'
import { api, getToken, setToken } from './services/api'

const INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000
const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'pointerdown']

function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('lanchonete_user')
    return stored ? JSON.parse(stored) : null
  })
  const [activeView, setActiveView] = useState('dashboard')
  const [productIntent, setProductIntent] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('lanchonete_theme') === 'dark')
  const inactivityTimerRef = useRef(null)
  const lastActivityRef = useRef(0)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('lanchonete_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    if (!getToken() || user) return
    api.me()
      .then(({ user: currentUser }) => {
        setUser(currentUser)
        localStorage.setItem('lanchonete_user', JSON.stringify(currentUser))
      })
      .catch(() => setToken(''))
  }, [user])

  async function handleLogin(email, password) {
    const payload = await api.login(email, password)
    setToken(payload.token)
    setUser(payload.user)
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

  const views = {
    dashboard: <Dashboard refreshKey={refreshKey} onNavigateToProducts={navigateToProducts} />,
    sales: <SalesTerminal onSaleComplete={refresh} />,
    products: <ProductManager refreshKey={refreshKey} onChanged={refresh} intent={productIntent} />,
    sheet: <SpreadsheetView refreshKey={refreshKey} onChanged={refresh} />,
    reports: <ReportsView />,
    settings: <SettingsView user={user} darkMode={darkMode} setDarkMode={setDarkMode} />
  }

  return (
    <AppShell
      activeView={activeView}
      setActiveView={setActiveView}
      user={user}
      darkMode={darkMode}
      setDarkMode={setDarkMode}
      onLogout={logout}
    >
      {views[activeView]}
    </AppShell>
  )
}

export default App
