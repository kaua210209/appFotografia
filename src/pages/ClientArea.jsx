import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createCheckout } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { BOOKING_STATUS, ORDER_STATUS, formatBRL, formatDate } from '../lib/constants.js'
import { quote, saleConfigured } from '../lib/pricing.js'
import { PREVIEW_BUCKET, PRIVATE_BUCKET, signedUrlsFor } from '../lib/storage.js'
import BookingForm from '../components/BookingForm.jsx'
import ChangePassword from '../components/ChangePassword.jsx'
import Lightbox from '../components/Lightbox.jsx'
import Spinner from '../components/Spinner.jsx'

function PricingInfo({ event, unlockedCount }) {
  if (!saleConfigured(event)) {
    return (
      <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
        Os valores das fotos deste evento serão informados pelo estúdio.
      </p>
    )
  }

  if (event.sale_mode === 'album') {
    const q = quote(event, 0, unlockedCount)
    return (
      <div className="mt-4 rounded-xl bg-paper p-4 text-sm text-neutral-700">
        <p>
          Seu álbum inclui <strong>{q.included} fotos</strong> por <strong>{formatBRL(q.album || event.album_price)}</strong>. Cada foto a mais custa{' '}
          <strong>{formatBRL(q.extraPrice)}</strong>.
        </p>
        {event.album_paid && (
          <p className="mt-2 text-emerald-700">
            Álbum pago ✓{' '}
            {q.remaining > 0
              ? `Você ainda pode escolher ${q.remaining} foto(s) sem custo adicional.`
              : 'Você já escolheu todas as fotos do álbum; novas fotos são cobradas à parte.'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl bg-paper p-4 text-sm text-neutral-700">
      Cada foto custa <strong>{formatBRL(event.unit_price)}</strong>. Escolha as fotos que quer levar, pague e baixe os arquivos
      originais, sem marca d'água.
    </div>
  )
}

function Gallery({ event, version, onRefresh }) {
  const toast = useToast()
  const [photos, setPhotos] = useState(null)
  const [open, setOpen] = useState(null)
  const [zip, setZip] = useState(null)
  const [picked, setPicked] = useState(() => new Set())
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase.from('private_photos').select('*').eq('event_id', event.id).order('created_at')
      const rows = data || []
      const unlocked = rows.filter((r) => r.unlocked_at)
      const locked = rows.filter((r) => !r.unlocked_at && r.preview_path)
      const [orig, prev] = await Promise.all([
        signedUrlsFor(unlocked.map((r) => r.path)),
        signedUrlsFor(
          locked.map((r) => r.preview_path),
          3600,
          PREVIEW_BUCKET,
        ),
      ])
      if (!active) return
      const list = [...unlocked, ...locked]
        .map((r) => ({ ...r, locked: !r.unlocked_at, name: r.filename, url: r.unlocked_at ? orig[r.path] : prev[r.preview_path] }))
        .filter((r) => r.url)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      setPhotos(list)
      // fotos que acabaram de ser liberadas saem da seleção
      setPicked((s) => new Set([...s].filter((id) => list.some((p) => p.id === id && p.locked))))
    })()
    return () => {
      active = false
    }
  }, [event.id, version])

  // Se o cliente voltar do Mercado Pago pelo botão "voltar" do navegador, destrava o botão.
  useEffect(() => {
    const reset = () => setPaying(false)
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  async function downloadOne(photo) {
    const { data, error } = await supabase.storage
      .from(PRIVATE_BUCKET)
      .createSignedUrl(photo.path, 120, { download: photo.filename || true })
    if (error) return toast('Esta foto ainda não foi liberada.', 'error')
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = photo.filename || ''
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function downloadAll(list) {
    try {
      const { default: JSZip } = await import('jszip')
      const z = new JSZip()
      setZip({ done: 0, total: list.length })
      for (let i = 0; i < list.length; i++) {
        const res = await fetch(list[i].url)
        if (!res.ok) throw new Error('download')
        const name = `${String(i + 1).padStart(3, '0')}-${list[i].filename || 'foto.jpg'}`
        z.file(name, await res.blob())
        setZip({ done: i + 1, total: list.length })
      }
      const blob = await z.generateAsync({ type: 'blob', compression: 'STORE' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${event.title.replace(/[^\w-]+/g, '_')}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    } catch {
      toast('Não foi possível gerar o arquivo .zip. Tente baixar as fotos uma a uma.', 'error')
    } finally {
      setZip(null)
    }
  }

  if (photos === null) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }
  if (photos.length === 0) return <p className="py-6 text-sm text-neutral-500">Nenhuma foto disponível neste evento ainda.</p>

  const unlockedPhotos = photos.filter((p) => !p.locked)
  const lockedPhotos = photos.filter((p) => p.locked)
  const ready = saleConfigured(event)
  const q = picked.size ? quote(event, picked.size, unlockedPhotos.length) : null

  const toggle = (id) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  async function pay() {
    setPaying(true)
    try {
      const res = await createCheckout({ event_id: event.id, photo_ids: [...picked] })
      if (res.free) {
        toast('Fotos liberadas!')
        setPicked(new Set())
        setPaying(false)
        onRefresh()
      } else {
        window.location.assign(res.checkout_url)
      }
    } catch (err) {
      toast(err.message || 'Não foi possível iniciar o pagamento.', 'error')
      setPaying(false)
    }
  }

  return (
    <div className="mt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          {unlockedPhotos.length} liberada(s) · {lockedPhotos.length} com marca d'água
        </p>
        <div className="flex flex-wrap gap-2">
          {ready && lockedPhotos.length > 0 && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setPicked(picked.size === lockedPhotos.length ? new Set() : new Set(lockedPhotos.map((p) => p.id)))}
            >
              {picked.size === lockedPhotos.length ? 'Limpar seleção' : 'Selecionar todas'}
            </button>
          )}
          {unlockedPhotos.length > 0 && (
            <button className="btn btn-dark btn-sm" onClick={() => downloadAll(unlockedPhotos)} disabled={Boolean(zip)}>
              {zip ? `Preparando ${zip.done}/${zip.total}…` : 'Baixar liberadas (.zip)'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p, idx) => {
          const isPicked = picked.has(p.id)
          return (
            <div key={p.id} className={`group relative overflow-hidden rounded-lg bg-sand ${isPicked ? 'ring-4 ring-gold' : ''}`}>
              <button onClick={() => setOpen(idx)} className="block w-full cursor-zoom-in">
                <img src={p.url} alt={p.filename || 'Foto'} loading="lazy" className="aspect-square w-full object-cover" />
              </button>
              {p.locked ? (
                ready && (
                  <label className="absolute left-2 top-2 flex cursor-pointer items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-medium shadow">
                    <input type="checkbox" className="h-4 w-4 accent-gold" checked={isPicked} onChange={() => toggle(p.id)} />
                    {isPicked ? 'Selecionada' : 'Selecionar'}
                  </label>
                )
              ) : (
                <>
                  <span className="absolute left-2 top-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Liberada</span>
                  <button
                    onClick={() => downloadOne(p)}
                    className="btn btn-sm absolute bottom-2 right-2 bg-white/90 text-ink opacity-100 hover:bg-white sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    Baixar
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>

      {ready && lockedPhotos.length > 0 && (
        <div className="sticky bottom-3 z-30 mt-5 rounded-2xl bg-ink p-4 text-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {!q ? (
                <p className="text-white/80">Marque as fotos que você quer levar (botão “Selecionar” em cada foto).</p>
              ) : q.mode === 'unit' ? (
                <>
                  <p>
                    {picked.size} foto(s) × {formatBRL(q.unitPrice)}
                  </p>
                  <p className="text-lg font-semibold">{formatBRL(q.total)}</p>
                </>
              ) : (
                <>
                  {q.chargesAlbum && (
                    <p>
                      Álbum (até {q.included} fotos): {formatBRL(q.album)}
                    </p>
                  )}
                  <p>
                    {picked.size} escolhida(s) · {q.covered} dentro do álbum
                  </p>
                  {q.extras > 0 && (
                    <p>
                      {q.extras} foto(s) extra × {formatBRL(q.extraPrice)}
                    </p>
                  )}
                  <p className="text-lg font-semibold">{q.total > 0 ? formatBRL(q.total) : 'Sem custo adicional'}</p>
                </>
              )}
            </div>
            <div className="text-right">
              <button className="btn btn-primary" disabled={!q || paying} onClick={pay}>
                {paying ? 'Aguarde…' : q && q.total > 0 ? `Pagar ${formatBRL(q.total)}` : 'Liberar fotos'}
              </button>
              {q && q.total > 0 && <p className="mt-1 text-xs text-white/60">Pix, cartão de crédito ou boleto · Mercado Pago</p>}
            </div>
          </div>
        </div>
      )}

      {open !== null && <Lightbox items={photos} index={open} onChange={setOpen} onClose={() => setOpen(null)} onDownload={downloadOne} />}
    </div>
  )
}

const BANNERS = {
  sucesso: {
    cls: 'bg-emerald-50 text-emerald-800',
    text: 'Pagamento recebido! Estamos confirmando e liberando suas fotos. Pode levar alguns instantes.',
  },
  pendente: {
    cls: 'bg-amber-50 text-amber-800',
    text: 'Pagamento pendente. Assim que o Mercado Pago confirmar (Pix na hora; boleto em até 3 dias úteis), suas fotos serão liberadas automaticamente.',
  },
  falha: {
    cls: 'bg-red-50 text-red-800',
    text: 'O pagamento não foi concluído. Você pode tentar novamente: suas fotos continuam disponíveis para seleção.',
  },
}

export default function ClientArea() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const [events, setEvents] = useState(null)
  const [bookings, setBookings] = useState([])
  const [orders, setOrders] = useState([])
  const [openId, setOpenId] = useState(null)
  const [showBooking, setShowBooking] = useState(false)
  const [version, setVersion] = useState(0)
  const paymentResult = params.get('pagamento')

  const loadEvents = useCallback(async () => {
    const { data } = await supabase.from('events').select('*').order('event_date', { ascending: false, nullsFirst: false })
    setEvents(data || [])
    return data || []
  }, [])

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, events(title)')
      .order('created_at', { ascending: false })
      .limit(20)
    setOrders(data || [])
  }, [])

  const loadBookings = useCallback(async () => {
    const { data } = await supabase.from('bookings').select('*').order('created_at', { ascending: false })
    setBookings(data || [])
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([loadEvents(), loadOrders()])
    setVersion((v) => v + 1)
  }, [loadEvents, loadOrders])

  useEffect(() => {
    ;(async () => {
      const data = await loadEvents()
      if (data.length) setOpenId(data.find((e) => e.gallery_released)?.id ?? data[0].id)
      loadOrders()
      loadBookings()
    })()
  }, [loadEvents, loadOrders, loadBookings])

  // Ao voltar do Mercado Pago, a confirmação pode levar alguns segundos: atualiza algumas vezes.
  useEffect(() => {
    if (!paymentResult) return
    refresh()
    if (paymentResult !== 'sucesso') return
    let n = 0
    const t = setInterval(() => {
      refresh()
      if (++n >= 8) clearInterval(t)
    }, 4000)
    return () => clearInterval(t)
  }, [paymentResult, refresh])

  const banner = BANNERS[paymentResult]

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl sm:text-4xl">Olá, {profile?.full_name?.split(' ')[0] || 'cliente'}!</h1>
      <p className="mt-2 text-neutral-600">Aqui estão seus eventos e as fotografias exclusivas para você.</p>

      {banner && (
        <div className={`mt-6 flex items-start justify-between gap-3 rounded-xl p-4 text-sm ${banner.cls}`}>
          <p>{banner.text}</p>
          <button className="cursor-pointer text-lg leading-none" aria-label="Fechar aviso" onClick={() => setParams({})}>
            ×
          </button>
        </div>
      )}

      <section className="mt-10">
        <h2 className="font-display text-2xl">Meus eventos</h2>
        {events === null && (
          <div className="mt-6 flex justify-center">
            <Spinner />
          </div>
        )}
        {events?.length === 0 && (
          <div className="card mt-4 text-neutral-600">Você ainda não tem eventos cadastrados. Assim que o estúdio cadastrar o seu, ele aparece aqui.</div>
        )}
        <div className="mt-4 space-y-4">
          {(events || []).map((ev) => (
            <article key={ev.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl">{ev.title}</h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    {formatDate(ev.event_date)}
                    {ev.service && ` · ${ev.service}`}
                    {ev.location && ` · ${ev.location}`}
                  </p>
                  {ev.notes && <p className="mt-2 text-sm text-neutral-700">{ev.notes}</p>}
                </div>
                {ev.gallery_released ? (
                  <button className="btn btn-primary btn-sm" onClick={() => setOpenId(openId === ev.id ? null : ev.id)}>
                    {openId === ev.id ? 'Ocultar fotos' : 'Ver fotos'}
                  </button>
                ) : (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                    Fotos em preparação
                  </span>
                )}
              </div>
              {ev.gallery_released && openId === ev.id && (
                <>
                  <GalleryWithInfo event={ev} version={version} onRefresh={refresh} />
                </>
              )}
            </article>
          ))}
        </div>
      </section>

      {orders.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-2xl">Meus pedidos</h2>
          <ul className="mt-4 space-y-2">
            {orders.map((o) => {
              const st = ORDER_STATUS[o.status] || ORDER_STATUS.pendente
              return (
                <li key={o.id} className="card flex flex-wrap items-center justify-between gap-2 py-4 text-sm">
                  <span>
                    <strong>{o.events?.title || 'Evento'}</strong>
                    <span className="text-neutral-500"> · {formatDate(o.created_at)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-3">
                    <strong>{formatBRL(o.amount)}</strong>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                    {o.status === 'pendente' && o.checkout_url && (
                      <a className="btn btn-primary btn-sm" href={o.checkout_url}>
                        Pagar agora
                      </a>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="mt-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">Agendamentos</h2>
          <button className="btn btn-outline btn-sm" onClick={() => setShowBooking((v) => !v)}>
            {showBooking ? 'Fechar' : 'Solicitar novo agendamento'}
          </button>
        </div>
        {showBooking && (
          <div className="mt-4">
            <BookingForm onDone={loadBookings} />
          </div>
        )}
        {bookings.length > 0 && (
          <ul className="mt-4 space-y-2">
            {bookings.map((b) => {
              const st = BOOKING_STATUS[b.status] || BOOKING_STATUS.pendente
              return (
                <li key={b.id} className="card flex flex-wrap items-center justify-between gap-2 py-4">
                  <span className="text-sm">
                    <strong>{b.event_type || 'Evento'}</strong> · {formatDate(b.event_date)}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="mt-14">
        <h2 className="mb-4 font-display text-2xl">Minha conta</h2>
        <div className="card">
          <p className="mb-4 text-sm text-neutral-600">Logado como {profile?.email}</p>
          <ChangePassword />
        </div>
      </section>
    </div>
  )
}

// Informações de preço + galeria. O número de fotos já liberadas vem da própria galeria,
// então o resumo de preço é montado dentro dela; aqui mostramos só o texto de regras.
function GalleryWithInfo({ event, version, onRefresh }) {
  const [unlocked, setUnlocked] = useState(0)

  useEffect(() => {
    supabase
      .from('private_photos')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .not('unlocked_at', 'is', null)
      .then(({ count }) => setUnlocked(count ?? 0))
  }, [event.id, version])

  return (
    <>
      <PricingInfo event={event} unlockedCount={unlocked} />
      <Gallery event={event} version={version} onRefresh={onRefresh} />
    </>
  )
}
