import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { adminUsers } from '../../lib/api.js'
import { useSite } from '../../context/SiteContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { ALLOWED_TYPES, ORDER_STATUS, formatBRL, formatDate, parseMoney } from '../../lib/constants.js'
import { saleConfigured } from '../../lib/pricing.js'
import { makePreview } from '../../lib/watermark.js'
import {
  PREVIEW_BUCKET,
  PRIVATE_BUCKET,
  PUBLIC_BUCKET,
  fileExt,
  removeFiles,
  runPool,
  signedUrlsFor,
  uploadFile,
} from '../../lib/storage.js'
import Field from '../../components/Field.jsx'
import Lightbox from '../../components/Lightbox.jsx'
import Spinner from '../../components/Spinner.jsx'
import Uploader from '../../components/Uploader.jsx'

const moneyText = (v) => (v == null ? '' : String(v).replace('.', ','))

function PhotoTile({ photo, wmText, onOpen, onChanged }) {
  const toast = useToast()
  const replaceRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const unlocked = Boolean(photo.unlocked_at)

  async function replace(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) return toast('Use JPG, PNG ou WEBP.', 'error')
    setBusy(true)
    try {
      const preview = await makePreview(file, wmText)
      const previewPath = photo.preview_path || `${photo.path.replace(/\.[^./]+$/, '')}.jpg`
      await uploadFile(PRIVATE_BUCKET, photo.path, file, { upsert: true })
      await uploadFile(PREVIEW_BUCKET, previewPath, preview, { upsert: true })
      const { error } = await supabase
        .from('private_photos')
        .update({ filename: file.name, preview_path: previewPath })
        .eq('id', photo.id)
      if (error) throw error
      toast('Foto substituída.')
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
    setBusy(false)
  }

  async function toggleLock() {
    setBusy(true)
    const { error } = await supabase
      .from('private_photos')
      .update({ unlocked_at: unlocked ? null : new Date().toISOString() })
      .eq('id', photo.id)
    if (error) {
      setBusy(false)
      return toast(error.message, 'error')
    }
    onChanged()
  }

  async function publish() {
    if (!window.confirm('Publicar esta foto no portfólio PÚBLICO (sem marca d\'água)? Confirme que o cliente autorizou a divulgação da imagem.')) return
    setBusy(true)
    try {
      const { data: blob, error } = await supabase.storage.from(PRIVATE_BUCKET).download(photo.path)
      if (error) throw error
      const path = `portfolio/${crypto.randomUUID()}.${fileExt(photo.path)}`
      await uploadFile(PUBLIC_BUCKET, path, blob)
      const ins = await supabase.from('public_photos').insert({ path })
      if (ins.error) {
        await removeFiles(PUBLIC_BUCKET, [path]).catch(() => {})
        throw ins.error
      }
      toast('Foto publicada no portfólio (uma cópia; a galeria do cliente continua igual).')
    } catch (err) {
      toast(err.message || 'Não foi possível publicar.', 'error')
    }
    setBusy(false)
  }

  async function remove() {
    if (!window.confirm('Excluir esta foto da galeria do cliente?')) return
    setBusy(true)
    const { error } = await supabase.from('private_photos').delete().eq('id', photo.id)
    if (error) {
      setBusy(false)
      return toast(error.message, 'error')
    }
    await removeFiles(PRIVATE_BUCKET, [photo.path]).catch(() => {})
    if (photo.preview_path) await removeFiles(PREVIEW_BUCKET, [photo.preview_path]).catch(() => {})
    onChanged()
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ink/10 bg-sand">
      <button className="relative block w-full cursor-zoom-in" onClick={onOpen}>
        {photo.url ? (
          <img src={photo.url} alt={photo.filename || ''} loading="lazy" className="aspect-square w-full object-cover" />
        ) : (
          <div className="flex aspect-square items-center justify-center text-xs text-neutral-500">Sem prévia</div>
        )}
        <span
          className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            unlocked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {unlocked ? 'Liberada' : 'Com marca d\'água'}
        </span>
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Spinner />
          </span>
        )}
      </button>
      <div className="flex flex-wrap gap-1 bg-white p-1.5">
        <input ref={replaceRef} type="file" accept={ALLOWED_TYPES.join(',')} className="hidden" onChange={replace} />
        <button className="btn btn-outline btn-sm !px-2" disabled={busy} onClick={toggleLock}>
          {unlocked ? 'Bloquear' : 'Liberar'}
        </button>
        <button className="btn btn-outline btn-sm !px-2" disabled={busy} onClick={() => replaceRef.current?.click()}>
          Substituir
        </button>
        <button className="btn btn-outline btn-sm !px-2" disabled={busy} onClick={publish}>
          Publicar
        </button>
        <button className="btn btn-danger btn-sm !px-2" disabled={busy} onClick={remove}>
          Excluir
        </button>
      </div>
    </div>
  )
}

function SalePanel({ event, onChanged }) {
  const toast = useToast()
  const [mode, setMode] = useState(event.sale_mode || 'unit')
  const [unit, setUnit] = useState(moneyText(event.unit_price))
  const [albumPrice, setAlbumPrice] = useState(moneyText(event.album_price))
  const [included, setIncluded] = useState(event.album_photos_included ?? '')
  const [extra, setExtra] = useState(moneyText(event.extra_photo_price))
  const [saving, setSaving] = useState(false)

  async function save() {
    const u = parseMoney(unit)
    const a = parseMoney(albumPrice)
    const x = parseMoney(extra)
    const n = parseInt(included, 10)

    if (mode === 'unit' && !(u > 0)) return toast('Informe o valor de cada foto.', 'error')
    if (mode === 'album') {
      if (!(n >= 1)) return toast('Informe quantas fotos o álbum inclui.', 'error')
      if (!(a > 0)) return toast('Informe o valor do álbum.', 'error')
      if (!(x > 0)) return toast('Informe o valor de cada foto a mais.', 'error')
    }

    setSaving(true)
    const { error } = await supabase
      .from('events')
      .update({
        sale_mode: mode,
        unit_price: u > 0 ? u : null,
        album_price: a > 0 ? a : null,
        album_photos_included: n >= 1 ? n : null,
        extra_photo_price: x > 0 ? x : null,
      })
      .eq('id', event.id)
    setSaving(false)
    if (error) return toast(error.message, 'error')
    toast('Valores salvos.')
    onChanged()
  }

  const modeBtn = (value, label) => (
    <button type="button" onClick={() => setMode(value)} className={`btn btn-sm ${mode === value ? 'btn-dark' : 'btn-outline'}`}>
      {label}
    </button>
  )

  return (
    <div className="mt-6 rounded-xl border border-ink/10 bg-paper p-4">
      <h4 className="font-medium">Venda das fotos</h4>
      <p className="mt-1 text-xs text-neutral-500">
        O cliente vê as fotos com marca d'água e só recebe os arquivos originais depois que o pagamento for aprovado. Defina como ele vai comprar:
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {modeBtn('unit', 'Por unidade')}
        {modeBtn('album', 'Álbum')}
      </div>

      {mode === 'unit' ? (
        <div className="mt-4 grid gap-3 sm:max-w-xs">
          <Field label="Valor de cada foto (R$)" hint="O cliente escolhe as fotos no carrinho e paga só por elas.">
            <input className="input" inputMode="decimal" placeholder="0,00" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Fotos incluídas no álbum">
            <input className="input" inputMode="numeric" placeholder="Ex.: 30" value={included} onChange={(e) => setIncluded(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Valor do álbum (R$)">
            <input className="input" inputMode="decimal" placeholder="0,00" value={albumPrice} onChange={(e) => setAlbumPrice(e.target.value)} />
          </Field>
          <Field label="Valor de cada foto a mais (R$)">
            <input className="input" inputMode="decimal" placeholder="0,00" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
          {saving ? 'Salvando…' : 'Salvar valores'}
        </button>
        {event.album_paid && event.sale_mode === 'album' && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">Álbum já pago pelo cliente</span>
        )}
      </div>
    </div>
  )
}

function EventCard({ event, clientId, onChanged }) {
  const toast = useToast()
  const { settings } = useSite()
  const wmText = settings.watermark_text || settings.company_name || ''
  const [form, setForm] = useState({
    title: event.title,
    service: event.service || '',
    event_date: event.event_date || '',
    location: event.location || '',
    notes: event.notes || '',
  })
  const [photos, setPhotos] = useState(null)
  const [open, setOpen] = useState(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const saleReady = saleConfigured(event)

  const loadPhotos = useCallback(async () => {
    const { data } = await supabase.from('private_photos').select('*').eq('event_id', event.id).order('created_at')
    const rows = data || []
    const [prev, orig] = await Promise.all([
      signedUrlsFor(
        rows.filter((r) => r.preview_path).map((r) => r.preview_path),
        3600,
        PREVIEW_BUCKET,
      ),
      signedUrlsFor(rows.filter((r) => !r.preview_path).map((r) => r.path)),
    ])
    setPhotos(rows.map((r) => ({ ...r, url: r.preview_path ? prev[r.preview_path] : orig[r.path] })))
  }, [event.id])

  useEffect(() => {
    loadPhotos()
  }, [loadPhotos])

  async function save() {
    setSaving(true)
    const { error } = await supabase
      .from('events')
      .update({
        title: form.title.trim(),
        service: form.service.trim() || null,
        event_date: form.event_date || null,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
      })
      .eq('id', event.id)
    setSaving(false)
    if (error) return toast(error.message, 'error')
    toast('Evento salvo.')
    onChanged()
  }

  async function toggleRelease() {
    const next = !event.gallery_released
    if (next && !photos?.length && !window.confirm('Esta galeria ainda não tem fotos. Liberar mesmo assim?')) return
    if (next && !saleReady && !window.confirm('Os valores de venda ainda não foram definidos, então o cliente não conseguirá comprar. Liberar mesmo assim?')) return
    const { error } = await supabase.from('events').update({ gallery_released: next }).eq('id', event.id)
    if (error) return toast(error.message, 'error')
    toast(next ? 'Galeria visível para o cliente.' : 'Galeria ocultada do cliente.')
    onChanged()
  }

  async function removeEvent() {
    if (!window.confirm(`Excluir o evento "${event.title}" e TODAS as fotos dele? Isso não pode ser desfeito.`)) return
    try {
      const { data } = await supabase.from('private_photos').select('path, preview_path').eq('event_id', event.id)
      await removeFiles(PRIVATE_BUCKET, (data || []).map((p) => p.path))
      await removeFiles(
        PREVIEW_BUCKET,
        (data || []).map((p) => p.preview_path).filter(Boolean),
      )
      const { error } = await supabase.from('events').delete().eq('id', event.id)
      if (error) throw error
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function upload(files, onProgress) {
    const errors = await runPool(
      files,
      async (file) => {
        const base = `${clientId}/${event.id}/${crypto.randomUUID()}`
        const path = `${base}.${fileExt(file.name)}`
        const previewPath = `${base}.jpg`
        const preview = await makePreview(file, wmText)
        await uploadFile(PRIVATE_BUCKET, path, file)
        try {
          await uploadFile(PREVIEW_BUCKET, previewPath, preview)
          const { error } = await supabase.from('private_photos').insert({
            event_id: event.id,
            client_id: clientId,
            path,
            preview_path: previewPath,
            filename: file.name,
          })
          if (error) throw error
        } catch (err) {
          await removeFiles(PRIVATE_BUCKET, [path]).catch(() => {})
          await removeFiles(PREVIEW_BUCKET, [previewPath]).catch(() => {})
          throw err
        }
      },
      2, // a geração da marca d'água usa bastante memória; 2 por vez é seguro
      onProgress,
    )
    await loadPhotos()
    return errors
  }

  async function generateMissing() {
    const list = (photos || []).filter((p) => !p.preview_path)
    setGenerating({ done: 0, total: list.length })
    const errors = await runPool(
      list,
      async (p) => {
        const { data: blob, error } = await supabase.storage.from(PRIVATE_BUCKET).download(p.path)
        if (error) throw error
        const preview = await makePreview(blob, wmText)
        const previewPath = `${p.path.replace(/\.[^./]+$/, '')}.jpg`
        await uploadFile(PREVIEW_BUCKET, previewPath, preview, { upsert: true })
        const { error: e2 } = await supabase.from('private_photos').update({ preview_path: previewPath }).eq('id', p.id)
        if (e2) throw e2
      },
      2,
      (done, total) => setGenerating({ done, total }),
    )
    setGenerating(null)
    toast(errors.length ? `${errors.length} foto(s) falharam.` : 'Prévias geradas.', errors.length ? 'error' : 'ok')
    loadPhotos()
  }

  async function setAllLocked(lock) {
    const msg = lock
      ? 'Bloquear TODAS as fotos deste evento? O cliente voltará a ver só as prévias com marca d\'água.'
      : 'Liberar TODAS as fotos deste evento sem marca d\'água? Use quando o pagamento foi combinado fora do site.'
    if (!window.confirm(msg)) return
    const { error } = await supabase
      .from('private_photos')
      .update({ unlocked_at: lock ? null : new Date().toISOString() })
      .eq('event_id', event.id)
    if (error) return toast(error.message, 'error')
    loadPhotos()
  }

  const items = (photos || []).filter((p) => p.url).map((p) => ({ url: p.url, name: p.filename }))
  const unlockedCount = (photos || []).filter((p) => p.unlocked_at).length
  const lockedCount = (photos?.length || 0) - unlockedCount
  const missing = (photos || []).filter((p) => !p.preview_path).length

  return (
    <article className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-xl">{event.title}</h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            event.gallery_released ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {event.gallery_released ? 'Galeria visível ao cliente' : 'Galeria oculta (em preparação)'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Título do evento">
          <input className="input" value={form.title} onChange={set('title')} />
        </Field>
        <Field label="Serviço contratado">
          <input className="input" value={form.service} onChange={set('service')} />
        </Field>
        <Field label="Data">
          <input className="input" type="date" value={form.event_date} onChange={set('event_date')} />
        </Field>
        <Field label="Local">
          <input className="input" value={form.location} onChange={set('location')} />
        </Field>
        <Field label="Observações (o cliente vê)" className="sm:col-span-2">
          <textarea className="input min-h-20" value={form.notes} onChange={set('notes')} />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary btn-sm" disabled={saving || !form.title.trim()} onClick={save}>
          Salvar evento
        </button>
        <button className="btn btn-dark btn-sm" onClick={toggleRelease}>
          {event.gallery_released ? 'Ocultar galeria' : 'Mostrar galeria ao cliente'}
        </button>
        <button className="btn btn-danger btn-sm" onClick={removeEvent}>
          Excluir evento
        </button>
      </div>

      <SalePanel key={`${event.id}-${event.sale_mode}-${event.unit_price}-${event.album_price}-${event.album_photos_included}-${event.extra_photo_price}`} event={event} onChanged={onChanged} />

      <div className="mt-6 border-t border-ink/10 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-medium">
            Galeria privada ({photos?.length ?? '…'} fotos
            {photos?.length ? ` · ${unlockedCount} liberadas · ${lockedCount} com marca d'água` : ''})
          </h4>
          <Uploader label="Enviar fotos para este cliente" onUpload={upload} disabled={!saleReady} />
        </div>
        {!saleReady && (
          <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Defina e salve o tipo de venda e os valores acima para poder enviar fotos.
          </p>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Cada foto enviada ganha automaticamente uma prévia com marca d'água («{wmText || 'AMOSTRA'}»). O cliente só baixa o original depois do pagamento. “Publicar” cria uma cópia no portfólio público, se ele autorizou.
        </p>

        {(photos?.length || 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {lockedCount > 0 && (
              <button className="btn btn-outline btn-sm" onClick={() => setAllLocked(false)}>
                Liberar todas (pagamento manual)
              </button>
            )}
            {unlockedCount > 0 && (
              <button className="btn btn-outline btn-sm" onClick={() => setAllLocked(true)}>
                Bloquear todas
              </button>
            )}
            {missing > 0 && (
              <button className="btn btn-outline btn-sm" disabled={Boolean(generating)} onClick={generateMissing}>
                {generating ? `Gerando ${generating.done}/${generating.total}…` : `Gerar prévias com marca d'água (${missing})`}
              </button>
            )}
          </div>
        )}

        {photos === null && (
          <div className="mt-4 flex justify-center">
            <Spinner />
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(photos || []).map((p) => (
            <PhotoTile
              key={p.id}
              photo={p}
              wmText={wmText}
              onChanged={loadPhotos}
              onOpen={() => setOpen(items.findIndex((i) => i.url === p.url))}
            />
          ))}
        </div>
      </div>
      {open !== null && open >= 0 && (
        <Lightbox items={items} index={open} onChange={setOpen} onClose={() => setOpen(null)} />
      )}
    </article>
  )
}

function OrdersList({ orders }) {
  if (!orders.length) return null
  return (
    <section className="card">
      <h2 className="font-display text-xl">Pagamentos</h2>
      <ul className="mt-4 divide-y divide-ink/10">
        {orders.map((o) => {
          const st = ORDER_STATUS[o.status] || ORDER_STATUS.pendente
          return (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span>
                <strong>{o.events?.title || 'Evento'}</strong>
                <span className="text-neutral-500">
                  {' '}
                  · {formatDate(o.created_at)}
                  {o.includes_album && ' · inclui o álbum'}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <strong>{formatBRL(o.amount)}</strong>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function AdminClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { services } = useSite()
  const [client, setClient] = useState(undefined)
  const [events, setEvents] = useState([])
  const [orders, setOrders] = useState([])
  const [info, setInfo] = useState({ full_name: '', phone: '' })
  const [newPassword, setNewPassword] = useState('')
  const [newEvent, setNewEvent] = useState({ title: '', service: '', event_date: '', location: '' })

  const load = useCallback(async () => {
    const [c, e, o] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
      supabase.from('events').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('orders').select('*, events(title)').eq('client_id', id).order('created_at', { ascending: false }),
    ])
    setClient(c.data)
    if (c.data) setInfo({ full_name: c.data.full_name || '', phone: c.data.phone || '' })
    setEvents(e.data || [])
    setOrders(o.data || [])
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function saveInfo(e) {
    e.preventDefault()
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: info.full_name.trim(), phone: info.phone.trim() || null })
      .eq('id', id)
    if (error) return toast(error.message, 'error')
    toast('Dados do cliente salvos.')
    load()
  }

  async function changePassword(e) {
    e.preventDefault()
    try {
      await adminUsers({ action: 'set_password', id, password: newPassword })
      setNewPassword('')
      toast('Senha alterada. Envie a nova senha ao cliente.')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function deleteClient() {
    if (!window.confirm(`Excluir o cliente "${client.full_name}", o login e TODAS as fotos dele? Isso não pode ser desfeito.`)) return
    try {
      await adminUsers({ action: 'delete', id })
      toast('Cliente excluído.')
      navigate('/admin/clientes')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function createEvent(e) {
    e.preventDefault()
    const { error } = await supabase.from('events').insert({
      client_id: id,
      title: newEvent.title.trim(),
      service: newEvent.service.trim() || null,
      event_date: newEvent.event_date || null,
      location: newEvent.location.trim() || null,
    })
    if (error) return toast(error.message, 'error')
    setNewEvent({ title: '', service: '', event_date: '', location: '' })
    toast('Evento criado. Defina o tipo de venda e envie as fotos.')
    load()
  }

  if (client === undefined) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }
  if (client === null) return <p>Cliente não encontrado. <Link className="underline" to="/admin/clientes">Voltar</Link></p>

  const setE = (k) => (e) => setNewEvent((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/clientes" className="text-sm text-neutral-600 hover:text-ink">
          ← Todos os clientes
        </Link>
        <h1 className="mt-2 font-display text-3xl">{client.full_name || client.email}</h1>
        <p className="text-sm text-neutral-600">Login: {client.email}</p>
      </div>

      <section className="card">
        <h2 className="font-display text-xl">Dados e acesso</h2>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <form onSubmit={saveInfo} className="grid gap-3">
            <Field label="Nome">
              <input className="input" required value={info.full_name} onChange={(e) => setInfo({ ...info, full_name: e.target.value })} />
            </Field>
            <Field label="Telefone / WhatsApp">
              <input className="input" value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} />
            </Field>
            <div>
              <button className="btn btn-primary btn-sm">Salvar dados</button>
            </div>
          </form>
          <form onSubmit={changePassword} className="grid content-start gap-3">
            <Field label="Definir nova senha" hint="Mínimo de 8 caracteres. Use se o cliente esquecer a senha.">
              <input className="input" type="text" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <div>
              <button className="btn btn-dark btn-sm">Alterar senha</button>
            </div>
          </form>
        </div>
      </section>

      <section className="card">
        <h2 className="font-display text-xl">Novo evento / galeria</h2>
        <form onSubmit={createEvent} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Título" className="lg:col-span-2">
            <input className="input" required placeholder="Ex.: Casamento Ana & Bruno" value={newEvent.title} onChange={setE('title')} />
          </Field>
          <Field label="Serviço">
            <input className="input" list="services-list" value={newEvent.service} onChange={setE('service')} />
            <datalist id="services-list">
              {services.map((s) => (
                <option key={s.id} value={s.title} />
              ))}
            </datalist>
          </Field>
          <Field label="Data">
            <input className="input" type="date" value={newEvent.event_date} onChange={setE('event_date')} />
          </Field>
          <Field label="Local" className="sm:col-span-2 lg:col-span-3">
            <input className="input" value={newEvent.location} onChange={setE('location')} />
          </Field>
          <div className="flex items-end">
            <button className="btn btn-primary w-full">Criar evento</button>
          </div>
        </form>
      </section>

      <div className="space-y-6">
        {events.length === 0 && <p className="text-sm text-neutral-500">Este cliente ainda não tem eventos.</p>}
        {events.map((ev) => (
          <EventCard key={ev.id} event={ev} clientId={id} onChanged={load} />
        ))}
      </div>

      <OrdersList orders={orders} />

      <section className="rounded-2xl border border-red-200 p-6">
        <h2 className="font-display text-xl text-red-700">Zona de perigo</h2>
        <p className="mt-1 text-sm text-neutral-600">Exclui o login, os eventos e todas as fotos privadas deste cliente.</p>
        <button className="btn btn-danger btn-sm mt-3" onClick={deleteClient}>
          Excluir cliente
        </button>
      </section>
    </div>
  )
}
