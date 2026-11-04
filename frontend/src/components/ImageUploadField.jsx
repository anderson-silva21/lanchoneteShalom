import { ImagePlus, LoaderCircle, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024

const allowedTypes = new Map([
  ['image/jpeg', new Set(['jpg', 'jpeg'])],
  ['image/png', new Set(['png'])],
  ['image/webp', new Set(['webp'])]
])

function extensionOf(filename) {
  return String(filename || '').split('.').pop()?.toLowerCase() || ''
}

function detectedImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return 'image/png'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return ''
}

async function validateProductImageFile(file) {
  if (!file) return ''
  const extensions = allowedTypes.get(file.type)
  if (!extensions || !extensions.has(extensionOf(file.name))) {
    return 'Selecione uma imagem JPG, PNG ou WebP.'
  }
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) return 'A imagem deve ter no maximo 2 MB.'
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (detectedImageType(header) !== file.type) return 'O conteudo do arquivo nao corresponde ao formato da imagem.'
  return ''
}

export function ImageUploadField({
  currentImageUrl = '',
  selectedFile = null,
  onSelect,
  onRemove,
  disabled = false,
  uploading = false,
  compact = false
}) {
  const inputRef = useRef(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('')
      return undefined
    }
    const objectUrl = URL.createObjectURL(selectedFile)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [selectedFile])

  async function selectFile(file) {
    if (!file || disabled || uploading) return
    setChecking(true)
    setError('')
    try {
      const validationError = await validateProductImageFile(file)
      if (validationError) {
        setError(validationError)
        if (inputRef.current) inputRef.current.value = ''
        return
      }
      onSelect(file)
    } finally {
      setChecking(false)
    }
  }

  function removeImage() {
    setError('')
    if (inputRef.current) inputRef.current.value = ''
    onRemove()
  }

  const imageUrl = previewUrl || currentImageUrl
  const busy = checking || uploading

  if (compact) {
    return (
      <div className="min-w-52">
        <div className="flex items-center gap-2">
          {imageUrl ? <img className="h-12 w-12 shrink-0 rounded-lg object-cover" src={imageUrl} alt="Preview da imagem do produto" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-shalom-cream/70 dark:bg-white/10"><ImagePlus size={20} /></span>}
          <div className="min-w-0">
            <label className="mission-btn inline-flex cursor-pointer items-center gap-1 border border-shalom-gold/45 px-2 py-1.5 text-xs font-semibold">
              {busy ? <LoaderCircle className="animate-spin" size={14} /> : <Upload size={14} />}
              {imageUrl ? 'Trocar' : 'Selecionar'}
              <input ref={inputRef} className="sr-only" type="file" name="image" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={(event) => selectFile(event.target.files?.[0])} />
            </label>
            {imageUrl ? <button type="button" className="ml-1 p-1.5 text-shalom-wine dark:text-rose-200" aria-label="Remover imagem" disabled={disabled || busy} onClick={removeImage}><Trash2 size={15} /></button> : null}
          </div>
        </div>
        {error ? <p className="form-field-error max-w-52 text-xs" role="alert">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="sm:col-span-2">
      <span className="text-sm font-medium">Imagem do produto</span>
      <div
        className={`mt-1 rounded-2xl border-2 border-dashed p-3 transition-colors ${dragging ? 'border-shalom-orange bg-shalom-cream/70' : 'border-shalom-gold/45 bg-white/70 dark:bg-white/5'} ${disabled ? 'opacity-60' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          selectFile(event.dataTransfer.files?.[0])
        }}
      >
        {imageUrl ? (
          <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
            <img className="aspect-square w-full rounded-xl object-cover" src={imageUrl} alt="Preview da imagem do produto" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{selectedFile?.name || 'Imagem atual do produto'}</p>
              <p className="mission-muted mt-1 text-xs">JPG, PNG ou WebP. O servidor converte para WebP.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <label className="mission-btn inline-flex cursor-pointer items-center gap-2 border border-shalom-gold/45 px-3 py-2 text-sm font-semibold">
                  <RefreshCw size={16} />
                  Trocar imagem
                  <input ref={inputRef} className="sr-only" type="file" name="image" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={(event) => selectFile(event.target.files?.[0])} />
                </label>
                <button type="button" className="mission-btn inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-shalom-wine dark:text-rose-200" disabled={disabled || busy} onClick={removeImage}>
                  <Trash2 size={16} />
                  Remover imagem
                </button>
              </div>
            </div>
          </div>
        ) : (
          <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl px-4 py-6 text-center">
            {busy ? <LoaderCircle className="animate-spin text-shalom-orange" size={28} /> : <ImagePlus className="text-shalom-orange" size={30} />}
            <span className="mt-2 text-sm font-semibold">{uploading ? 'Enviando imagem...' : checking ? 'Validando imagem...' : 'Arraste uma imagem ou selecione um arquivo'}</span>
            <span className="mission-muted mt-1 text-xs">JPG, PNG ou WebP, ate 2 MB</span>
            <span className="mission-btn mt-3 inline-flex items-center gap-2 border border-shalom-gold/45 px-3 py-2 text-sm font-semibold">
              <Upload size={16} />
              Selecionar imagem
            </span>
            <input ref={inputRef} className="sr-only" type="file" name="image" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={(event) => selectFile(event.target.files?.[0])} />
          </label>
        )}
      </div>
      {error ? <p className="form-field-error" role="alert">{error}</p> : null}
    </div>
  )
}
