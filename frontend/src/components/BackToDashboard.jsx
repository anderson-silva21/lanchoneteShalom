import { Link } from 'react-router-dom'

export function BackToDashboard({ className = '' }) {
  return (
    <Link
      to="/dashboard"
      className={`inline-flex min-h-11 items-center px-1 text-sm font-semibold text-shalom-blue transition-colors hover:text-shalom-orange dark:text-shalom-gold ${className}`}
    >
      Voltar para Dashboard
    </Link>
  )
}
