import { BadgePercent, PackagePlus, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../../services/api'
import { money } from '../../utils/formatters'
import { ComboCreatorModal } from '../SalesTerminal'

export function OfferComboManager() {
  const [combos, setCombos] = useState([])
  const [products, setProducts] = useState([])
  const [editor, setEditor] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [comboRows, productRows] = await Promise.all([api.managedCombos(), api.products({ status: '' })])
      setCombos(comboRows)
      setProducts(productRows.filter((product) => product.active && product.sale_price > 0))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function removeCombo(combo) {
    if (!window.confirm(`Desativar "${combo.name}"? O historico de vendas sera preservado.`)) return
    try {
      await api.deleteCombo(combo.id)
      await loadData()
      setMessage(`${combo.name} foi desativado.`)
    } catch (error) {
      setMessage(error.message)
    }
  }

  return (
    <section className="mission-panel min-w-0 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-display text-lg font-semibold">Ofertas e combos</h2><p className="mission-muted text-sm">Configure as opcoes exibidas no PDV.</p></div>
        <div className="flex flex-col gap-2 min-[420px]:flex-row">
          <button type="button" className="mission-btn mission-btn-gold flex min-h-11 items-center justify-center gap-2 px-3 py-2 text-sm font-semibold" onClick={() => setEditor({ kind: 'promotion' })}><BadgePercent size={17} /> Nova oferta</button>
          <button type="button" className="mission-btn border border-line/80 flex min-h-11 items-center justify-center gap-2 px-3 py-2 text-sm font-semibold dark:border-shalom-gold/15" onClick={() => setEditor({ kind: 'combo' })}><PackagePlus size={17} /> Novo combo</button>
        </div>
      </div>

      {message ? <p className="mt-3 border-l-4 border-shalom-orange bg-shalom-cream/60 px-3 py-2 text-sm dark:bg-white/10">{message}</p> : null}
      <div className="mt-4 divide-y divide-line/80 dark:divide-shalom-gold/10">
        {loading ? <p className="py-5 mission-muted">Carregando ofertas...</p> : combos.map((combo) => (
          <article key={combo.id} className="grid min-w-0 gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_110px_120px_auto] sm:items-center">
            <div className="min-w-0"><p className="truncate font-semibold">{combo.name}</p><p className="mission-muted text-xs">{combo.items.map((item) => `${item.quantity}x ${item.name}`).join(' + ')}</p></div>
            <span className="text-sm font-medium">{combo.is_promotion ? 'Oferta' : 'Combo'}</span>
            <div><p className="font-semibold text-shalom-blue dark:text-shalom-gold">{money.format(combo.sale_price)}</p><p className="mission-muted text-xs">{combo.active ? 'Ativo' : 'Inativo'}</p></div>
            <div className="flex gap-2">
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md border border-line/80 dark:border-shalom-gold/15" onClick={() => setEditor({ combo })} aria-label={`Editar ${combo.name}`}><Pencil size={17} /></button>
              {combo.active ? <button type="button" className="flex h-11 w-11 items-center justify-center rounded-md text-shalom-wine dark:text-rose-200" onClick={() => removeCombo(combo)} aria-label={`Desativar ${combo.name}`}><Trash2 size={17} /></button> : null}
            </div>
          </article>
        ))}
        {!loading && !combos.length ? <p className="py-5 mission-muted">Nenhuma oferta cadastrada.</p> : null}
      </div>

      {editor ? <ComboCreatorModal products={products} initialCombo={editor.combo || null} initialKind={editor.kind} onClose={() => setEditor(null)} onCreated={async (combo) => { setEditor(null); await loadData(); setMessage(`${combo.name} salvo com sucesso.`) }} /> : null}
    </section>
  )
}
