import { useRef, useState } from 'react'
import { useToast } from '../context/ToastContext.jsx'
import { ALLOWED_TYPES, MAX_FILE_MB } from '../lib/constants.js'

// onUpload(files, onProgress) deve retornar a lista de erros (vazia se tudo certo).
export default function Uploader({ label = 'Enviar fotos', multiple = true, onUpload, className = '', disabled = false }) {
  const inputRef = useRef(null)
  const toast = useToast()
  const [progress, setProgress] = useState(null)

  async function handle(e) {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    if (!picked.length) return

    const files = picked.filter((f) => ALLOWED_TYPES.includes(f.type) && f.size <= MAX_FILE_MB * 1024 * 1024)
    const skipped = picked.length - files.length
    if (skipped) toast(`${skipped} arquivo(s) ignorado(s): use JPG, PNG ou WEBP de até ${MAX_FILE_MB} MB.`, 'error')
    if (!files.length) return

    setProgress({ done: 0, total: files.length })
    try {
      const errors = await onUpload(files, (done, total) => setProgress({ done, total }))
      if (errors?.length) toast(`${errors.length} arquivo(s) não puderam ser enviados.`, 'error')
      else toast(files.length > 1 ? `${files.length} fotos enviadas.` : 'Foto enviada.')
    } catch (err) {
      toast(err.message || 'Falha no envio.', 'error')
    } finally {
      setProgress(null)
    }
  }

  const busy = progress !== null

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        multiple={multiple}
        onChange={handle}
        className="hidden"
      />
      <button type="button" className="btn btn-dark" disabled={busy || disabled} onClick={() => inputRef.current?.click()}>
        {busy ? `Enviando ${progress.done}/${progress.total}…` : label}
      </button>
      {busy && (
        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-sand">
          <div
            className="h-full bg-gold transition-all"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}
