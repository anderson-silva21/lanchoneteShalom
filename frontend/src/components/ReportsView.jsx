import { ClipboardCheck, Database, Download, FileBarChart, FileSpreadsheet, FileText, Send } from 'lucide-react'
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

export function ReportsView() {
  const [message, setMessage] = useState('')
  const [backups, setBackups] = useState([])
  const [dataset, setDataset] = useState(null)

  useEffect(() => {
    api.backups().then(setBackups).catch(() => null)
    api.powerBiDataset().then(setDataset).catch(() => null)
  }, [])

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

  async function pushPowerBi() {
    setMessage('')
    try {
      await api.pushPowerBi()
      setMessage('Dataset enviado ao Power BI.')
    } catch (err) {
      setMessage(err.message)
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

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="mission-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Power BI</h2>
              <p className="mission-muted text-sm">{dataset ? `${dataset.products.length} produtos, ${dataset.sales.length} vendas` : 'Dataset local'}</p>
            </div>
            <button className="mission-btn mission-btn-primary flex items-center gap-2 px-4 py-2 font-semibold" onClick={pushPowerBi}>
              <Send size={16} />
              Enviar
            </button>
          </div>
          <div className="mt-4 rounded-2xl bg-shalom-cream/70 p-3 text-sm text-shalom-deep dark:bg-white/10 dark:text-shalom-gold">
            Endpoint: <span className="font-mono">GET /api/powerbi/dataset</span>
          </div>
        </div>

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
                <span className="font-mono">{backup.file}</span>
                <span className="mission-muted">{formatDateTime(backup.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {message ? <p className="rounded-2xl bg-shalom-cream/70 px-4 py-3 text-sm text-shalom-deep dark:bg-white/10 dark:text-shalom-gold">{message}</p> : null}
    </div>
  )
}
