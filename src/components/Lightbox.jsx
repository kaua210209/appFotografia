import { useEffect, useRef } from 'react'

export default function Lightbox({ items, index, onClose, onChange, onDownload }) {
  const touchX = useRef(null)
  const count = items.length
  const item = items[index]

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onChange((index + 1) % count)
      if (e.key === 'ArrowLeft') onChange((index - 1 + count) % count)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [index, count, onClose, onChange])

  if (!item) return null

  const go = (delta) => onChange((index + delta + count) % count)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
        touchX.current = null
      }}
    >
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 text-sm text-white/80">
        <span>
          {index + 1} / {count}
        </span>
        <div className="flex items-center gap-3">
          {onDownload && !item.locked && (
            <button onClick={() => onDownload(item)} className="btn btn-light btn-sm">
              Baixar
            </button>
          )}
          <button onClick={onClose} className="cursor-pointer text-3xl leading-none text-white" aria-label="Fechar">
            ×
          </button>
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 px-3 py-2 text-3xl text-white hover:bg-white/20"
            aria-label="Anterior"
          >
            ‹
          </button>
          <button
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 px-3 py-2 text-3xl text-white hover:bg-white/20"
            aria-label="Próxima"
          >
            ›
          </button>
        </>
      )}

      <img src={item.url} alt={item.name || ''} className="max-h-[86vh] max-w-[94vw] object-contain" />
    </div>
  )
}
