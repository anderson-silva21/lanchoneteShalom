import { ChevronLeft, ChevronRight } from 'lucide-react'

export function PaginationControls({ page, pageSize = 10, totalItems, itemLabel = 'registros', onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (totalPages <= 1) return null

  const currentPage = Math.min(Math.max(1, page), totalPages)
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  return (
    <nav className="mt-4 flex flex-col gap-2 border-t border-line/70 pt-3 text-sm dark:border-shalom-gold/10 sm:flex-row sm:items-center sm:justify-between" aria-label="Paginacao">
      <p className="mission-muted">
        {startItem}-{endItem} de {totalItems} {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="mission-btn flex h-10 w-10 items-center justify-center border border-line/80 hover:bg-shalom-cream/70 disabled:cursor-not-allowed disabled:opacity-45 dark:border-shalom-gold/10 dark:hover:bg-white/10"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Pagina anterior"
          title="Pagina anterior"
        >
          <ChevronLeft size={17} aria-hidden="true" />
        </button>
        <span className="min-w-24 text-center font-semibold text-shalom-blue dark:text-shalom-gold">
          Pagina {currentPage} de {totalPages}
        </span>
        <button
          type="button"
          className="mission-btn flex h-10 w-10 items-center justify-center border border-line/80 hover:bg-shalom-cream/70 disabled:cursor-not-allowed disabled:opacity-45 dark:border-shalom-gold/10 dark:hover:bg-white/10"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Proxima pagina"
          title="Proxima pagina"
        >
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
