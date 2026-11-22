import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Clipboard, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { api } from '../services/api'
import { money } from '../utils/formatters'

function PixCopyField({ payload }) {
  const [copied, setCopied] = useState(false)
  async function copyPix() {
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement('textarea')
      input.value = payload
      input.setAttribute('readonly', '')
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      const didCopy = document.execCommand('copy')
      input.remove()
      setCopied(didCopy)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  return <div className="mt-2 flex gap-2"><input readOnly value={payload} onFocus={(event) => event.target.select()} className="min-w-0 flex-1 rounded-xl border p-3 text-xs" aria-label="Código Pix copia e cola" /><button type="button" onClick={copyPix} className="flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-shalom-blue px-3 text-sm font-bold text-white" aria-label="Copiar código Pix">{copied ? <Check size={18} /> : <Clipboard size={18} />}{copied ? 'Copiado!' : 'Copiar'}</button></div>
}

export function SelfServiceKiosk() {
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState({})
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [step, setStep] = useState('catalog')
  const [pix, setPix] = useState(null)
  const [sale, setSale] = useState(null)
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState('Todos')
  const checkoutRef = useRef(null)
  const lines = useMemo(() => Object.entries(cart).map(([id, quantity]) => ({ product: products.find((item) => item.id === Number(id)), quantity })).filter((line) => line.product), [cart, products])
  const categories = useMemo(() => ['Todos', ...new Set(products.map((product) => product.category).filter(Boolean))], [products])
  const visibleProducts = useMemo(() => category === 'Todos' ? products : products.filter((product) => product.category === category), [category, products])
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  const total = lines.reduce((sum, line) => sum + line.product.sale_price * line.quantity, 0)

  useEffect(() => { api.selfServiceProducts().then(setProducts).catch(() => setError('Não foi possível carregar os produtos. Atualize a tela para tentar novamente.')) }, [])
  function quantity(id, delta) {
    setPix(null)
    const product = products.find((item) => item.id === id)
    setCart((current) => {
      const next = Math.min(Number(product?.stock_quantity || 0), Math.max(0, (current[id] || 0) + delta))
      const updated = { ...current }
      if (next) updated[id] = next
      else delete updated[id]
      return updated
    })
  }
  async function generatePix() {
    setError('')
    setLoading(true)
    try {
      const result = await api.generatePix(Math.round(total * 100))
      setPix(result)
      setQr(await QRCode.toDataURL(result.payload, { width: 320, margin: 2, color: { dark: '#142f53', light: '#ffffff' } }))
    } catch (err) { setError(err.message || 'Não foi possível gerar o Pix.') }
    finally { setLoading(false) }
  }
  async function checkout(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await api.createSelfServiceSale({ customer_name: name, customer_contact: phone, items: lines.map(({ product, quantity: count }) => ({ product_id: product.id, quantity: count })) })
      setSale(result.sale)
      setStep('payment')
    } catch (err) { setError(err.message || 'Não foi possível registrar a venda. Confira os itens e tente novamente.') }
    finally { setLoading(false) }
  }
  function startOver() { setCart({}); setName(''); setPhone(''); setPix(null); setSale(null); setQr(''); setError(''); setStep('catalog') }

  return <main className={`min-h-screen bg-[#f6f4ef] px-4 py-5 text-shalom-deep sm:px-8 sm:py-10 ${step === 'catalog' && itemCount ? 'pb-28' : ''}`}>
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-center justify-between"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-shalom-orange">Lanchonete Shalom</p><h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{step === 'payment' ? 'Pague com Pix' : 'Faça seu pedido'}</h1></div><ShoppingBag size={34} className="text-shalom-blue" /></header>
      {step === 'payment' && sale ? <section className="mx-auto max-w-xl rounded-3xl bg-white p-6 text-center shadow-xl sm:p-10"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={30} /></span><h2 className="mt-4 text-2xl font-bold">Venda #{sale.id} registrada</h2><p className="mt-2 text-slate-600">Pague <strong>{money.format(sale.total)}</strong> com o QR Code Pix abaixo.</p>{qr && <img className="mx-auto my-6 w-64 rounded-xl border p-2" src={qr} alt="QR Code Pix para pagamento" />}<label className="block text-left text-sm font-semibold">Pix copia e cola<PixCopyField payload={pix?.payload || ''} /></label><p className="mt-4 text-sm text-slate-500">Após pagar, aguarde a confirmação da equipe.</p><button type="button" onClick={startOver} className="mt-6 min-h-14 w-full rounded-xl bg-shalom-blue px-6 font-bold text-white">Finalizar e iniciar novo pedido</button></section> : <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <section className="min-w-0"><h2 className="mb-3 text-lg font-bold sm:mb-4 sm:text-xl">1. Escolha seus produtos</h2>{products.length ? <><nav className="sticky top-0 z-10 -mx-4 mb-4 flex gap-2 overflow-x-auto border-y border-slate-200 bg-[#f6f4ef]/95 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:mb-5 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0" role="tablist" aria-label="Categorias de produtos">{categories.map((name) => <button key={name} type="button" role="tab" aria-selected={category === name} onClick={() => setCategory(name)} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition ${category === name ? 'bg-shalom-blue text-white' : 'bg-white text-shalom-deep shadow-sm'}`}>{name}</button>)}</nav><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">{visibleProducts.map((product) => <article key={product.id} role="button" tabIndex={0} aria-label={`Adicionar ${product.name}`} onClick={() => quantity(product.id, 1)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); quantity(product.id, 1) } }} className="cursor-pointer rounded-2xl bg-white p-3 shadow-sm transition active:scale-[.98] sm:p-4"><div className="flex h-24 items-center justify-center overflow-hidden rounded-xl bg-slate-100 sm:h-32">{product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <span className="text-3xl font-bold text-shalom-blue">{product.name.charAt(0)}</span>}</div><h3 className="mt-3 min-h-10 text-sm font-semibold leading-snug sm:min-h-12 sm:text-base">{product.name}</h3><p className="mt-1 font-bold text-shalom-blue">{money.format(product.sale_price)}</p><div className="mt-3 flex items-center justify-between rounded-xl border"><button type="button" aria-label={`Diminuir ${product.name}`} className="grid h-11 w-11 place-items-center sm:h-12 sm:w-12" onClick={(event) => { event.stopPropagation(); quantity(product.id, -1) }}><Minus size={18} /></button><strong aria-live="polite">{cart[product.id] || 0}</strong><button type="button" aria-label={`Adicionar ${product.name}`} className="grid h-11 w-11 place-items-center sm:h-12 sm:w-12" onClick={(event) => { event.stopPropagation(); quantity(product.id, 1) }} disabled={(cart[product.id] || 0) >= product.stock_quantity}><Plus size={18} /></button></div></article>)}</div></> : <p className="rounded-xl bg-white p-6">{error || 'Carregando produtos...'}</p>}</section>
        <form ref={checkoutRef} onSubmit={checkout} className="h-fit scroll-mt-6 rounded-3xl bg-white p-5 shadow-lg sm:p-6 lg:sticky lg:top-6"><h2 className="text-xl font-bold">2. Confira e finalize</h2><div className="my-4 max-h-56 space-y-3 overflow-auto">{lines.length ? lines.map(({ product, quantity: count }) => <div key={product.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm"><span className="min-w-0 flex-1">{count} × {product.name}<strong className="ml-2 whitespace-nowrap">{money.format(count * product.sale_price)}</strong></span><button type="button" onClick={() => quantity(product.id, -count)} className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 font-semibold text-red-700 hover:bg-red-50" aria-label={`Remover ${product.name} do pedido`}><Trash2 size={17} /><span className="hidden sm:inline">Remover</span></button></div>) : <p className="text-slate-500">Adicione produtos ao pedido.</p>}</div><div className="flex justify-between border-t py-4 text-lg"><strong>Total</strong><strong>{money.format(total)}</strong></div><label className="mb-4 block text-sm font-semibold">Seu nome <span className="text-red-600">*</span><input required minLength={2} maxLength={120} value={name} onChange={(event) => { setName(event.target.value); setPix(null); setQr('') }} placeholder="Como podemos chamar você?" className="mt-2 h-12 w-full rounded-xl border px-3" /></label><label className="block text-sm font-semibold">Telefone <span className="font-normal text-slate-500">(opcional)</span><input type="tel" maxLength={24} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(00) 00000-0000" className="mt-2 h-12 w-full rounded-xl border px-3" /></label>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{pix && qr ? <div className="mt-5 rounded-2xl border border-shalom-blue/15 bg-slate-50 p-4 text-center"><h3 className="font-bold">Pix para pagar {money.format(total)}</h3><img className="mx-auto my-3 w-48 rounded-xl bg-white p-2" src={qr} alt="QR Code Pix para pagamento" /><label className="block text-left text-xs font-semibold">Pix copia e cola<PixCopyField payload={pix.payload} /></label></div> : <button type="button" disabled={!lines.length || name.trim().length < 2 || loading} onClick={generatePix} className="mt-5 min-h-14 w-full rounded-xl border-2 border-shalom-blue px-5 font-bold text-shalom-blue disabled:opacity-50">{loading ? 'Gerando Pix…' : 'Gerar QR Code Pix'}</button>}{pix && <button type="submit" disabled={!lines.length || loading} className="mt-3 min-h-14 w-full rounded-xl bg-shalom-blue px-5 font-bold text-white disabled:opacity-50">{loading ? 'Registrando venda…' : 'Registrar venda'}</button>}<p className="mt-3 text-center text-xs text-slate-500">O QR Code é exibido antes do registro da venda.</p></form>
      </div>}
    </div>
    {step === 'catalog' && itemCount > 0 && <button type="button" onClick={() => checkoutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="fixed inset-x-4 bottom-4 z-20 flex min-h-14 items-center justify-between rounded-2xl bg-shalom-blue px-5 font-bold text-white shadow-xl sm:hidden"><span>{itemCount} {itemCount === 1 ? 'item' : 'itens'} · Ver pedido</span><span>{money.format(total)}</span></button>}
  </main>
}
