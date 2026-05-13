import { PackagePlus, Save, Search, SlidersHorizontal } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'
import { decimal, money } from '../utils/formatters'
import { StatusPill } from './StatusPill'

const emptyProduct = {
  name: '',
  category: 'Lanches',
  cost_price: 0,
  sale_price: 0,
  stock_quantity: 0,
  min_stock: 0,
  supplier: '',
  internal_code: '',
  unit: 'unidade'
}

export function ProductManager({ refreshKey, onChanged }) {
  const [products, setProducts] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState(emptyProduct)
  const [adjustment, setAdjustment] = useState({ product_id: '', type: 'purchase', quantity: 1, notes: '' })
  const [message, setMessage] = useState('')

  const loadProducts = useCallback(async () => {
    const rows = await api.products({ status })
    setProducts(rows)
  }, [status])

  useEffect(() => {
    loadProducts().catch((err) => setMessage(err.message))
  }, [loadProducts, refreshKey])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return products
    return products.filter((product) => [product.name, product.category, product.internal_code, product.supplier]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term)))
  }, [products, query])

  async function createProduct(event) {
    event.preventDefault()
    setMessage('')
    try {
      await api.createProduct(draft)
      setDraft(emptyProduct)
      await loadProducts()
      onChanged()
      setMessage('Produto cadastrado.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  async function saveProduct(product) {
    setMessage('')
    try {
      await api.updateProduct(product.id, product)
      await loadProducts()
      onChanged()
      setMessage('Produto atualizado.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  async function createMovement(event) {
    event.preventDefault()
    setMessage('')
    try {
      await api.createMovement(adjustment)
      setAdjustment({ product_id: '', type: 'purchase', quantity: 1, notes: '' })
      await loadProducts()
      onChanged()
      setMessage('Estoque ajustado.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  function updateRow(id, field, value) {
    setProducts((current) => current.map((product) => product.id === id ? { ...product, [field]: value } : product))
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="mission-panel p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Cadastro de produtos</h2>
              <p className="mission-muted text-sm">{filtered.length} itens ativos</p>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-shalom-orange/70" size={16} />
                <input
                  className="mission-input w-full py-2 pl-9 pr-3 sm:w-64"
                  placeholder="Buscar"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <select className="mission-input px-3 py-2" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todos</option>
                <option value="low">Baixo</option>
                <option value="critical">Critico</option>
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto scrollbar-thin">
            <table className="min-w-[920px] w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.12em] text-shalom-blue/70 dark:text-shalom-gold/80">
                  <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Produto</th>
                  <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Categoria</th>
                  <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Custo</th>
                  <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Venda</th>
                  <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Estoque</th>
                  <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Minimo</th>
                  <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10">Status</th>
                  <th className="border-b border-line px-3 py-2 dark:border-shalom-gold/10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.id} className="border-b border-line/80 dark:border-shalom-gold/10">
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <input className="w-44 rounded-lg border border-transparent bg-transparent px-2 py-1 focus:border-shalom-gold/60" value={product.name} onChange={(event) => updateRow(product.id, 'name', event.target.value)} />
                      <p className="mission-muted px-2 text-xs">{product.internal_code}</p>
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <input className="w-32 rounded-lg border border-transparent bg-transparent px-2 py-1 focus:border-shalom-gold/60" value={product.category} onChange={(event) => updateRow(product.id, 'category', event.target.value)} />
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">{money.format(product.cost_price)}</td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <input type="number" className="mission-input w-24 px-2 py-1" value={product.sale_price} onChange={(event) => updateRow(product.id, 'sale_price', Number(event.target.value))} />
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      {decimal.format(product.stock_quantity)} {product.unit}
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <input type="number" className="mission-input w-20 px-2 py-1" value={product.min_stock} onChange={(event) => updateRow(product.id, 'min_stock', Number(event.target.value))} />
                    </td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10"><StatusPill status={product.stock_status} /></td>
                    <td className="border-b border-line/80 px-3 py-2 dark:border-shalom-gold/10">
                      <button className="mission-btn border border-line/80 p-2 hover:bg-shalom-cream/70 dark:border-shalom-gold/10 dark:hover:bg-white/10" onClick={() => saveProduct(product)} title="Salvar">
                        <Save size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          <form className="mission-panel p-4" onSubmit={createProduct}>
            <div className="mb-4 flex items-center gap-2">
              <PackagePlus size={20} />
              <h2 className="font-display text-lg font-semibold">Novo produto</h2>
            </div>
            <div className="grid gap-3">
              {[
                ['name', 'Nome'],
                ['category', 'Categoria'],
                ['internal_code', 'Codigo'],
                ['unit', 'Unidade'],
                ['supplier', 'Fornecedor']
              ].map(([field, label]) => (
                <label key={field} className="text-sm font-medium">
                  {label}
                  <input className="mission-input mt-1 w-full px-3 py-2" value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} />
                </label>
              ))}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['cost_price', 'Custo'],
                  ['sale_price', 'Venda'],
                  ['stock_quantity', 'Estoque'],
                  ['min_stock', 'Minimo']
                ].map(([field, label]) => (
                  <label key={field} className="text-sm font-medium">
                    {label}
                    <input type="number" step="0.01" className="mission-input mt-1 w-full px-3 py-2" value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: Number(event.target.value) })} />
                  </label>
                ))}
              </div>
            </div>
            <button className="mission-btn mission-btn-primary mt-4 flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold">
              <PackagePlus size={17} />
              Cadastrar
            </button>
          </form>

          <form className="mission-panel p-4" onSubmit={createMovement}>
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal size={20} />
              <h2 className="font-display text-lg font-semibold">Movimentar estoque</h2>
            </div>
            <label className="text-sm font-medium">
              Produto
              <select className="mission-input mt-1 w-full px-3 py-2" value={adjustment.product_id} onChange={(event) => setAdjustment({ ...adjustment, product_id: event.target.value })}>
                <option value="">Selecione</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">
                Tipo
                <select className="mission-input mt-1 w-full px-3 py-2" value={adjustment.type} onChange={(event) => setAdjustment({ ...adjustment, type: event.target.value })}>
                  <option value="purchase">Compra</option>
                  <option value="adjustment">Ajuste</option>
                  <option value="waste">Desperdicio</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Quantidade
                <input type="number" step="0.01" className="mission-input mt-1 w-full px-3 py-2" value={adjustment.quantity} onChange={(event) => setAdjustment({ ...adjustment, quantity: Number(event.target.value) })} />
              </label>
            </div>
            <label className="mt-3 block text-sm font-medium">
              Observacao
              <input className="mission-input mt-1 w-full px-3 py-2" value={adjustment.notes} onChange={(event) => setAdjustment({ ...adjustment, notes: event.target.value })} />
            </label>
            <button className="mission-btn mission-btn-gold mt-4 flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold">
              <Save size={17} />
              Salvar movimento
            </button>
          </form>
        </div>
      </section>

      {message ? <p className="rounded-2xl bg-shalom-cream/70 px-4 py-3 text-sm text-shalom-deep shadow-sm dark:bg-white/10 dark:text-shalom-gold">{message}</p> : null}
    </div>
  )
}
