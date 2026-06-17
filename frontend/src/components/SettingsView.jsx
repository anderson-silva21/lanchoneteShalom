import { Clipboard, DatabaseZap, KeyRound, Moon, RotateCcw, ShieldCheck, Smartphone, Trash2, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
import { decimal } from '../utils/formatters'

const roleOptions = [
  { value: 'cashier', label: 'Caixa' },
  { value: 'manager', label: 'Gerente' },
  { value: 'admin', label: 'Admin' }
]

function roleLabel(role) {
  return roleOptions.find((item) => item.value === role)?.label || role
}

export function SettingsView({ user, darkMode, setDarkMode, onChanged = () => {} }) {
  const [status, setStatus] = useState(null)
  const [users, setUsers] = useState([])
  const [userDraft, setUserDraft] = useState({ name: '', username: '', role: 'cashier' })
  const [generatedPassword, setGeneratedPassword] = useState(null)
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [resetting, setResetting] = useState(false)
  const [savingUser, setSavingUser] = useState(false)
  const [resettingUserId, setResettingUserId] = useState(null)
  const [deletingUserId, setDeletingUserId] = useState(null)

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.setupStatus())
    } catch (err) {
      setMessage(err.message)
    }
  }, [])

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await api.users())
    } catch (err) {
      setMessage(err.message)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    loadUsers()
  }, [loadStatus, loadUsers])

  async function createUser(event) {
    event.preventDefault()
    setMessage('')
    setGeneratedPassword(null)
    setSavingUser(true)
    try {
      const result = await api.createUser(userDraft)
      setUsers((current) => [...current, result.user].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')))
      setUserDraft({ name: '', username: '', role: 'cashier' })
      setGeneratedPassword({
        title: 'Senha inicial criada',
        username: result.user.username,
        password: result.temporary_password
      })
      setMessage('Usuario criado.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSavingUser(false)
    }
  }

  async function resetUserPassword(userId) {
    setMessage('')
    setGeneratedPassword(null)
    setResettingUserId(userId)
    try {
      const result = await api.resetUserPassword(userId)
      setUsers((current) => current.map((item) => item.id === result.user.id ? result.user : item))
      setGeneratedPassword({
        title: 'Senha temporaria resetada',
        username: result.user.username,
        password: result.temporary_password
      })
      setMessage('Senha resetada.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setResettingUserId(null)
    }
  }

  async function deleteUser(userToDelete) {
    if (!window.confirm(`Excluir o usuario ${userToDelete.username}?`)) return
    setMessage('')
    setGeneratedPassword(null)
    setDeletingUserId(userToDelete.id)
    try {
      await api.deleteUser(userToDelete.id)
      setUsers((current) => current.filter((item) => item.id !== userToDelete.id))
      setMessage(`Usuario ${userToDelete.username} excluido.`)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setDeletingUserId(null)
    }
  }

  async function copyGeneratedPassword() {
    if (!generatedPassword?.password) return
    try {
      await navigator.clipboard.writeText(generatedPassword.password)
      setMessage('Senha copiada.')
    } catch {
      setMessage('Nao foi possivel copiar automaticamente.')
    }
  }

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
          <div className="flex items-center gap-2">
            <Users size={20} />
            <div>
              <h2 className="font-display text-lg font-semibold">Usuarios ativos</h2>
              <p className="mission-muted text-sm">{decimal.format(users.length)} usuarios com acesso</p>
            </div>
          </div>
          {generatedPassword ? (
            <div className="rounded-xl border border-shalom-gold/35 bg-shalom-cream/70 p-3 text-sm text-shalom-deep dark:border-shalom-gold/15 dark:bg-white/10 dark:text-shalom-gold">
              <p className="font-semibold">{generatedPassword.title}</p>
              <p className="mission-muted mt-1">{generatedPassword.username}</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded-lg bg-white/80 px-3 py-2 font-mono text-sm text-shalom-blue dark:bg-shalom-night/80 dark:text-white">{generatedPassword.password}</code>
                <button
                  type="button"
                  className="mission-btn border border-line/80 p-2 hover:bg-white/80 dark:border-shalom-gold/10 dark:hover:bg-white/10"
                  onClick={copyGeneratedPassword}
                  title="Copiar senha"
                >
                  <Clipboard size={16} />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <form className="mt-4 grid gap-3 lg:grid-cols-[1fr_180px_160px_auto]" onSubmit={createUser}>
          <label className="text-sm font-medium">
            Nome
            <input
              className="mission-input mt-1 w-full px-3 py-2"
              value={userDraft.name}
              onChange={(event) => setUserDraft({ ...userDraft, name: event.target.value })}
            />
          </label>
          <label className="text-sm font-medium">
            Usuario
            <input
              className="mission-input mt-1 w-full px-3 py-2"
              value={userDraft.username}
              onChange={(event) => setUserDraft({ ...userDraft, username: event.target.value.toLowerCase() })}
            />
          </label>
          <label className="text-sm font-medium">
            Perfil
            <select
              className="mission-input mt-1 w-full px-3 py-2"
              value={userDraft.role}
              onChange={(event) => setUserDraft({ ...userDraft, role: event.target.value })}
            >
              {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
          </label>
          <button
            type="submit"
            className="mission-btn mission-btn-primary flex items-center justify-center gap-2 px-4 py-3 font-semibold lg:self-end"
            disabled={savingUser}
          >
            <UserPlus size={17} />
            {savingUser ? 'Criando...' : 'Criar'}
          </button>
        </form>

        <div className="mt-4 overflow-x-auto scrollbar-thin">
          <table className="min-w-[760px] w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.12em] text-shalom-blue/70 dark:text-shalom-gold/80">
                <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Nome</th>
                <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Usuario</th>
                <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Perfil</th>
                <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Senha</th>
                <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id}>
                  <td className="border-b border-line/80 px-3 py-2 font-semibold dark:border-shalom-gold/10">{item.name}</td>
                  <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{item.username}</td>
                  <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{roleLabel(item.role)}</td>
                  <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                    {item.password_must_change ? 'Troca pendente' : 'Definida'}
                  </td>
                  <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="mission-btn inline-flex items-center justify-center gap-2 border border-line/80 px-3 py-2 font-semibold hover:bg-shalom-cream/70 disabled:cursor-not-allowed disabled:opacity-55 dark:border-shalom-gold/10 dark:hover:bg-white/10"
                        onClick={() => resetUserPassword(item.id)}
                        disabled={resettingUserId === item.id || deletingUserId === item.id}
                      >
                        <RotateCcw size={16} />
                        {resettingUserId === item.id ? 'Resetando...' : 'Resetar senha'}
                      </button>
                      <button
                        type="button"
                        className="mission-btn inline-flex items-center justify-center gap-2 border border-shalom-wine/35 px-3 py-2 font-semibold text-shalom-wine hover:bg-shalom-wine/10 disabled:cursor-not-allowed disabled:opacity-55 dark:border-rose-200/20 dark:text-rose-100 dark:hover:bg-rose-400/10"
                        onClick={() => deleteUser(item)}
                        disabled={deletingUserId === item.id || resettingUserId === item.id || item.id === user?.id}
                        title={item.id === user?.id ? 'Voce nao pode excluir seu proprio usuario' : 'Excluir usuario'}
                      >
                        <Trash2 size={16} />
                        {deletingUserId === item.id ? 'Excluindo...' : 'Excluir'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length ? (
                <tr>
                  <td className="border-b border-line/80 px-3 py-4 mission-muted dark:border-shalom-gold/10" colSpan={5}>
                    Nenhum usuario ativo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

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
