import shalomLogo from '../assets/shalom.png'

export function BrandMark({ size = 'md', dark = false }) {
  const dimensions = size === 'lg' ? 'h-16 w-16' : size === 'sm' ? 'h-9 w-9' : 'h-12 w-12'

  return (
    <span className={`${dimensions} inline-flex shrink-0 items-center justify-center rounded-full ${dark ? 'bg-white/10' : 'bg-white/80'} p-1 shadow-glow ring-1 ring-shalom-gold/40`}>
      <img
        src={shalomLogo}
        alt="Shalom"
        className="h-full w-full rounded-full object-contain"
      />
    </span>
  )
}
