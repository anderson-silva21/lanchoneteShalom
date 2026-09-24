import { Boxes, PackagePlus, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { formatDate, formatQuantityWithUnit, money } from '../../utils/formatters'
import { StatusPill } from '../StatusPill'

export function ProductMobileList({
  products,
  categories,
  selectedProductId,
  canDeleteProducts,
  canManagePosVisibility,
  onChangeProduct,
  onDeleteProduct,
  onSaveProduct,
  onUpdatePosVisibility,
  onSelectProduct,
  onStartStockMovement
}) {
  const [editingProductId, setEditingProductId] = useState('')

  if (!products.length) {
    return (
      <div className="rounded-2xl border border-dashed border-shalom-gold/50 p-5 text-sm mission-muted">
        Nenhum produto encontrado.
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-3">
      {products.map((product) => {
        const isEditing = String(editingProductId) === String(product.id)
        const isSelected = String(selectedProductId) === String(product.id)

        return (
          <article
            key={product.id}
            className={`mission-card min-w-0 p-4 ${isSelected ? 'border-shalom-orange/70 ring-2 ring-shalom-gold/30' : ''}`}
          >
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="break-words font-display text-lg font-semibold">{product.name}</h3>
                <p className="mission-muted mt-1 text-xs">{product.internal_code || '-'} - {product.category || '-'}</p>
              </div>
              <StatusPill status={product.stock_status} />
            </div>
            <div className="mt-3 flex min-h-11 items-center justify-between gap-3 border-y border-line/70 py-2 dark:border-shalom-gold/10">
              <span className="text-sm font-medium">{Number(product.sale_price) <= 0 ? 'Indisponivel para o PDV - sem preco de venda' : product.visible_in_pos ? 'Visivel no PDV' : 'Oculto no PDV'}</span>
              {canManagePosVisibility && Number(product.sale_price) > 0 ? <button type="button" role="switch" aria-checked={Boolean(product.visible_in_pos)} aria-label={`Exibir ${product.name} no PDV`} className={`relative h-7 w-12 shrink-0 rounded-full transition ${product.visible_in_pos ? 'bg-shalom-blue dark:bg-shalom-gold' : 'bg-slate-300 dark:bg-slate-600'}`} onClick={() => onUpdatePosVisibility(product, !product.visible_in_pos)}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${product.visible_in_pos ? 'left-6' : 'left-1'}`} /></button> : null}
            </div>

            <dl className="mt-4 grid min-w-0 grid-cols-1 gap-2 text-sm min-[380px]:grid-cols-2">
              <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                <dt className="mission-muted text-xs">Venda</dt>
                <dd className="mt-1 font-semibold">{money.format(product.sale_price || 0)}</dd>
              </div>
              <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                <dt className="mission-muted text-xs">Custo</dt>
                <dd className="mt-1 font-semibold">{product.is_donation ? 'Doacao' : money.format(product.cost_price || 0)}</dd>
              </div>
              <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                <dt className="mission-muted text-xs">Estoque</dt>
                <dd className="mt-1 font-semibold">{formatQuantityWithUnit(product.stock_quantity, product.unit)}</dd>
              </div>
              <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                <dt className="mission-muted text-xs">Minimo</dt>
                <dd className="mt-1 font-semibold">{formatQuantityWithUnit(product.min_stock, product.unit)}</dd>
              </div>
              <div className="rounded-xl bg-shalom-mist/70 p-3 dark:bg-white/10">
                <dt className="mission-muted text-xs">Validade</dt>
                <dd className="mt-1 font-semibold">{formatDate(product.expiration_date)}</dd>
              </div>
            </dl>

            <div className="mt-4 grid min-w-0 grid-cols-2 gap-2">
              <button
                type="button"
                className="mission-btn flex min-h-11 items-center justify-center gap-2 border border-line/80 px-3 py-2 text-sm font-semibold dark:border-shalom-gold/10"
                onClick={() => onSelectProduct(product.id)}
              >
                <Boxes size={16} />
                Detalhes
              </button>
              <button
                type="button"
                className="mission-btn mission-btn-gold flex min-h-11 items-center justify-center gap-2 px-3 py-2 text-sm font-semibold"
                onClick={() => onStartStockMovement(product.id)}
              >
                <PackagePlus size={16} />
                Estoque
              </button>
              <button
                type="button"
                className="mission-btn flex min-h-11 items-center justify-center gap-2 border border-line/80 px-3 py-2 text-sm font-semibold dark:border-shalom-gold/10"
                onClick={() => setEditingProductId(isEditing ? '' : String(product.id))}
              >
                Editar
              </button>
              {canDeleteProducts ? (
                <button
                  type="button"
                  className="mission-btn flex min-h-11 items-center justify-center gap-2 border border-shalom-wine/35 px-3 py-2 text-sm font-semibold text-shalom-wine dark:border-rose-200/20 dark:text-rose-100"
                  onClick={() => onDeleteProduct(product)}
                >
                  <Trash2 size={16} />
                  Excluir
                </button>
              ) : null}
            </div>

            {isEditing ? (
              <div className="mt-4 space-y-3 border-t border-line/70 pt-4 dark:border-shalom-gold/10">
                <label className="block text-sm font-medium">
                  Nome
                  <input
                    className="mission-input mt-1 w-full px-3 py-2.5"
                    value={product.name}
                    onChange={(event) => onChangeProduct(product.id, 'name', event.target.value)}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Categoria
                  <select
                    className="mission-input mt-1 w-full px-3 py-2.5"
                    value={product.category}
                    onChange={(event) => onChangeProduct(product.id, 'category', event.target.value)}
                  >
                    {categories.map((categoryName) => <option key={categoryName} value={categoryName}>{categoryName}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  URL da imagem
                  <input type="url" className="mission-input mt-1 w-full px-3 py-2.5" value={product.image_url || ''} onChange={(event) => onChangeProduct(product.id, 'image_url', event.target.value)} placeholder="https://exemplo.com/produto.jpg" />
                </label>
                {product.image_url ? <div key={product.image_url} className="overflow-hidden rounded-md bg-shalom-cream/60"><img className="aspect-video w-full object-cover" src={product.image_url} alt={`Preview de ${product.name}`} onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling.hidden = false }} /><p className="mission-muted hidden p-3 text-sm">Nao foi possivel carregar a imagem.</p></div> : null}
                <div className="grid min-w-0 grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Custo
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className="mission-input mt-1 w-full px-3 py-2.5 disabled:opacity-60"
                      value={product.is_donation ? 0 : product.cost_price}
                      disabled={Boolean(product.is_donation)}
                      onChange={(event) => onChangeProduct(product.id, 'cost_price', Number(event.target.value))}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Venda
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className="mission-input mt-1 w-full px-3 py-2.5"
                      value={product.sale_price}
                      onChange={(event) => onChangeProduct(product.id, 'sale_price', Number(event.target.value))}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Minimo
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.001"
                      className="mission-input mt-1 w-full px-3 py-2.5"
                      value={product.min_stock}
                      onChange={(event) => onChangeProduct(product.id, 'min_stock', Number(event.target.value))}
                    />
                  </label>
                </div>
                <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line/80 px-3 py-2 text-sm font-medium dark:border-shalom-gold/10">
                  <span>Produto recebido por doacao</span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-shalom-orange"
                    checked={Boolean(product.is_donation)}
                    onChange={(event) => onChangeProduct(product.id, 'is_donation', event.target.checked)}
                  />
                </label>
                <button
                  type="button"
                  className="mission-btn mission-btn-primary flex min-h-12 w-full items-center justify-center gap-2 px-4 py-3 font-semibold"
                  onClick={() => onSaveProduct(product)}
                >
                  <Save size={17} />
                  Salvar produto
                </button>
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
