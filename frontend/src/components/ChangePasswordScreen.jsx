import { ValidatedForm, FormControl } from './ValidatedForm'
import { reportFormError } from '../utils/formValidation'
import { KeyRound, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { BrandMark } from './BrandMark'

export function ChangePasswordScreen({ user, onChangePassword, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    const validationForm = event.currentTarget
    event.preventDefault()
    setMessage('')

    setLoading(true)
    try {
      await onChangePassword(currentPassword, newPassword)
    } catch (err) {
      reportFormError(validationForm, err)
      setMessage(err.message)
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
            <h1 className="font-display text-2xl font-semibold">Trocar senha</h1>
            <p className="mission-muted text-sm">{user?.name || user?.username}</p>
          </div>
        </div>

        <ValidatedForm className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium">
            Senha temporaria
            <FormControl unframed name="current_password" required
              className="mission-input mt-2 w-full px-3 py-3"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          <label className="block text-sm font-medium">
            Nova senha
            <FormControl unframed name="new_password" required minLength={6}
              className="mission-input mt-2 w-full px-3 py-3"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </label>
          <label className="block text-sm font-medium">
            Confirmar nova senha
            <FormControl unframed name="confirm_password" required data-match="new_password"
              className="mission-input mt-2 w-full px-3 py-3"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </label>
          {message ? <p className="rounded-xl bg-shalom-wine/10 px-3 py-2 text-sm text-shalom-wine dark:bg-shalom-wine/25 dark:text-rose-100">{message}</p> : null}
          <button className="mission-btn mission-btn-primary flex w-full items-center justify-center gap-2 px-4 py-3 font-semibold" disabled={loading}>
            <LockKeyhole size={18} />
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </ValidatedForm>

        <button
          type="button"
          className="mission-btn mt-4 flex w-full items-center justify-center gap-2 border border-shalom-gold/30 px-4 py-3 font-medium dark:border-shalom-gold/10"
          onClick={onLogout}
        >
          <KeyRound size={17} />
          Voltar para login
        </button>
      </section>
    </main>
  )
}
