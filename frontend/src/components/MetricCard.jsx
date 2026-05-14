export function MetricCard({ icon: Icon, label, value, detail, tone = 'default', onClick, ariaLabel }) {
  const tones = {
    default: 'from-white/92 via-white/82 to-shalom-mist/72 text-ink dark:from-shalom-night/88 dark:via-shalom-deep/78 dark:to-shalom-blue/32 dark:text-slate-50',
    green: 'from-white via-shalom-mist/82 to-shalom-gold/28 text-ink dark:from-shalom-night/90 dark:via-shalom-deep/78 dark:to-shalom-blue/34 dark:text-slate-50',
    red: 'from-white via-shalom-cream/82 to-shalom-wine/10 text-shalom-wine dark:from-shalom-night/90 dark:via-shalom-deep/76 dark:to-shalom-wine/28 dark:text-rose-100',
    blue: 'from-white via-shalom-mist/90 to-blue-50 text-ink dark:from-shalom-night/90 dark:via-shalom-deep/80 dark:to-shalom-blue/34 dark:text-blue-50',
    amber: 'from-white via-shalom-cream/88 to-orange-50 text-ink dark:from-shalom-night/90 dark:via-shalom-deep/78 dark:to-shalom-orange/22 dark:text-amber-50'
  }

  const className = `mission-card group relative flex min-h-[148px] flex-col justify-between overflow-hidden border-shalom-gold/40 bg-gradient-to-br p-4 shadow-soft sm:min-h-[156px] ${tones[tone]} ${
    onClick ? 'w-full text-left focus:outline-none focus:ring-2 focus:ring-shalom-orange/60 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-shalom-gold/70 dark:focus:ring-offset-shalom-night' : ''
  }`

  const content = (
    <>
      <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-shalom-gold/20 blur-2xl dark:bg-shalom-gold/10" />
      <div className="relative grid min-w-0 grid-cols-[minmax(0,1fr)_44px] items-start gap-3">
        <div className="min-w-0">
          <p className="min-h-9 text-xs font-semibold uppercase leading-[1.35] tracking-[0.12em] opacity-70 sm:text-[0.8rem]">
            {label}
          </p>
          <strong className="mt-2 block min-w-0 font-display text-2xl font-semibold leading-tight tracking-normal text-current break-words xl:text-[1.6rem] 2xl:text-3xl">
            {value}
          </strong>
        </div>
        {Icon ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/75 text-current shadow-sm dark:border-shalom-gold/15 dark:bg-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <Icon className="shrink-0" size={20} strokeWidth={2.1} />
          </span>
        ) : null}
      </div>
      {detail ? <p className="relative mt-4 text-sm leading-5 opacity-75">{detail}</p> : null}
    </>
  )

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-label={ariaLabel || label}>
        {content}
      </button>
    )
  }

  return (
    <div className={className}>
      {content}
    </div>
  )
}
