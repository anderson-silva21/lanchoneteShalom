import { Save } from 'lucide-react'
import { decimal, formatQuantityWithUnit } from '../../utils/formatters'

function getBatchStatusClass(status) {
  if (status === 'expired') return 'bg-shalom-wine/10 text-shalom-wine ring-shalom-wine/25 dark:bg-shalom-wine/25 dark:text-rose-100'
  if (status === 'critical') return 'bg-shalom-orange/15 text-shalom-wine ring-shalom-orange/25 dark:bg-shalom-orange/20 dark:text-shalom-gold'
  if (status === 'warning') return 'bg-shalom-gold/35 text-shalom-deep ring-shalom-orange/20 dark:bg-shalom-gold/20 dark:text-shalom-gold'
  if (status === 'missing') return 'bg-shalom-mist text-shalom-blue ring-shalom-blue/10 dark:bg-white/10 dark:text-slate-200'
  return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-100 dark:ring-emerald-400/20'
}

function getBatchStatusLabel(batch) {
  if (batch.expiration_status === 'expired') return `Vencido ha ${Math.abs(Number(batch.days_to_expire || 0))} dias`
  if (batch.expiration_status === 'critical' && Number(batch.days_to_expire) === 0) return 'Vence hoje'
  if (batch.expiration_status === 'critical' || batch.expiration_status === 'warning') return `Vence em ${decimal.format(batch.days_to_expire)} dias`
  if (batch.expiration_status === 'missing') return 'Sem validade'
  if (batch.expiration_status === 'empty') return 'Esgotado'
  return 'Ok'
}

function BatchStatusBadge({ batch }) {
  return (
    <span className={`inline-flex max-w-full shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getBatchStatusClass(batch.expiration_status)}`}>
      {getBatchStatusLabel(batch)}
    </span>
  )
}

export function ProductStockLots({
  selectedBatches,
  selectedProductId,
  selectedStock,
  onBatchChange,
  onSaveBatch
}) {
  return (
    <section id="product-lots-panel" className="min-w-0 scroll-mt-24">
      <div className="lg:hidden">
        {selectedProductId && selectedStock === null ? (
          <p className="mission-muted px-3 py-6 text-sm">Carregando lotes...</p>
        ) : selectedBatches.length ? selectedBatches.map((batch) => (
          <article key={batch.id} className="min-w-0 border-b border-line/70 px-3 py-4 dark:border-shalom-gold/10">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-xs mission-muted">Lote #{batch.id}</p>
                <p className="mt-1 break-words font-semibold">{formatQuantityWithUnit(batch.quantity_available, batch.unit)}</p>
              </div>
              <BatchStatusBadge batch={batch} />
            </div>
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-3">
              <label className="text-sm font-medium">
                Validade
                <input
                  type="date"
                  className="mission-input mt-1 w-full px-3 py-2.5"
                  value={batch.expiration_date || ''}
                  onChange={(event) => onBatchChange(batch.id, 'expiration_date', event.target.value)}
                />
              </label>
              <label className="text-sm font-medium">
                Quantidade
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  className="mission-input mt-1 w-full px-3 py-2.5"
                  value={batch.quantity_available ?? ''}
                  onChange={(event) => onBatchChange(batch.id, 'quantity_available', event.target.value)}
                />
              </label>
              <button
                type="button"
                className="mission-btn mission-btn-primary flex min-h-12 items-center justify-center gap-2 px-4 py-3 font-semibold"
                onClick={() => onSaveBatch(batch)}
              >
                <Save size={17} />
                Salvar lote
              </button>
            </div>
          </article>
        )) : (
          <p className="mission-muted px-3 py-6 text-sm">
            Nenhum lote para este produto.
          </p>
        )}
      </div>

      <div className="hidden overflow-x-auto border-y border-line/80 scrollbar-thin dark:border-shalom-gold/10 lg:block">
        <table className="min-w-[860px] w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-[0.12em] text-shalom-blue/70 dark:text-shalom-gold/80">
              <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Lote</th>
              <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Validade</th>
              <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Quantidade</th>
              <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Dias</th>
              <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Alerta</th>
              <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10"></th>
            </tr>
          </thead>
          <tbody>
            {selectedProductId && selectedStock === null ? (
              <tr>
                <td className="border-b border-line/80 px-3 py-3 dark:border-shalom-gold/10" colSpan={6}>Carregando lotes...</td>
              </tr>
            ) : selectedBatches.length ? selectedBatches.map((batch) => (
              <tr key={batch.id} className="border-b border-line/80 dark:border-shalom-gold/10">
                <td className="border-b border-line/80 px-3 py-2 font-mono text-xs dark:border-shalom-gold/10">#{batch.id}</td>
                <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                  <input
                    type="date"
                    className="mission-input w-40 px-2 py-1"
                    value={batch.expiration_date || ''}
                    onChange={(event) => onBatchChange(batch.id, 'expiration_date', event.target.value)}
                  />
                </td>
                <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.001"
                      className="mission-input w-28 px-2 py-1"
                      value={batch.quantity_available ?? ''}
                      onChange={(event) => onBatchChange(batch.id, 'quantity_available', event.target.value)}
                    />
                    <span className="mission-muted text-xs">{batch.unit}</span>
                  </div>
                </td>
                <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                  {batch.days_to_expire === null || batch.days_to_expire === undefined ? '-' : decimal.format(batch.days_to_expire)}
                </td>
                <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                  <BatchStatusBadge batch={batch} />
                </td>
                <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                  <button
                    type="button"
                    className="mission-btn border border-line/80 p-2 hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10"
                    onClick={() => onSaveBatch(batch)}
                    title="Salvar lote"
                    aria-label={`Salvar lote ${batch.id}`}
                  >
                    <Save size={16} />
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td className="border-b border-line/80 px-3 py-3 mission-muted dark:border-shalom-gold/10" colSpan={6}>
                  Nenhum lote para este produto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
