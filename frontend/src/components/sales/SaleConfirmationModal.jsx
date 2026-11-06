import {
  CheckCircle2,
  QrCode,
  ReceiptText,
  WalletCards,
  X
} from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../services/api'
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
  const qrModalRef = useRef(null)
  const qrButtonRef = useRef(null)
  const qrOpenRef = useRef(false)
  const confirmButtonRef = useRef(null)
  const previousFocusRef = useRef(null)
  const [showQrCode, setShowQrCode] = useState(false)

  const loadingRef = useRef(loading)
  const onCloseRef = useRef(onClose)
  const isPixPayment = payment === 'pix'
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState('')

  useEffect(() => {
    loadingRef.current = loading
    onCloseRef.current = onClose
    qrOpenRef.current = showQrCode && isPixPayment
  }, [loading, onClose, showQrCode, isPixPayment])

  useEffect(() => {
    if (!showQrCode || !isPixPayment) return
    const trigger = qrButtonRef.current
    qrModalRef.current?.querySelector('button')?.focus()
    return () => trigger?.focus()
  }, [showQrCode, isPixPayment])

  
  useEffect(() => {
    if (!isPixPayment || !showQrCode) {
      setQrCodeDataUrl('')
      setQrError('')
      return
    }

    const controller = new AbortController()

    async function generatePixQrCode() {
      try {
        setQrLoading(true)
        setQrError('')
        setQrCodeDataUrl('')

        // O total está em reais. Convertemos para centavos.
        const amountCents = Math.round(Number(total) * 100)

        if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
          throw new Error('Valor da venda inválido.')
        }

        const data = await api.generatePix(amountCents, controller.signal)

        const dataUrl = await QRCode.toDataURL(data.payload, {
          width: 320,
          margin: 4,
          color: {
            dark: '#000000',
            light: '#ffffff'
          },
          errorCorrectionLevel: 'M'
        })

        if (controller.signal.aborted) return
        setQrCodeDataUrl(dataUrl)
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Erro ao gerar QR Code:', error)
          setQrError(error.message || 'Não foi possível gerar o QR Code.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setQrLoading(false)
        }
      }
    }

    generatePixQrCode()

    return () => controller.abort()
  }, [isPixPayment, showQrCode, total])


  useEffect(() => {
    const previousOverflow = document.body.style.overflow

    previousFocusRef.current = document.activeElement
    document.body.style.overflow = 'hidden'

    confirmButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        if (qrOpenRef.current) {
          event.preventDefault()
          setShowQrCode(false)
          return
        }
        if (!loadingRef.current) {
          onCloseRef.current()
        }

        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const modal = qrOpenRef.current ? qrModalRef.current : modalRef.current

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
      {showQrCode && isPixPayment ? (
        <div
          ref={qrModalRef}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="QR Code do Pix"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowQrCode(false)
            }
          }}
        >
          <div className="relative w-full max-w-sm rounded-[28px] border border-line/80 bg-white p-5 shadow-2xl dark:border-shalom-gold/10 dark:bg-slate-900">
            <button
              type="button"
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-white text-slate-700 transition hover:bg-slate-100 dark:border-shalom-gold/10 dark:bg-slate-900 dark:text-slate-200"
              onClick={() => setShowQrCode(false)}
              aria-label="Fechar QR Code"
            >
              <X size={16} />
            </button>

            <p className="mt-8 text-center font-semibold text-slate-900 dark:text-white">
              Comunidade Católica Shalom
            </p>
            <div className="mx-auto mt-4 flex h-64 w-64 items-center justify-center rounded-2xl border border-line/80 bg-white p-3 shadow-inner">
              {qrLoading ? (
                <div className="text-center text-sm text-slate-500">
                  Gerando QR Code...
                </div>
              ) : qrError ? (
                <div className="text-center text-sm text-red-500">
                  {qrError}
                </div>
              ) : qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="QR Code para pagamento Pix"
                  className="h-full w-full object-contain"
                />
              ) : null}
            </div>

            <p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
              Pagamento Pix
            </p>
            <p className="mt-2 text-center text-2xl font-bold text-slate-900 dark:text-white">
              {money.format(total)}
            </p>
            <p className="mt-2 break-all text-center text-xs text-slate-500 dark:text-slate-300">
              financeirosaojosecampos@comshalom.org
            </p>
          </div>
        </div>
      ) : null}

      <section
        ref={modalRef}
        inert={showQrCode && isPixPayment}
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

          {isPixPayment ? (
            <button
              ref={qrButtonRef}
              type="button"
              className="mission-btn flex min-h-12 items-center justify-center gap-2 border border-line/80 bg-white/70 px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-45 dark:border-shalom-gold/10 dark:bg-white/10"
              onClick={() => setShowQrCode((current) => !current)}
              aria-expanded={showQrCode}
              aria-label="Abrir QR Code do Pix"
              title="QR Code do Pix"
              disabled={loading}
            >
              <QrCode size={18} />
              QR Code
            </button>
          ) : null}

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
