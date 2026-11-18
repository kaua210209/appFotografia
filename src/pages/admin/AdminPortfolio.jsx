import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSite } from '../../context/SiteContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { PUBLIC_BUCKET, newPath, publicUrl, removeFiles, runPool, uploadFile } from '../../lib/storage.js'
import Uploader from '../../components/Uploader.jsx'
import Lightbox from '../../components/Lightbox.jsx'

function Carousel() {
  const { carousel, refresh } = useSite()
  const toast = useToast()

  async function upload(files, onProgress) {
    let next = carousel.reduce((m, c) => Math.max(m, c.sort_order), 0)
    const orders = files.map(() => ++next)
    const errors = await runPool(
      files,
      async (file, idx) => {
        const path = newPath('carousel', file)
        await uploadFile(PUBLIC_BUCKET, path, file)
        const { error } = await supabase.from('carousel_images').insert({ path, sort_order: orders[idx] })
        if (error) {
          await removeFiles(PUBLIC_BUCKET, [path]).catch(() => {})
          throw error
        }
      },
      3,
      onProgress,
    )
    await refresh()
    return errors
  }

  async function move(idx, delta) {
    const a = carousel[idx]
    const b = carousel[idx + delta]
    if (!a || !b) return
    const r1 = await supabase.from('carousel_images').update({ sort_order: b.sort_order }).eq('id', a.id)
    const r2 = await supabase.from('carousel_images').update({ sort_order: a.sort_order }).eq('id', b.id)
    if (r1.error || r2.error) toast('Não foi possível reordenar.', 'error')
    refresh()
  }

  async function remove(img) {
    if (!window.confirm('Remover esta foto do carrossel?')) return
    const { error } = await supabase.from('carousel_images').delete().eq('id', img.id)
    if (error) return toast(error.message, 'error')
    await removeFiles(PUBLIC_BUCKET, [img.path]).catch(() => {})
    refresh()
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl">Carrossel da página inicial</h2>
          <p className="mt-1 text-sm text-neutral-600">Fotos horizontais, de preferência com 1920 px de largura ou mais.</p>
        </div>
        <Uploader label="Adicionar fotos" onUpload={upload} />
      </div>
      {carousel.length === 0 && <p className="mt-6 text-sm text-neutral-500">Nenhuma foto no carrossel ainda.</p>}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {carousel.map((img, idx) => (
          <div key={img.id} className="overflow-hidden rounded-xl border border-ink/10">
            <img src={publicUrl(img.path)} alt="" loading="lazy" className="aspect-video w-full object-cover" />
            <div className="flex items-center justify-between gap-1 p-2">
              <span className="text-xs text-neutral-500">#{idx + 1}</span>
              <div className="flex gap-1">
                <button className="btn btn-outline btn-sm !px-2.5" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label="Mover para antes">
                  ←
                </button>
                <button className="btn btn-outline btn-sm !px-2.5" disabled={idx === carousel.length - 1} onClick={() => move(idx, 1)} aria-label="Mover para depois">
                  →
                </button>
                <button className="btn btn-danger btn-sm !px-2.5" onClick={() => remove(img)}>
                  Excluir
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function PublicGallery() {
  const toast = useToast()
  const [photos, setPhotos] = useState(null)
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('public_photos').select('*').order('created_at', { ascending: false })
    setPhotos(data || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function upload(files, onProgress) {
    const errors = await runPool(
      files,
      async (file) => {
        const path = newPath('portfolio', file)
        await uploadFile(PUBLIC_BUCKET, path, file)
        const { error } = await supabase.from('public_photos').insert({ path })
        if (error) {
          await removeFiles(PUBLIC_BUCKET, [path]).catch(() => {})
          throw error
        }
      },
      3,
      onProgress,
    )
    await load()
    return errors
  }

  async function remove(photo) {
    if (!window.confirm('Remover esta foto do portfólio público?')) return
    const { error } = await supabase.from('public_photos').delete().eq('id', photo.id)
    if (error) return toast(error.message, 'error')
    await removeFiles(PUBLIC_BUCKET, [photo.path]).catch(() => {})
    load()
  }

  const items = (photos || []).map((p) => ({ url: publicUrl(p.path) }))

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl">Galeria pública (portfólio)</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Tudo que está aqui aparece para qualquer visitante do site. Para fotos de clientes, use a galeria privada dentro do perfil de cada um.
          </p>
        </div>
        <Uploader label="Adicionar fotos" onUpload={upload} />
      </div>
      {photos?.length === 0 && <p className="mt-6 text-sm text-neutral-500">Nenhuma foto publicada ainda.</p>}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {(photos || []).map((p, idx) => (
          <div key={p.id} className="group relative overflow-hidden rounded-lg bg-sand">
            <button className="block w-full cursor-zoom-in" onClick={() => setOpen(idx)}>
              <img src={items[idx].url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
            </button>
            <button
              className="btn btn-danger btn-sm absolute bottom-2 right-2 sm:opacity-0 sm:group-hover:opacity-100"
              onClick={() => remove(p)}
            >
              Excluir
            </button>
          </div>
        ))}
      </div>
      {open !== null && <Lightbox items={items} index={open} onChange={setOpen} onClose={() => setOpen(null)} />}
    </section>
  )
}

export default function AdminPortfolio() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Portfólio</h1>
      <Carousel />
      <PublicGallery />
    </div>
  )
}
