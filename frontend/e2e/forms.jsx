import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { LoginScreen } from '../src/components/LoginScreen'
import { ChangePasswordScreen } from '../src/components/ChangePasswordScreen'
import { PublicLibraryStorefront } from '../src/components/PublicLibraryStorefront'
import { LibraryManager } from '../src/components/LibraryManager'
import { SettingsView } from '../src/components/SettingsView'
import { ProductWorkspace } from '../src/components/products/ProductWorkspace'
import { SalesTerminal } from '../src/components/SalesTerminal'
import { FormControl, ValidatedForm } from '../src/components/ValidatedForm'
import { reportFormError } from '../src/utils/formValidation'
import '../src/index.css'

export function Fields() {
  const [draft, setDraft] = useState({ name: '', category: '', quantity: '', image: '', notes: '' })
  const [saved, setSaved] = useState(false)
  const field = (name) => ({ value: draft[name], onChange: (event) => setDraft({ ...draft, [name]: event.target.value }) })
  return <main className="mx-auto max-w-lg p-4">
    <ValidatedForm className="grid gap-4" onSubmit={(event) => {
      event.preventDefault()
      if (draft.name === 'Duplicado') reportFormError(event.currentTarget, { payload: { issues: [{ path: ['name'], code: 'custom', message: 'Este nome ja existe. Escolha outro.' }, { path: ['images', 0, 'url'], code: 'invalid_format', format: 'url' }] } })
      else setSaved(true)
    }}>
      <label>Nome<FormControl unframed name="name" className="mission-input w-full p-2" required minLength={2} {...field('name')} /></label>
      <label>Categoria<FormControl unframed as="select" name="category" className="mission-input w-full p-2" required {...field('category')}><option value="">Selecione</option><option value="Livros">Livros</option></FormControl></label>
      <label>Quantidade<FormControl unframed name="quantity" type="number" min="0.001" step="0.001" required className="mission-input w-full p-2" {...field('quantity')} /></label>
      <label>Imagem<FormControl unframed name="images.0.url" type="url" data-format="http-url" className="mission-input w-full p-2" aria-describedby="image-hint" {...field('image')} /><span id="image-hint">URL da imagem</span></label>
      <label>Observacao<FormControl unframed as="textarea" name="notes" className="mission-input w-full p-2" {...field('notes')} /></label>
      <button type="submit">Salvar</button>
      {saved ? <p role="status">Salvo</p> : null}
    </ValidatedForm>
  </main>
}

const screen = new URLSearchParams(window.location.search).get('screen')
export function Workspace() {
  const [product, setProduct] = useState({ id: 1, name: 'Produto', category: 'Alimentos', unit: 'unidade', sale_price: 10, cost_price: 5, min_stock: 0, stock_quantity: 3, image_url: '' })
  const [adjustment, setAdjustment] = useState({ product_id: '1', quantity: 1, batch_id: '', notes: '' })
  const [section, setSection] = useState(screen === 'stock' ? 'stock' : 'details')
  return <ProductWorkspace
    catalog={{ categories: ['Alimentos'], products: [product], paginatedProducts: [product], totalItems: 1, page: 1, pageSize: 10, sortConfig: { key: '', direction: 'asc' } }}
    selection={{ selectedProduct: product, selectedProductId: 1, selectedStock: { totalQuantity: 3 } }}
    creation={{ draft: product, setDraft: setProduct }}
    stock={{ adjustment, setAdjustment, movementMode: 'adjustment_out', movementBatches: [{ id: 1, quantity_available: 3, unit: 'unidade' }], needsMovementBatch: true }}
    permissions={{}} ui={{ detailMode: screen === 'create-product' ? 'create' : 'product', mobileContextOpen: true, productSection: section }}
    actions={{ onSelectSection: setSection, onChangeProduct: (_id, field, value) => setProduct({ ...product, [field]: value }), onSaveProduct: (_product, form) => reportFormError(form, { payload: { issues: [{ path: ['unit'], code: 'custom', message: 'Esta unidade nao esta disponivel.' }] } }), onCreateProduct: (event) => { event.preventDefault(); reportFormError(event.currentTarget, { payload: { issues: [{ path: ['image_url'], code: 'custom', message: 'Esta imagem nao esta disponivel. Informe outra URL.' }] } }) }, onCreateMovement: (event) => { event.preventDefault(); event.currentTarget.dataset.saved = 'true' } }}
  />
}
const fail = async () => { throw Object.assign(new Error('Confira os dados.'), { payload: { fieldErrors: { current_password: 'Confira a senha temporaria informada.' } } }) }
createRoot(document.getElementById('root')).render(
  screen === 'login' ? <LoginScreen onLogin={fail} />
    : screen === 'password' ? <ChangePasswordScreen user={{ name: 'Teste' }} onChangePassword={fail} onLogout={() => {}} />
      : screen === 'storefront' ? <PublicLibraryStorefront />
        : screen === 'sales' ? <SalesTerminal onSaleComplete={() => {}} />
        : ['product', 'stock', 'create-product'].includes(screen) ? <Workspace />
          : screen === 'filters' ? <MemoryRouter initialEntries={['/gestao-livraria/planilha/filtros/vendas']}><LibraryManager user={{ role: 'admin' }} /></MemoryRouter>
            : screen === 'settings' ? <MemoryRouter initialEntries={['/sistema/usuarios']}><SettingsView user={{ role: 'admin' }} /></MemoryRouter>
        : <Fields />
)
