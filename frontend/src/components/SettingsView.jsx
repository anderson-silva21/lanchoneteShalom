import { Activity, Bell, Clipboard, DatabaseZap, ExternalLink, HardDrive, KeyRound, ListChecks, Moon, PackagePlus, RotateCcw, Save, Send, ShieldCheck, Smartphone, Trash2, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
import { decimal, formatDateTime } from '../utils/formatters'

const roleOptions = [
  { value: 'cashier', label: 'Caixa' },
  { value: 'manager', label: 'Gerente' },
  { value: 'finance', label: 'Financeiro' },
  { value: 'admin', label: 'Admin' }
]

const permissionRows = [
  ['dashboard', 'Dashboard', ['admin', 'finance']],
  ['setup', 'Carga inicial', ['admin', 'manager', 'finance']],
  ['sales', 'PDV', ['admin', 'manager', 'cashier', 'finance']],
  ['payments', 'Pagamentos', ['admin', 'manager', 'cashier', 'finance']],
  ['products', 'Produtos', ['admin', 'manager', 'finance']],
  ['inventory', 'Inventario', ['admin', 'manager', 'finance']],
  ['sheet', 'Planilha', ['admin', 'manager', 'cashier', 'finance']],
  ['reports', 'Relatorios', ['admin', 'finance']],
  ['settings', 'Sistema', ['admin']]
]

function getDisplayError(err) {
  const issue = err.payload?.issues?.[0]
  if (issue?.path?.includes('role')) return 'Perfil invalido. Atualize/reinicie o backend e tente novamente.'
  if (issue?.message) return issue.message
  return err.message || 'Nao foi possivel completar a acao.'
}

function roleLabel(role) {
  return roleOptions.find((item) => item.value === role)?.label || role
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (bytes < 1024) return `${decimal.format(bytes)} B`
  if (bytes < 1024 * 1024) return `${decimal.format(bytes / 1024)} KB`
  return `${decimal.format(bytes / 1024 / 1024)} MB`
}

export function SettingsView({ user, darkMode, setDarkMode, setupEnabled = false, onSetupEnabledChange = () => {}, onChanged = () => {} }) {
  const [status, setStatus] = useState(null)
  const [users, setUsers] = useState([])
  const [userDraft, setUserDraft] = useState({ name: '', username: '', role: 'cashier' })
  const [generatedPassword, setGeneratedPassword] = useState(null)
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [userMessage, setUserMessage] = useState('')
  const [resetting, setResetting] = useState(false)
  const [savingUser, setSavingUser] = useState(false)
  const [resettingUserId, setResettingUserId] = useState(null)
  const [deletingUserId, setDeletingUserId] = useState(null)
  const [savingInitialLoad, setSavingInitialLoad] = useState(false)
  const [telegramStatus, setTelegramStatus] = useState(null)
  const [telegramDraft, setTelegramDraft] = useState({
    enabled: false,
    chat_id: '',
    group_url: '',
    interval_minutes: 360,
    max_items: 8,
    ignored_missing_expiration_categories: 'Descartaveis'
  })
  const [health, setHealth] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [savingTelegram, setSavingTelegram] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const nextStatus = await api.setupStatus()
      setStatus(nextStatus)
      onSetupEnabledChange(Boolean(nextStatus.setup_enabled))
    } catch (err) {
      setMessage(err.message)
    }
  }, [onSetupEnabledChange])

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await api.users())
    } catch (err) {
      setMessage(err.message)
    }
  }, [])

  const loadTelegramStatus = useCallback(async () => {
    try {
      const nextStatus = await api.telegramAlertsStatus()
      setTelegramStatus(nextStatus)
      setTelegramDraft({
        enabled: Boolean(nextStatus.enabled),
        chat_id: '',
        group_url: nextStatus.group_url || '',
        interval_minutes: nextStatus.interval_minutes || 360,
        max_items: nextStatus.max_items || 8,
        ignored_missing_expiration_categories: (nextStatus.ignored_missing_expiration_categories || []).join(', ')
      })
    } catch (err) {
      setMessage(err.message)
    }
  }, [])

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await api.systemHealth())
    } catch (err) {
      setMessage(err.message)
    }
  }, [])

  const loadAuditLogs = useCallback(async () => {
    try {
      setAuditLogs(await api.auditLogs({ limit: 40 }))
    } catch (err) {
      setMessage(err.message)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    loadUsers()
    loadTelegramStatus()
    loadHealth()
    loadAuditLogs()
  }, [loadAuditLogs, loadHealth, loadStatus, loadTelegramStatus, loadUsers])

  async function createUser(event) {
    event.preventDefault()
    setMessage('')
    setUserMessage('')
    setGeneratedPassword(null)

    if (!userDraft.name.trim() || !userDraft.username.trim()) {
      setUserMessage('Informe nome e usuario para criar o acesso.')
      return
    }

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
      setUserMessage('Usuario criado.')
      setMessage('Usuario criado.')
    } catch (err) {
      const displayError = getDisplayError(err)
      setUserMessage(displayError)
      setMessage(displayError)
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

  async function toggleInitialLoad() {
    setMessage('')
    setSavingInitialLoad(true)
    try {
      const result = await api.updateInitialLoad({ enabled: !initialLoadEnabled })
      setStatus(result)
      onSetupEnabledChange(Boolean(result.setup_enabled))
      loadAuditLogs()
      setMessage(result.setup_enabled ? 'Carga inicial habilitada.' : 'Carga inicial desabilitada.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSavingInitialLoad(false)
    }
  }

  async function testTelegramAlerts() {
    setMessage('')
    setTestingTelegram(true)
    try {
      const result = await api.testTelegramAlerts()
      setTelegramStatus(result.status)
      loadAuditLogs()
      setMessage(result.sent ? 'Alerta Telegram enviado.' : 'Nenhum alerta enviado.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setTestingTelegram(false)
    }
  }

  async function saveTelegramSettings(event) {
    event.preventDefault()
    setMessage('')
    setSavingTelegram(true)
    try {
      const chatId = telegramDraft.chat_id.trim()
      const payload = {
        enabled: telegramDraft.enabled,
        group_url: telegramDraft.group_url,
        interval_minutes: telegramDraft.interval_minutes,
        max_items: telegramDraft.max_items,
        ignored_missing_expiration_categories: telegramDraft.ignored_missing_expiration_categories
      }

      if (chatId) payload.chat_id = chatId

      const nextStatus = await api.updateTelegramAlerts(payload)
      setTelegramStatus(nextStatus)
      setTelegramDraft((current) => ({ ...current, chat_id: '' }))
      loadAuditLogs()
      setMessage('Configuracao Telegram salva.')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSavingTelegram(false)
    }
  }

  const counts = status?.counts || {}
  const initialLoadEnabled = status?.setup_enabled ?? setupEnabled
  const telegramLabel = telegramStatus?.enabled ? 'Ativo' : telegramStatus?.configured ? 'Desativado' : 'Nao configurado'
  const items = [
    { icon: ShieldCheck, label: 'Perfil', value: user?.role || '-' },
    { icon: KeyRound, label: 'Sessao', value: user?.username || '-' },
    { icon: DatabaseZap, label: 'Produtos', value: decimal.format(counts.products || 0) },
    { icon: Bell, label: 'Telegram', value: telegramLabel },
    { icon: HardDrive, label: 'Banco', value: health ? formatBytes(health.database?.size) : '-' },
    { icon: Activity, label: 'Saude', value: health?.ok ? 'Ok' : health ? 'Atencao' : '-' },
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
        <button
          className="mission-btn mt-3 flex w-full items-center justify-between border border-shalom-gold/30 px-4 py-3 font-medium dark:border-shalom-gold/10"
          onClick={toggleInitialLoad}
          disabled={savingInitialLoad}
        >
          <span className="flex items-center gap-2">
            <PackagePlus size={18} />
            Carga inicial
          </span>
          <span className={`h-6 w-11 rounded-full p-1 transition ${initialLoadEnabled ? 'bg-shalom-gold' : 'bg-shalom-blue/25'}`}>
            <span className={`block h-4 w-4 rounded-full bg-white transition ${initialLoadEnabled ? 'translate-x-5' : ''}`} />
          </span>
        </button>
        <form className="mt-3 rounded-xl border border-shalom-gold/30 p-3 dark:border-shalom-gold/10" onSubmit={saveTelegramSettings}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-medium">
                <Bell size={18} />
                Alertas Telegram
              </p>
              <p className="mission-muted mt-1 text-sm">{telegramLabel}</p>
            </div>
            <button
              type="button"
              className="mission-btn border border-line/80 p-2 hover:bg-shalom-cream/70 disabled:cursor-not-allowed disabled:opacity-55 dark:border-shalom-gold/10 dark:hover:bg-white/10"
              onClick={testTelegramAlerts}
              disabled={!telegramStatus?.configured || testingTelegram}
              title="Enviar teste"
            >
              <Send size={16} />
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="mission-muted">Intervalo</dt>
              <dd className="font-semibold">{telegramStatus?.interval_minutes ? `${decimal.format(telegramStatus.interval_minutes)} min` : '-'}</dd>
            </div>
            <div>
              <dt className="mission-muted">Ultimo envio</dt>
              <dd className="font-semibold">{formatDateTime(telegramStatus?.last_sent_at)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="mission-muted">Chat ID carregado</dt>
              <dd className="font-semibold">{telegramStatus?.chat_id_preview || '-'}</dd>
            </div>
          </dl>
          <div className="mt-3 grid gap-2">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-line/70 px-3 py-2 text-sm font-medium dark:border-shalom-gold/10">
              <span>Envio automatico</span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-shalom-orange"
                checked={telegramDraft.enabled}
                onChange={(event) => setTelegramDraft({ ...telegramDraft, enabled: event.target.checked })}
              />
            </label>
            <label className="text-xs font-medium">
              Chat ID
              <input
                className="mission-input mt-1 w-full px-3 py-2"
                value={telegramDraft.chat_id}
                onChange={(event) => setTelegramDraft({ ...telegramDraft, chat_id: event.target.value })}
                placeholder={telegramStatus?.chat_id_preview || 'Manter atual'}
              />
            </label>
            <label className="text-xs font-medium">
              Link do grupo
              <input
                className="mission-input mt-1 w-full px-3 py-2"
                value={telegramDraft.group_url}
                onChange={(event) => setTelegramDraft({ ...telegramDraft, group_url: event.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium">
                Intervalo min.
                <input
                  type="number"
                  min="5"
                  max="1440"
                  className="mission-input mt-1 w-full px-3 py-2"
                  value={telegramDraft.interval_minutes}
                  onChange={(event) => setTelegramDraft({ ...telegramDraft, interval_minutes: Number(event.target.value) })}
                />
              </label>
              <label className="text-xs font-medium">
                Itens por bloco
                <input
                  type="number"
                  min="3"
                  max="30"
                  className="mission-input mt-1 w-full px-3 py-2"
                  value={telegramDraft.max_items}
                  onChange={(event) => setTelegramDraft({ ...telegramDraft, max_items: Number(event.target.value) })}
                />
              </label>
            </div>
            <label className="text-xs font-medium">
              Categorias ignoradas sem validade
              <input
                className="mission-input mt-1 w-full px-3 py-2"
                value={telegramDraft.ignored_missing_expiration_categories}
                onChange={(event) => setTelegramDraft({ ...telegramDraft, ignored_missing_expiration_categories: event.target.value })}
                placeholder="Descartaveis, Insumos"
              />
            </label>
            <button
              type="submit"
              className="mission-btn mission-btn-gold flex w-full items-center justify-center gap-2 px-3 py-2 text-sm font-semibold"
              disabled={savingTelegram}
            >
              <Save size={16} />
              {savingTelegram ? 'Salvando...' : 'Salvar Telegram'}
            </button>
          </div>
          <a
            className={`mission-btn mt-3 flex w-full items-center justify-center gap-2 border border-line/80 px-3 py-2 text-sm font-semibold hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10 ${telegramStatus?.group_url ? '' : 'pointer-events-none opacity-55'}`}
            href={telegramStatus?.group_url || '#'}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} />
            Entrar no grupo do Telegram
          </a>
        </form>
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
              required
            />
          </label>
          <label className="text-sm font-medium">
            Usuario
            <input
              className="mission-input mt-1 w-full px-3 py-2"
              value={userDraft.username}
              onChange={(event) => setUserDraft({ ...userDraft, username: event.target.value.toLowerCase() })}
              required
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
        {userMessage ? (
          <p className="mt-3 rounded-xl border border-shalom-gold/25 bg-shalom-cream/60 px-3 py-2 text-sm font-medium text-shalom-deep dark:border-shalom-gold/10 dark:bg-white/10 dark:text-white" aria-live="polite">
            {userMessage}
          </p>
        ) : null}

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
          <div className="flex items-center gap-2">
            <Activity size={20} />
            <div>
              <h2 className="font-display text-lg font-semibold">Saude do sistema</h2>
              <p className="mission-muted text-sm">{health?.now ? `Atualizado em ${formatDateTime(health.now)}` : 'Carregando status'}</p>
            </div>
          </div>
          <button
            type="button"
            className="mission-btn border border-line/80 px-4 py-2 text-sm font-semibold hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10"
            onClick={() => {
              loadHealth()
              loadAuditLogs()
            }}
          >
            Atualizar
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Status', health?.ok ? 'Ok' : health ? 'Atencao' : '-'],
            ['Versao', health?.version || '-'],
            ['Uptime', health?.uptime_seconds ? `${decimal.format(Math.round(health.uptime_seconds / 60))} min` : '-'],
            ['Backup recente', health?.backup?.last_backup ? formatDateTime(health.backup.last_backup.created_at) : '-'],
            ['Banco', health?.database ? formatBytes(health.database.size) : '-'],
            ['WAL', health?.database ? formatBytes(health.database.wal_size) : '-'],
            ['Auditoria', health?.audit ? decimal.format(health.audit.total) : '-'],
            ['Ambiente', health?.env || '-']
          ].map(([label, value]) => (
            <div key={label} className="mission-card px-3 py-2 text-sm">
              <span className="mission-muted block text-xs">{label}</span>
              <strong className="mt-1 block break-words">{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:col-span-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="mission-panel p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} />
            <h2 className="font-display text-lg font-semibold">Permissoes</h2>
          </div>
          <div className="mt-4 overflow-x-auto scrollbar-thin">
            <table className="min-w-[620px] w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.12em] text-shalom-blue/70 dark:text-shalom-gold/80">
                  <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Tela</th>
                  {roleOptions.map((role) => (
                    <th key={role.value} className="border-b border-line px-3 py-2 text-center dark:border-shalom-gold/10">{role.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissionRows.map(([key, label, roles]) => (
                  <tr key={key}>
                    <td className="border-b border-line/80 px-3 py-2 font-semibold dark:border-shalom-gold/10">{label}</td>
                    {roleOptions.map((role) => (
                      <td key={role.value} className="border-b border-line/80 px-3 py-2 text-center dark:border-shalom-gold/10">
                        {roles.includes(role.value) ? 'Sim' : '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mission-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ListChecks size={20} />
              <div>
                <h2 className="font-display text-lg font-semibold">Auditoria recente</h2>
                <p className="mission-muted text-sm">{decimal.format(auditLogs.length)} registros carregados</p>
              </div>
            </div>
          </div>
          <div className="mt-4 max-h-80 overflow-y-auto scrollbar-thin">
            {auditLogs.length ? auditLogs.map((log) => (
              <article key={log.id} className="border-b border-line/70 py-3 text-sm dark:border-shalom-gold/10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{log.summary}</p>
                    <p className="mission-muted mt-1">{log.username || '-'} - {log.action}</p>
                  </div>
                  <span className="mission-muted whitespace-nowrap text-xs">{formatDateTime(log.created_at)}</span>
                </div>
              </article>
            )) : (
              <p className="mission-muted text-sm">Nenhum registro de auditoria.</p>
            )}
          </div>
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
