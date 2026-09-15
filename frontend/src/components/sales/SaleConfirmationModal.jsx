import { CheckCircle2, ReceiptText, WalletCards, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { money } from '../../utils/formatters'

const paymentLabels = {
  pix: 'Pix',
  cartao: 'Cartao',
  dinheiro: 'Dinheiro',
  pagamento_pendente: 'Pagamento pendente'
}

export function SaleConfirmationModal({
  cart,
  total,
  itemCount,
  payment,
  customerName,
  notes,
  loading,
  error,
  onClose,
  onConfirm
}) {
  const modalRef = useRef(null)
  const confirmButtonRef = useRef(null)
  const previousFocusRef = useRef(null)

  const loadingRef = useRef(loading)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    loadingRef.current = loading
    onCloseRef.current = onClose
  }, [loading, onClose])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow

    previousFocusRef.current = document.activeElement
    document.body.style.overflow = 'hidden'

    confirmButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        if (!loadingRef.current) {
          onCloseRef.current()
        }

        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const modal = modalRef.current

      if (!modal) {
        return
      }

      const focusableElements = Array.from(
        modal.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )

      if (!focusableElements.length) {
        event.preventDefault()
        modal.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey) {
        if (activeElement === firstElement || !modal.contains(activeElement)) {
          event.preventDefault()
          lastElement.focus()
        }
      } else if (activeElement === lastElement || !modal.contains(activeElement)) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)

      const previousFocus = previousFocusRef.current

      if (
        previousFocus &&
        document.contains(previousFocus) &&
        typeof previousFocus.focus === 'function' &&
        !previousFocus.disabled
      ) {
        previousFocus.focus()
      }
    }
  }, [])

  function handleOverlayMouseDown(event) {
    if (event.target === event.currentTarget && !loading) {
      onClose()
    }
  }

  return createPortal(
    <div
      className="dashboard-modal-overlay"
      role="presentation"
      onMouseDown={handleOverlayMouseDown}
    >
      <section
        ref={modalRef}
        className="dashboard-modal-panel mission-panel text-ink shadow-blue dark:text-slate-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-confirmation-title"
        aria-describedby="sale-confirmation-description"
        tabIndex={-1}
      >
        <div className="flex min-w-0 items-start justify-between gap-3 border-b border-line/80 p-4 dark:border-shalom-gold/10 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-shalom-blue/10 text-shalom-blue dark:bg-shalom-gold/10 dark:text-shalom-gold">
              <ReceiptText size={21} />
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-shalom-orange dark:text-shalom-gold">
                Revisao da venda
              </p>

              <h2
                id="sale-confirmation-title"
                className="mt-1 font-display text-xl font-semibold sm:text-2xl"
              >
                Confirmar venda
              </h2>

              <p
                id="sale-confirmation-description"
                className="mission-muted mt-1 text-sm"
              >
                Confira os itens e a forma de pagamento antes de registrar.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="mission-btn shrink-0 border border-line/80 bg-white/70 p-2 disabled:cursor-not-allowed disabled:opacity-45 dark:border-shalom-gold/10 dark:bg-white/10"
            onClick={onClose}
            disabled={loading}
            aria-label="Fechar confirmacao da venda"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="dashboard-modal-body scrollbar-thin space-y-4 p-4 sm:p-5">
          <div className="mission-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3 dark:border-shalom-gold/10">
              <div>
                <h3 className="font-display font-semibold">
                  Resumo do pedido
                </h3>

                <p className="mission-muted text-xs">
                  {itemCount} {itemCount === 1 ? 'item' : 'itens'} no total
                </p>
              </div>

              <ShoppingSummaryBadge itemCount={itemCount} />
            </div>

            <div className="max-h-64 divide-y divide-line/70 overflow-y-auto px-4 scrollbar-thin dark:divide-shalom-gold/10">
              {cart.map((item) => (
                <div
                  key={item.key}
                  className="flex min-w-0 items-start justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">
                      {item.name}
                    </p>

                    <p className="mission-muted mt-1 text-xs">
                      {item.quantity} x {money.format(item.sale_price)}
                      {item.type === 'combo' ? ' - Combo' : ''}
                    </p>
                  </div>

                  <strong className="shrink-0 text-sm">
                    {money.format(item.sale_price * item.quantity)}
                  </strong>
                </div>
              ))}
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="mission-card min-w-0 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <WalletCards
                  size={17}
                  className="text-shalom-blue dark:text-shalom-gold"
                />
                Pagamento
              </div>

              <p className="mt-2 break-words font-display text-lg font-semibold text-shalom-blue dark:text-shalom-gold">
                {paymentLabels[payment] || payment}
              </p>

              {payment === 'pagamento_pendente' ? (
                <div className="mt-3 border-t border-line/70 pt-3 dark:border-shalom-gold/10">
                  <p className="mission-muted text-xs">
                    Pessoa/cliente
                  </p>

                  <p className="mt-1 break-words font-medium">
                    {customerName.trim()}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mission-card min-w-0 p-4">
              <p className="mission-muted text-xs font-semibold uppercase tracking-[0.12em]">
                Total da venda
              </p>

              <p className="mt-2 break-words font-display text-3xl font-semibold text-shalom-blue dark:text-shalom-gold">
                {money.format(total)}
              </p>

              <p className="mission-muted mt-2 text-xs">
                O estoque sera atualizado ao confirmar.
              </p>
            </div>
          </div>

          {notes.trim() ? (
            <div className="rounded-2xl border border-line/80 bg-white/55 p-4 dark:border-shalom-gold/10 dark:bg-white/5">
              <p className="mission-muted text-xs font-semibold uppercase tracking-[0.12em]">
                Observacoes
              </p>

              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                {notes.trim()}
              </p>
            </div>
          ) : null}

          {error ? (
            <div
              className="rounded-2xl border border-shalom-wine/25 bg-shalom-wine/10 px-4 py-3 text-sm text-shalom-wine dark:border-rose-200/20 dark:text-rose-100"
              role="alert"
            >
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-line/80 p-4 dark:border-shalom-gold/10 sm:flex-row sm:justify-end sm:p-5">
          <button
            type="button"
            className="mission-btn min-h-12 border border-line/80 bg-white/70 px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-45 dark:border-shalom-gold/10 dark:bg-white/10"
            onClick={onClose}
            disabled={loading}
          >
            Voltar
          </button>

          <button
            ref={confirmButtonRef}
            type="button"
            className="mission-btn mission-btn-primary flex min-h-12 items-center justify-center gap-2 px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onConfirm}
            disabled={loading}
          >
            <CheckCircle2 size={18} />

            {loading
              ? 'Registrando venda...'
              : 'Confirmar venda'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}

function ShoppingSummaryBadge({ itemCount }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-shalom-blue/10 px-3 py-1 text-xs font-semibold text-shalom-blue dark:bg-shalom-gold/10 dark:text-shalom-gold">
      {itemCount} {itemCount === 1 ? 'item' : 'itens'}
    </span>
  )
}
