import { FileClock, Save } from 'lucide-react'
import { useState } from 'react'
import { formatDateTime, formatQuantityWithUnit, money } from '../../utils/formatters'

export function ProductHistoryPanel({ canEditHistoricalCosts = false, onUpdateSaleItemCost, productHistory, selectedProduct, selectedProductId }) {
  const historyMovements = productHistory?.movements || []
  const historySales = productHistory?.sales || []
  const historyAudit = productHistory?.audit || []
  const [costDrafts, setCostDrafts] = useState({})

  return (
    <section className="mission-panel min-w-0 p-4">
      <div className="flex items-center gap-2">
        <FileClock size={20} />
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">Historico do produto</h2>
          <p className="mission-muted break-words text-sm">{selectedProduct ? selectedProduct.name : 'Selecione um produto'}</p>
        </div>
      </div>

      {selectedProductId && productHistory === null ? (
        <p className="mt-4 rounded-2xl border border-line/80 bg-white/70 p-4 text-sm dark:border-shalom-gold/10 dark:bg-white/10">Carregando historico...</p>
      ) : selectedProduct ? (
        <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-3">
          <div className="mission-card min-w-0 p-4">
            <h3 className="font-semibold">Movimentacoes</h3>
            <div className="mt-3 max-h-64 overflow-y-auto scrollbar-thin">
              {historyMovements.slice(0, 12).map((movement) => (
                <div key={movement.id} className="border-b border-line/70 py-2 text-sm dark:border-shalom-gold/10">
                  <p className="font-semibold">{movement.type} {formatQuantityWithUnit(movement.quantity_change, selectedProduct.unit)}</p>
                  <p className="mission-muted break-words">{formatDateTime(movement.created_at)} - {movement.created_by_name || '-'}</p>
                  {movement.notes ? <p className="mission-muted mt-1 break-words">{movement.notes}</p> : null}
                </div>
              ))}
              {!historyMovements.length ? <p className="mission-muted text-sm">Sem movimentacoes.</p> : null}
            </div>
          </div>

          <div className="mission-card min-w-0 p-4">
            <h3 className="font-semibold">Vendas</h3>
            <div className="mt-3 max-h-64 overflow-y-auto scrollbar-thin">
              {historySales.slice(0, 12).map((sale) => (
                <div key={sale.id} className="border-b border-line/70 py-2 text-sm dark:border-shalom-gold/10">
                  <p className="font-semibold">Venda #{sale.sale_id} - {money.format(sale.line_total)}</p>
                  <p className="mission-muted break-words">{formatDateTime(sale.created_at)} - {formatQuantityWithUnit(sale.quantity, selectedProduct.unit)} - custo {money.format(sale.unit_cost)}</p>
                  {canEditHistoricalCosts ? (
                    <form
                      className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                      onSubmit={(event) => {
                        event.preventDefault()
                        onUpdateSaleItemCost?.(sale, costDrafts[sale.id] ?? sale.unit_cost)
                      }}
                    >
                      <label className="text-xs font-medium">
                        Custo da venda
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="mission-input mt-1 w-full px-2 py-1.5"
                          value={costDrafts[sale.id] ?? sale.unit_cost}
                          onChange={(event) => setCostDrafts((current) => ({ ...current, [sale.id]: event.target.value }))}
                        />
                      </label>
                      <button type="submit" className="mission-btn mt-auto inline-flex items-center justify-center gap-1 border border-line/80 px-2 py-1.5 text-xs font-semibold dark:border-shalom-gold/10">
                        <Save size={13} />
                        Salvar
                      </button>
                    </form>
                  ) : null}
                  {sale.event_name ? <p className="mission-muted mt-1 break-words">{sale.event_name}</p> : null}
                </div>
              ))}
              {!historySales.length ? <p className="mission-muted text-sm">Sem vendas.</p> : null}
            </div>
          </div>

          <div className="mission-card min-w-0 p-4">
            <h3 className="font-semibold">Auditoria</h3>
            <div className="mt-3 max-h-64 overflow-y-auto scrollbar-thin">
              {historyAudit.slice(0, 12).map((log) => (
                <div key={log.id} className="border-b border-line/70 py-2 text-sm dark:border-shalom-gold/10">
                  <p className="break-words font-semibold">{log.summary}</p>
                  <p className="mission-muted break-words">{formatDateTime(log.created_at)} - {log.username || '-'}</p>
                </div>
              ))}
              {!historyAudit.length ? <p className="mission-muted text-sm">Sem auditoria.</p> : null}
            </div>
          </div>
        </div>
      ) : (
        <p className="mission-muted mt-4 rounded-2xl border border-line/80 bg-white/70 p-4 text-sm dark:border-shalom-gold/10 dark:bg-white/10">Selecione um produto para ver o historico.</p>
      )}
    </section>
  )
}
