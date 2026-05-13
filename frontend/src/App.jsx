import { useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { Dashboard } from './components/Dashboard'
import { LoginScreen } from './components/LoginScreen'
import { ProductManager } from './components/ProductManager'
import { ReportsView } from './components/ReportsView'
import { SalesTerminal } from './components/SalesTerminal'
import { SettingsView } from './components/SettingsView'
import { SpreadsheetView } from './components/SpreadsheetView'
import { api, getToken, setToken } from './services/api'

function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('lanchonete_user')
    return stored ? JSON.parse(stored) : null
  })
  const [activeView, setActiveView] = useState('dashboard')
  const [refreshKey, setRefreshKey] = useState(0)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('lanchonete_theme') === 'dark')

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

  function logout() {
    setToken('')
    setUser(null)
    localStorage.removeItem('lanchonete_user')
  }

  function refresh() {
    setRefreshKey((key) => key + 1)
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />
  }

  const views = {
    dashboard: <Dashboard refreshKey={refreshKey} />,
    sales: <SalesTerminal onSaleComplete={refresh} />,
    products: <ProductManager refreshKey={refreshKey} onChanged={refresh} />,
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
