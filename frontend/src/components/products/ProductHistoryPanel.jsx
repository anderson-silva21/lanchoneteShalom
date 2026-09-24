import { Save } from 'lucide-react'
import { useState } from 'react'
import { formatDateTime, formatQuantityWithUnit, money } from '../../utils/formatters'

export function ProductHistoryPanel({ canEditHistoricalCosts = false, onUpdateSaleItemCost, productHistory, selectedProduct, selectedProductId }) {
  const historyMovements = productHistory?.movements || []
  const historySales = productHistory?.sales || []
  const historyAudit = productHistory?.audit || []
  const costCorrections = productHistory?.cost_corrections || []
  const [costDrafts, setCostDrafts] = useState({})
  const [reasonDrafts, setReasonDrafts] = useState({})

  return (
    <section className="min-w-0">
      {selectedProductId && productHistory === null ? (
        <p className="mission-muted px-3 py-6 text-sm">Carregando historico...</p>
      ) : selectedProduct ? (
        <div className="grid min-w-0 xl:grid-cols-3 xl:divide-x xl:divide-line/70 dark:xl:divide-shalom-gold/10">
          <div className="min-w-0 border-b border-line/70 px-3 py-4 dark:border-shalom-gold/10 xl:border-b-0">
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

          <div className="min-w-0 border-b border-line/70 px-3 py-4 dark:border-shalom-gold/10 xl:border-b-0">
            <h3 className="font-semibold">Vendas</h3>
            <div className="mt-3 max-h-64 overflow-y-auto scrollbar-thin">
              {historySales.slice(0, 12).map((sale) => (
                <div key={sale.id} className="border-b border-line/70 py-2 text-sm dark:border-shalom-gold/10">
                  <p className="font-semibold">Venda #{sale.sale_id} - {money.format(sale.line_total)}</p>
                  <p className="mission-muted break-words">{formatDateTime(sale.created_at)} - {formatQuantityWithUnit(sale.quantity, selectedProduct.unit)} - custo {money.format(sale.unit_cost)}</p>
                  {canEditHistoricalCosts ? (
                    <form
                      className="mt-2 grid gap-2"
                      onSubmit={(event) => {
                        event.preventDefault()
                        onUpdateSaleItemCost?.(sale, costDrafts[sale.id] ?? sale.unit_cost, reasonDrafts[sale.id] || '')
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
                      <label className="text-xs font-medium">
                        Motivo da alteracao
                        <input className="mission-input mt-1 w-full px-2 py-1.5" value={reasonDrafts[sale.id] || ''} onChange={(event) => setReasonDrafts((current) => ({ ...current, [sale.id]: event.target.value }))} required minLength={3} />
                      </label>
                      <button type="submit" className="mission-btn inline-flex min-h-10 items-center justify-center gap-1 border border-line/80 px-3 py-2 text-xs font-semibold dark:border-shalom-gold/10">
                        <Save size={13} />
                        Salvar
                      </button>
                    </form>
                  ) : null}
                  {costCorrections.filter((correction) => correction.sale_item_id === sale.id).map((correction) => (
                    <div key={correction.id} className="mt-2 border-l-2 border-shalom-blue/25 pl-2 text-xs dark:border-shalom-gold/30">
                      <p className="font-semibold">{money.format(correction.previous_unit_cost)} para {money.format(correction.new_unit_cost)}</p>
                      <p className="mission-muted">{correction.reason}</p>
                      <p className="mission-muted">{formatDateTime(correction.created_at)} - {correction.changed_by_name || '-'}</p>
                    </div>
                  ))}
                  {sale.event_name ? <p className="mission-muted mt-1 break-words">{sale.event_name}</p> : null}
                </div>
              ))}
              {!historySales.length ? <p className="mission-muted text-sm">Sem vendas.</p> : null}
            </div>
          </div>

          <div className="min-w-0 px-3 py-4">
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
        <p className="mission-muted px-3 py-6 text-sm">Selecione um produto para ver o historico.</p>
      )}
    </section>
  )
}
