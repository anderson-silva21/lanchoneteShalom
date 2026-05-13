import { AlertTriangle, CheckCircle2, Flame } from 'lucide-react'
import { stockLabel } from '../utils/formatters'

export function StatusPill({ status }) {
  const normalized = status === 'critico' ? 'critical' : status === 'atencao' ? 'warning' : status
  const styles = {
    critical: 'bg-shalom-wine/10 text-shalom-wine ring-shalom-wine/25 dark:bg-shalom-wine/25 dark:text-rose-100 dark:ring-shalom-wine/40',
    warning: 'bg-shalom-gold/40 text-shalom-deep ring-shalom-orange/25 dark:bg-shalom-orange/20 dark:text-shalom-gold dark:ring-shalom-gold/25',
    normal: 'bg-shalom-mist text-shalom-blue ring-shalom-blue/10 dark:bg-shalom-blue/20 dark:text-blue-100 dark:ring-shalom-gold/10'
  }
  const Icon = normalized === 'critical' ? Flame : normalized === 'warning' ? AlertTriangle : CheckCircle2

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles[normalized] || styles.normal}`}>
      <Icon size={13} />
      {stockLabel(status)}
    </span>
  )
}
