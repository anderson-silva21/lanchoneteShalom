import { ArrowLeft, PackagePlus, Save, Search, Trash2 } from 'lucide-react'
import { formatDate, formatQuantityWithUnit } from '../../utils/formatters'
import { PaginationControls } from '../PaginationControls'
import { ProductHistoryPanel } from './ProductHistoryPanel'
import { ProductCompactList } from './ProductCompactList'
import { ProductStockLots } from './ProductStockLots'

const productSections = [
  ['details', 'Detalhes'],
  ['stock', 'Estoque'],
  ['lots', 'Lotes'],
  ['history', 'Historico']
]

export function ProductWorkspace({ catalog, selection, creation, stock, permissions, ui, actions }) {
  const {
    categories,
    paginatedProducts,
    page,
    pageSize,
    posVisibility,
    query,
    sortConfig,
    status,
    totalItems
  } = catalog
  const { productHistory, selectedBatches, selectedProduct, selectedProductId, selectedStock } = selection
  const { draft, setDraft } = creation
  const {
    adjustment,
    movementBatches,
    movementMode,
    movementProductRef,
    needsMovementBatch,
    setAdjustment,
    showsMovementExpiration
  } = stock
  const { canDeleteProducts, canEditHistoricalCosts, canManagePosVisibility } = permissions
  const { detailMode, message, mobileContextOpen, productSection } = ui

  function setDraftField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function setAdjustmentField(field, value) {
    setAdjustment((current) => ({ ...current, [field]: value }))
  }

  return (
    <div className="-mx-3 -mt-4 min-w-0 sm:-mx-5 lg:mx-0 lg:mt-0">
      <div className="grid min-w-0 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <section className={`min-w-0 lg:border-r lg:border-line/80 lg:pr-4 dark:lg:border-shalom-gold/10 ${mobileContextOpen ? 'hidden lg:block' : ''}`} aria-label="Lista de produtos">
          <div className="border-b border-line/80 px-3 pb-3 pt-2 dark:border-shalom-gold/10 sm:px-5 lg:px-0 lg:pt-0">
            <div className="flex items-center justify-between gap-3">
              <p className="mission-muted text-sm">{totalItems} produtos</p>
              <button type="button" className="flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-shalom-blue dark:text-shalom-gold" onClick={actions.onOpenCreate}>
                <PackagePlus size={18} aria-hidden="true" />
                Adicionar
              </button>
            </div>

            <label className="relative mt-2 block">
              <span className="sr-only">Buscar produtos</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-shalom-orange/70" size={17} aria-hidden="true" />
              <input type="search" className="mission-input h-11 w-full pl-10 pr-3" placeholder="Buscar" value={query} onChange={(event) => actions.onQueryChange(event.target.value)} />
            </label>

            <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-3">
              <select className="mission-input min-w-0 px-2 py-2 text-sm" value={status} onChange={(event) => actions.onStatusChange(event.target.value)} aria-label="Filtrar estoque">
                <option value="">Todo estoque</option>
                <option value="low">Baixo</option>
                <option value="critical">Critico</option>
              </select>
              <select className="mission-input min-w-0 px-2 py-2 text-sm" value={posVisibility} onChange={(event) => actions.onPosVisibilityChange(event.target.value)} aria-label="Filtrar visibilidade no PDV">
                <option value="all">Todos no PDV</option>
                <option value="visible">Visiveis</option>
                <option value="hidden">Ocultos</option>
              </select>
              <select
                className="mission-input col-span-2 min-w-0 px-2 py-2 text-sm xl:col-span-1"
                value={`${sortConfig.key}:${sortConfig.direction}`}
                onChange={(event) => {
                  const [key, direction] = event.target.value.split(':')
                  actions.onSortChange({ key, direction })
                }}
                aria-label="Ordenar produtos"
              >
                <option value=":asc">Ordem padrao</option>
                <option value="name:asc">Nome A-Z</option>
                <option value="name:desc">Nome Z-A</option>
                <option value="stock_quantity:asc">Menor estoque</option>
                <option value="stock_quantity:desc">Maior estoque</option>
                <option value="sale_price:asc">Menor preco</option>
                <option value="sale_price:desc">Maior preco</option>
              </select>
            </div>
          </div>

          <ProductCompactList products={paginatedProducts} selectedProductId={selectedProductId} onSelectProduct={actions.onSelectProduct} />
          <div className="px-3 pb-3 sm:px-5 lg:px-0">
            <PaginationControls page={page} pageSize={pageSize} totalItems={totalItems} itemLabel="produtos" onPageChange={actions.onPageChange} />
          </div>
        </section>

        <section className={`min-w-0 lg:pl-4 ${mobileContextOpen ? '' : 'hidden lg:block'}`} aria-label="Contexto do produto">
          <div className="border-b border-line/80 px-3 pb-2 pt-2 dark:border-shalom-gold/10 sm:px-5 lg:px-0 lg:pt-0">
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center text-shalom-blue lg:hidden" onClick={actions.onBackToList} aria-label="Voltar para produtos" title="Voltar">
                <ArrowLeft size={21} aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-lg font-semibold">{detailMode === 'create' ? 'Adicionar produto' : selectedProduct?.name || 'Selecione um produto'}</h2>
                {detailMode === 'product' && selectedProduct ? <p className="mission-muted truncate text-xs">{selectedProduct.internal_code || '-'} - {formatQuantityWithUnit(selectedStock?.totalQuantity ?? selectedProduct.stock_quantity, selectedProduct.unit)}</p> : null}
              </div>
            </div>

            {detailMode === 'product' && selectedProduct ? (
              <div className="scrollbar-hidden mt-1 flex gap-5 overflow-x-auto" role="tablist" aria-label="Contextos do produto">
                {productSections.map(([key, label]) => (
                  <button key={key} type="button" role="tab" aria-selected={productSection === key} className={`section-text-tab ${productSection === key ? 'section-text-tab-active' : ''}`} onClick={() => actions.onSelectSection(key)}>{label}</button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="min-w-0">
            {detailMode === 'create' ? (
              <form className="grid min-w-0 gap-3 px-3 py-4 sm:grid-cols-2 sm:px-5 lg:px-0" onSubmit={actions.onCreateProduct}>
                <label className="text-sm font-medium sm:col-span-2">Nome<input className="mission-input mt-1 w-full px-3 py-2.5" value={draft.name} onChange={(event) => setDraftField('name', event.target.value)} /></label>
                <label className="text-sm font-medium">Categoria<select className="mission-input mt-1 w-full px-3 py-2.5" value={draft.category} onChange={(event) => setDraftField('category', event.target.value)}><option value="" disabled>Selecione</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
                <label className="text-sm font-medium">Unidade<input className="mission-input mt-1 w-full px-3 py-2.5" value={draft.unit} onChange={(event) => setDraftField('unit', event.target.value)} /></label>
                <label className="text-sm font-medium sm:col-span-2">Fornecedor<input className="mission-input mt-1 w-full px-3 py-2.5" value={draft.supplier} onChange={(event) => setDraftField('supplier', event.target.value)} /></label>
                <label className="text-sm font-medium sm:col-span-2">URL da imagem<input type="url" className="mission-input mt-1 w-full px-3 py-2.5" value={draft.image_url || ''} onChange={(event) => setDraftField('image_url', event.target.value)} placeholder="https://exemplo.com/produto.jpg" /></label>
                <label className="text-sm font-medium">Validade<input type="date" className="mission-input mt-1 w-full px-3 py-2.5" value={draft.expiration_date} onChange={(event) => setDraftField('expiration_date', event.target.value)} /></label>
                <label className="text-sm font-medium">Estoque inicial<input type="number" inputMode="decimal" min="0" step="0.001" className="mission-input mt-1 w-full px-3 py-2.5" value={draft.stock_quantity} onChange={(event) => setDraftField('stock_quantity', Number(event.target.value))} /></label>
                <label className="text-sm font-medium">Custo<input type="number" inputMode="decimal" min="0" step="0.01" className="mission-input mt-1 w-full px-3 py-2.5 disabled:opacity-60" value={draft.is_donation ? 0 : draft.cost_price} disabled={Boolean(draft.is_donation)} onChange={(event) => setDraftField('cost_price', Number(event.target.value))} /></label>
                <label className="text-sm font-medium">Venda<input type="number" inputMode="decimal" min="0" step="0.01" className="mission-input mt-1 w-full px-3 py-2.5" value={draft.sale_price} onChange={(event) => setDraftField('sale_price', Number(event.target.value))} /></label>
                <label className="text-sm font-medium">Estoque minimo<input type="number" inputMode="decimal" min="0" step="0.001" className="mission-input mt-1 w-full px-3 py-2.5" value={draft.min_stock} onChange={(event) => setDraftField('min_stock', Number(event.target.value))} /></label>
                <label className="flex min-h-11 items-center justify-between gap-3 border-y border-line/70 py-2 text-sm font-medium dark:border-shalom-gold/10"><span>Recebido por doacao</span><input type="checkbox" className="h-5 w-5 accent-shalom-orange" checked={Boolean(draft.is_donation)} onChange={(event) => setDraft((current) => ({ ...current, is_donation: event.target.checked, cost_price: event.target.checked ? 0 : current.cost_price }))} /></label>
                {canManagePosVisibility ? <label className="flex min-h-11 items-center justify-between gap-3 border-y border-line/70 py-2 text-sm font-medium dark:border-shalom-gold/10"><span>Exibir no PDV</span><input type="checkbox" className="h-5 w-5 accent-shalom-orange" checked={Boolean(draft.visible_in_pos)} onChange={(event) => setDraftField('visible_in_pos', event.target.checked)} /></label> : null}
                <button className="mission-btn mission-btn-primary flex min-h-12 items-center justify-center gap-2 px-4 py-3 font-semibold sm:col-span-2"><PackagePlus size={17} />Cadastrar</button>
              </form>
            ) : !selectedProduct ? (
              <p className="mission-muted px-3 py-10 text-center text-sm">Selecione um produto na lista.</p>
            ) : productSection === 'details' ? (
              <form className="grid min-w-0 gap-3 px-3 py-4 sm:grid-cols-2 sm:px-5 lg:px-0" onSubmit={(event) => { event.preventDefault(); actions.onSaveProduct(selectedProduct) }}>
                <label className="text-sm font-medium sm:col-span-2">Nome<input className="mission-input mt-1 w-full px-3 py-2.5" value={selectedProduct.name} onChange={(event) => actions.onChangeProduct(selectedProduct.id, 'name', event.target.value)} /></label>
                <label className="text-sm font-medium">Categoria<select className="mission-input mt-1 w-full px-3 py-2.5" value={selectedProduct.category} onChange={(event) => actions.onChangeProduct(selectedProduct.id, 'category', event.target.value)}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
                <label className="text-sm font-medium">Unidade<input className="mission-input mt-1 w-full px-3 py-2.5" value={selectedProduct.unit || ''} onChange={(event) => actions.onChangeProduct(selectedProduct.id, 'unit', event.target.value)} /></label>
                <label className="text-sm font-medium sm:col-span-2">Fornecedor<input className="mission-input mt-1 w-full px-3 py-2.5" value={selectedProduct.supplier || ''} onChange={(event) => actions.onChangeProduct(selectedProduct.id, 'supplier', event.target.value)} /></label>
                <label className="text-sm font-medium sm:col-span-2">URL da imagem<input type="url" className="mission-input mt-1 w-full px-3 py-2.5" value={selectedProduct.image_url || ''} onChange={(event) => actions.onChangeProduct(selectedProduct.id, 'image_url', event.target.value)} placeholder="https://exemplo.com/produto.jpg" /></label>
                <label className="text-sm font-medium">Custo<input type="number" inputMode="decimal" min="0" step="0.01" className="mission-input mt-1 w-full px-3 py-2.5 disabled:opacity-60" value={selectedProduct.is_donation ? 0 : selectedProduct.cost_price} disabled={Boolean(selectedProduct.is_donation)} onChange={(event) => actions.onChangeProduct(selectedProduct.id, 'cost_price', Number(event.target.value))} /></label>
                <label className="text-sm font-medium">Venda<input type="number" inputMode="decimal" min="0" step="0.01" className="mission-input mt-1 w-full px-3 py-2.5" value={selectedProduct.sale_price} onChange={(event) => actions.onChangeProduct(selectedProduct.id, 'sale_price', Number(event.target.value))} /></label>
                <label className="text-sm font-medium">Estoque minimo<input type="number" inputMode="decimal" min="0" step="0.001" className="mission-input mt-1 w-full px-3 py-2.5" value={selectedProduct.min_stock} onChange={(event) => actions.onChangeProduct(selectedProduct.id, 'min_stock', Number(event.target.value))} /></label>
                <label className="text-sm font-medium">Proxima validade<input type="date" className="mission-input mt-1 w-full px-3 py-2.5" value={selectedProduct.expiration_date || ''} onChange={(event) => actions.onChangeProduct(selectedProduct.id, 'expiration_date', event.target.value)} /></label>
                <label className="flex min-h-11 items-center justify-between gap-3 border-y border-line/70 py-2 text-sm font-medium dark:border-shalom-gold/10"><span>Recebido por doacao</span><input type="checkbox" className="h-5 w-5 accent-shalom-orange" checked={Boolean(selectedProduct.is_donation)} onChange={(event) => actions.onChangeProduct(selectedProduct.id, 'is_donation', event.target.checked)} /></label>
                {canManagePosVisibility && Number(selectedProduct.sale_price) > 0 ? <label className="flex min-h-11 items-center justify-between gap-3 border-y border-line/70 py-2 text-sm font-medium dark:border-shalom-gold/10"><span>Exibir no PDV</span><input type="checkbox" className="h-5 w-5 accent-shalom-orange" checked={Boolean(selectedProduct.visible_in_pos)} onChange={(event) => actions.onUpdatePosVisibility(selectedProduct, event.target.checked)} /></label> : null}
                <div className="flex flex-col gap-2 border-t border-line/70 pt-4 dark:border-shalom-gold/10 sm:col-span-2 sm:flex-row">
                  <button className="mission-btn mission-btn-primary flex min-h-12 flex-1 items-center justify-center gap-2 px-4 py-3 font-semibold"><Save size={17} />Salvar produto</button>
                  {canDeleteProducts ? <button type="button" className="flex min-h-12 items-center justify-center gap-2 px-4 py-3 font-semibold text-shalom-wine dark:text-rose-200" onClick={() => actions.onDeleteProduct(selectedProduct)}><Trash2 size={17} />Excluir</button> : null}
                </div>
              </form>
            ) : productSection === 'stock' ? (
              <form className="grid min-w-0 gap-3 px-3 py-4 sm:grid-cols-2 sm:px-5 lg:px-0" onSubmit={actions.onCreateMovement}>
                <label className="text-sm font-medium sm:col-span-2">Produto<select ref={movementProductRef} className="mission-input mt-1 w-full px-3 py-2.5" value={adjustment.product_id} onChange={(event) => actions.onStartStockMovement(event.target.value)}><option value="">Selecione</option>{catalog.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                <label className="text-sm font-medium">Tipo<select className="mission-input mt-1 w-full px-3 py-2.5" value={movementMode} onChange={(event) => actions.onMovementModeChange(event.target.value)}><option value="purchase">Compra</option><option value="adjustment_in">Ajuste entrada</option><option value="adjustment_out">Ajuste saida</option><option value="waste">Desperdicio</option></select></label>
                <label className="text-sm font-medium">Quantidade<input type="number" inputMode="decimal" min="0.001" step="0.001" className="mission-input mt-1 w-full px-3 py-2.5" value={adjustment.quantity} onChange={(event) => setAdjustmentField('quantity', Number(event.target.value))} /></label>
                {movementMode === 'purchase' ? <>
                  <label className="flex min-h-11 items-center justify-between gap-3 border-y border-line/70 py-2 text-sm font-medium sm:col-span-2 dark:border-shalom-gold/10"><span>Entrada recebida por doacao</span><input type="checkbox" className="h-5 w-5 accent-shalom-orange" checked={Boolean(adjustment.is_donation)} onChange={(event) => setAdjustment((current) => ({ ...current, is_donation: event.target.checked, cost_price: event.target.checked ? 0 : current.cost_price }))} /></label>
                  <label className="text-sm font-medium">Custo do produto<input type="number" inputMode="decimal" min="0" step="0.01" className="mission-input mt-1 w-full px-3 py-2.5 disabled:opacity-60" value={adjustment.is_donation ? 0 : (adjustment.cost_price ?? '')} disabled={Boolean(adjustment.is_donation)} onChange={(event) => setAdjustmentField('cost_price', event.target.value)} /></label>
                  <label className="text-sm font-medium">Valor de venda<input type="number" inputMode="decimal" min="0" step="0.01" className="mission-input mt-1 w-full px-3 py-2.5" value={adjustment.sale_price ?? ''} onChange={(event) => setAdjustmentField('sale_price', event.target.value)} /></label>
                </> : <label className="text-sm font-medium sm:col-span-2">Lote {needsMovementBatch ? '' : '(opcional)'}<select className="mission-input mt-1 w-full px-3 py-2.5" value={adjustment.batch_id} onChange={(event) => setAdjustmentField('batch_id', event.target.value)}><option value="">{needsMovementBatch ? 'Selecione um lote' : 'Criar novo lote'}</option>{movementBatches.map((batch) => <option key={batch.id} value={batch.id}>#{batch.id} - {formatDate(batch.expiration_date)} - {formatQuantityWithUnit(batch.quantity_available, batch.unit)}</option>)}</select></label>}
                {showsMovementExpiration ? <label className="text-sm font-medium">Validade do lote<input type="date" className="mission-input mt-1 w-full px-3 py-2.5" value={adjustment.expiration_date} onChange={(event) => setAdjustmentField('expiration_date', event.target.value)} /></label> : null}
                <label className={`text-sm font-medium ${showsMovementExpiration ? '' : 'sm:col-span-2'}`}>Observacao<input className="mission-input mt-1 w-full px-3 py-2.5" value={adjustment.notes} onChange={(event) => setAdjustmentField('notes', event.target.value)} /></label>
                <button className="mission-btn mission-btn-primary flex min-h-12 items-center justify-center gap-2 px-4 py-3 font-semibold sm:col-span-2"><Save size={17} />Salvar movimento</button>
              </form>
            ) : productSection === 'lots' ? (
              <ProductStockLots selectedBatches={selectedBatches} selectedProductId={selectedProductId} selectedStock={selectedStock} onBatchChange={actions.onBatchChange} onSaveBatch={actions.onSaveBatch} />
            ) : (
              <ProductHistoryPanel canEditHistoricalCosts={canEditHistoricalCosts} onUpdateSaleItemCost={actions.onUpdateSaleItemCost} productHistory={productHistory} selectedProduct={selectedProduct} selectedProductId={selectedProductId} />
            )}
          </div>
        </section>
      </div>

      {message ? <p className="mx-3 mt-3 border-l-2 border-shalom-orange px-3 py-2 text-sm text-shalom-deep dark:border-shalom-gold dark:text-shalom-gold sm:mx-5 lg:mx-0">{message}</p> : null}
    </div>
  )
}
