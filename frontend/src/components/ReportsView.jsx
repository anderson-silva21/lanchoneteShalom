import { ClipboardCheck, Database, Download, FileBarChart, FileSpreadsheet, FileText, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { formatDateTime } from '../utils/formatters'

const reports = [
  { type: 'sales', label: 'Vendas', icon: FileBarChart },
  { type: 'sale_items', label: 'Itens vendidos', icon: FileText },
  { type: 'products', label: 'Estoque', icon: FileSpreadsheet },
  { type: 'batches', label: 'Lotes', icon: Database },
  { type: 'movements', label: 'Movimentacoes', icon: Database },
  { type: 'post_event_inventory', label: 'Inventario', icon: ClipboardCheck }
]

export function ReportsView({ user }) {
  const [message, setMessage] = useState('')
  const [backups, setBackups] = useState([])
  const [restoreFile, setRestoreFile] = useState('')
  const [restoreConfirmation, setRestoreConfirmation] = useState('')
  const [restoring, setRestoring] = useState(false)

  const canManageBackups = user?.role === 'admin'

  useEffect(() => {
    if (!canManageBackups) return
    api.backups().then(setBackups).catch(() => null)
  }, [canManageBackups])

  async function downloadReport(type, format) {
    setMessage('')
    try {
      await api.downloadReport(type, format)
      setMessage('Arquivo gerado.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  async function createBackup() {
    setMessage('')
    try {
      const backup = await api.backup()
      setMessage(`Backup criado: ${backup.file}`)
      setBackups(await api.backups())
    } catch (err) {
      setMessage(err.message)
    }
  }

  async function restoreBackup(event) {
    event.preventDefault()
    if (!restoreFile || restoreConfirmation !== 'RESTAURAR') return
    setMessage('')
    setRestoring(true)
    try {
      const result = await api.restoreBackup(restoreFile, { confirmation: restoreConfirmation })
      setMessage(`${result.message} Backup de seguranca: ${result.safety_backup}`)
      setRestoreConfirmation('')
      setRestoring(false)
    } catch (err) {
      setMessage(err.message)
      setRestoring(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-4">
        {reports.map((report) => {
          const Icon = report.icon
          return (
            <div key={report.type} className="mission-panel p-4">
              <div className="mb-4 flex items-center gap-2">
                <Icon size={20} />
                <h2 className="font-display text-lg font-semibold">{report.label}</h2>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['csv', 'xlsx', 'pdf'].map((format) => (
                  <button key={format} className="mission-btn border border-shalom-gold/30 px-3 py-2 text-sm font-semibold uppercase hover:bg-shalom-cream/70 dark:border-shalom-gold/20 dark:hover:bg-white/10" onClick={() => downloadReport(report.type, format)}>
                    {format}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </section>

      {canManageBackups ? (
      <section>
        <div className="mission-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Backups</h2>
              <p className="mission-muted text-sm">{backups.length} arquivos</p>
            </div>
            <button className="mission-btn mission-btn-gold flex items-center gap-2 px-4 py-2 font-semibold" onClick={createBackup}>
              <Download size={16} />
              Criar
            </button>
          </div>
          <div className="mt-4 max-h-56 overflow-y-auto scrollbar-thin">
            {backups.map((backup) => (
              <div key={backup.file} className="flex items-center justify-between gap-3 border-b border-line/70 py-2 text-sm dark:border-shalom-gold/10">
                <button
                  type="button"
                  className="font-mono text-left hover:text-shalom-blue dark:hover:text-shalom-gold"
                  onClick={() => setRestoreFile(backup.file)}
                  title="Selecionar para restaurar"
                >
                  {backup.file}
                </button>
                <span className="mission-muted">{formatDateTime(backup.created_at)}</span>
              </div>
            ))}
          </div>
          <form className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_auto]" onSubmit={restoreBackup}>
            <label className="text-sm font-medium">
              Restaurar backup
              <select className="mission-input mt-1 w-full px-3 py-2" value={restoreFile} onChange={(event) => setRestoreFile(event.target.value)}>
                <option value="">Selecione</option>
                {backups.map((backup) => <option key={backup.file} value={backup.file}>{backup.file}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Confirmacao
              <input className="mission-input mt-1 w-full px-3 py-2" value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} placeholder="RESTAURAR" />
            </label>
            <button
              type="submit"
              className="mission-btn flex items-center justify-center gap-2 border border-shalom-wine/35 px-4 py-2 font-semibold text-shalom-wine hover:bg-shalom-wine/10 disabled:cursor-not-allowed disabled:opacity-55 dark:border-rose-200/20 dark:text-rose-100 dark:hover:bg-rose-400/10 lg:self-end"
              disabled={!restoreFile || restoreConfirmation !== 'RESTAURAR' || restoring}
            >
              <RotateCcw size={16} />
              {restoring ? 'Restaurando...' : 'Restaurar'}
            </button>
          </form>
        </div>
      </section>
      ) : null}

      {message ? <p className="rounded-2xl bg-shalom-cream/70 px-4 py-3 text-sm text-shalom-deep dark:bg-white/10 dark:text-shalom-gold">{message}</p> : null}
    </div>
  )
}
