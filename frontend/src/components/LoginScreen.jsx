import { LockKeyhole, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { BrandMark } from './BrandMark'

export function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onLogin(username, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-bg relative flex min-h-screen items-center justify-center overflow-hidden p-4 text-ink dark:text-slate-50">
      <span className="absolute left-[10%] top-[12%] h-56 w-56 animate-float rounded-full bg-shalom-gold/40 blur-3xl" />
      <span className="absolute bottom-[8%] right-[8%] h-72 w-72 animate-glow rounded-full bg-shalom-blue/20 blur-3xl" />
      <section className="mission-panel w-full max-w-md p-7">
        <div className="mb-7 flex items-center gap-3">
          <BrandMark size="lg" />
          <div>
            <h1 className="font-display text-2xl font-semibold">Lanchonete Shalom</h1>
            <p className="mission-muted text-sm">Controle de estoque e vendas</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium">
            Usuario
            <input
              className="mission-input mt-2 w-full px-3 py-3"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              type="text"
              autoComplete="username"
            />
          </label>
          <label className="block text-sm font-medium">
            Senha
            <input
              className="mission-input mt-2 w-full px-3 py-3"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="rounded-xl bg-shalom-wine/10 px-3 py-2 text-sm text-shalom-wine dark:bg-shalom-wine/25 dark:text-rose-100">{error}</p> : null}
          <button className="mission-btn mission-btn-primary flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" disabled={loading}>
            <LockKeyhole size={18} />
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="gold-line my-5" />

        <div className="flex items-center gap-2 rounded-2xl bg-shalom-cream/70 p-3 text-sm text-shalom-deep dark:bg-white/10 dark:text-shalom-gold">
          <Sparkles size={16} />
          Servir é amar.
        </div>
      </section>
    </main>
  )
}
