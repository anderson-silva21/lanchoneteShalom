import { ChevronRight } from 'lucide-react'
import { formatQuantityWithUnit, money } from '../../utils/formatters'
import { StatusPill } from '../StatusPill'

export function ProductCompactList({ products, selectedProductId, onSelectProduct }) {
  if (!products.length) {
    return <p className="mission-muted px-3 py-8 text-center text-sm">Nenhum produto encontrado.</p>
  }

  return (
    <div className="min-w-0">
      {products.map((product) => {
        const isSelected = String(selectedProductId) === String(product.id)

        return (
          <button
            key={product.id}
            type="button"
            className={`relative flex min-h-[76px] w-full min-w-0 items-center gap-3 border-b border-line/70 px-3 py-3 text-left transition-colors hover:bg-shalom-mist/55 dark:border-shalom-gold/10 dark:hover:bg-white/5 ${isSelected ? 'bg-shalom-mist/45 dark:bg-white/5' : ''}`}
            onClick={() => onSelectProduct(product.id)}
            aria-current={isSelected ? 'true' : undefined}
          >
            {isSelected ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-shalom-blue" aria-hidden="true" /> : null}
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <strong className="min-w-0 flex-1 truncate text-sm">{product.name}</strong>
                <StatusPill status={product.stock_status} />
              </span>
              <span className="mission-muted mt-1 block truncate text-xs">{product.internal_code || '-'} - {product.category || '-'}</span>
              <span className="mt-1 flex items-center gap-3 text-xs">
                <span className="font-semibold text-shalom-blue dark:text-shalom-gold">{money.format(product.sale_price || 0)}</span>
                <span className="mission-muted">{formatQuantityWithUnit(product.stock_quantity, product.unit)}</span>
              </span>
            </span>
            <ChevronRight className="shrink-0 opacity-45" size={18} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
