export function MetricCard({ icon: Icon, label, value, detail, tone = 'default' }) {
  const tones = {
    default: 'from-white/90 via-white/80 to-shalom-mist/70 text-ink dark:from-shalom-night/80 dark:via-shalom-deep/75 dark:to-shalom-blue/30 dark:text-slate-50',
    green: 'from-white via-shalom-mist/80 to-shalom-gold/30 text-ink dark:from-shalom-night/90 dark:via-shalom-blue/30 dark:to-shalom-deep/80 dark:text-blue-50',
    red: 'from-white via-shalom-cream/80 to-shalom-wine/10 text-shalom-wine dark:from-shalom-night/90 dark:via-shalom-wine/40 dark:to-shalom-deep/70 dark:text-rose-100',
    blue: 'from-white via-shalom-mist/90 to-blue-50 text-ink dark:from-shalom-night/90 dark:via-shalom-deep/80 dark:to-shalom-blue/30 dark:text-blue-50',
    amber: 'from-white via-shalom-cream/90 to-orange-50 text-ink dark:from-shalom-night/90 dark:via-shalom-orange/20 dark:to-shalom-deep/80 dark:text-amber-50'
  }

  return (
    <div className={`mission-card relative overflow-hidden border-shalom-gold/40 bg-gradient-to-br p-4 shadow-soft ${tones[tone]}`}>
      <span className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-shalom-gold/25 blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] opacity-65">{label}</p>
          <strong className="mt-2 block font-display text-2xl font-semibold tracking-normal sm:text-3xl">{value}</strong>
        </div>
        {Icon ? (
          <span className="rounded-2xl border border-white/70 bg-white/70 p-2.5 text-current shadow-sm dark:border-shalom-gold/10 dark:bg-white/10">
            <Icon size={20} />
          </span>
        ) : null}
      </div>
      {detail ? <p className="mt-3 text-sm opacity-70">{detail}</p> : null}
    </div>
  )
}
