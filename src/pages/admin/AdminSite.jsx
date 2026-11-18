import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSite } from '../../context/SiteContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { ALLOWED_TYPES } from '../../lib/constants.js'
import { PUBLIC_BUCKET, newPath, publicUrl, removeFiles, uploadFile } from '../../lib/storage.js'
import Field from '../../components/Field.jsx'
import Spinner from '../../components/Spinner.jsx'

const FIELDS = [
  ['company_name', 'Nome da empresa', 'text'],
  ['tagline', 'Frase de destaque (topo da página inicial)', 'text'],
  ['about_title', 'Título da apresentação', 'text'],
  ['about_text', 'Texto de apresentação da empresa', 'textarea'],
  ['contact_email', 'E-mail de contato', 'text'],
  ['contact_phone', 'Telefone', 'text'],
  ['whatsapp', 'WhatsApp', 'text', 'Somente números, com DDI e DDD. Ex.: 5532999999999'],
  ['instagram', 'Instagram', 'text', 'Somente o usuário. Ex.: meuestudio'],
  ['address', 'Endereço / região de atendimento', 'text'],
  ['hours', 'Horário de atendimento', 'text'],
  ['watermark_text', 'Texto da marca d\'água das fotos dos clientes', 'text', 'Aparece repetido sobre as prévias antes do pagamento. Se ficar vazio, usa o nome da empresa.'],
]

function LogoCard() {
  const { settings, refresh } = useSite()
  const toast = useToast()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const current = settings.logo_path

  async function setLogo(path) {
    const { error } = await supabase.from('site_settings').upsert({ key: 'logo_path', value: path })
    if (error) throw error
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) return toast('Use uma imagem JPG, PNG ou WEBP.', 'error')
    setBusy(true)
    try {
      const path = newPath('logo', file)
      await uploadFile(PUBLIC_BUCKET, path, file)
      await setLogo(path)
      if (current) await removeFiles(PUBLIC_BUCKET, [current]).catch(() => {})
      await refresh()
      toast('Logotipo atualizado.')
    } catch (err) {
      toast(err.message || 'Falha ao enviar o logotipo.', 'error')
    }
    setBusy(false)
  }

  async function remove() {
    if (!current || !window.confirm('Remover o logotipo?')) return
    setBusy(true)
    try {
      await setLogo('')
      await removeFiles(PUBLIC_BUCKET, [current]).catch(() => {})
      await refresh()
      toast('Logotipo removido.')
    } catch (err) {
      toast(err.message, 'error')
    }
    setBusy(false)
  }

  return (
    <section className="card">
      <h2 className="font-display text-xl">Logotipo</h2>
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <div className="flex h-24 w-48 items-center justify-center rounded-xl bg-ink p-3">
          {current ? (
            <img src={publicUrl(current)} alt="Logotipo atual" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-white/50">Sem logotipo</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={inputRef} type="file" accept={ALLOWED_TYPES.join(',')} className="hidden" onChange={onFile} />
          <button className="btn btn-dark btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'Enviando…' : current ? 'Trocar logotipo' : 'Enviar logotipo'}
          </button>
          {current && (
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={remove}>
              Remover
            </button>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-neutral-500">Dica: use PNG com fundo transparente, em cor clara, para aparecer bem sobre o fundo escuro.</p>
    </section>
  )
}

function SettingsForm() {
  const { settings, refresh } = useSite()
  const toast = useToast()
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map(([k]) => [k, settings[k] || ''])))
  const [saving, setSaving] = useState(false)

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const rows = FIELDS.map(([key]) => ({ key, value: form[key].trim() }))
    const { error } = await supabase.from('site_settings').upsert(rows)
    setSaving(false)
    if (error) return toast(error.message, 'error')
    await refresh()
    toast('Informações salvas.')
  }

  return (
    <form onSubmit={save} className="card grid gap-4 sm:grid-cols-2">
      <h2 className="font-display text-xl sm:col-span-2">Textos e informações de contato</h2>
      {FIELDS.map(([key, label, type, hint]) => (
        <Field key={key} label={label} hint={hint} className={type === 'textarea' ? 'sm:col-span-2' : ''}>
          {type === 'textarea' ? (
            <textarea className="input min-h-32" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
          ) : (
            <input className="input" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
          )}
        </Field>
      ))}
      <div className="sm:col-span-2">
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  )
}

function ServiceRow({ service, isFirst, isLast, onMove, onChanged }) {
  const toast = useToast()
  const [title, setTitle] = useState(service.title)
  const [description, setDescription] = useState(service.description)
  const dirty = title !== service.title || description !== service.description

  async function save() {
    const { error } = await supabase.from('services').update({ title: title.trim(), description: description.trim() }).eq('id', service.id)
    if (error) return toast(error.message, 'error')
    toast('Serviço salvo.')
    onChanged()
  }
  async function remove() {
    if (!window.confirm(`Excluir o serviço "${service.title}"?`)) return
    const { error } = await supabase.from('services').delete().eq('id', service.id)
    if (error) return toast(error.message, 'error')
    onChanged()
  }

  return (
    <div className="rounded-xl border border-ink/10 p-4">
      <div className="grid gap-3">
        <input className="input mt-0" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome do serviço" />
        <textarea className="input mt-0 min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-primary btn-sm" disabled={!dirty || !title.trim()} onClick={save}>
          Salvar
        </button>
        <button className="btn btn-outline btn-sm" disabled={isFirst} onClick={() => onMove(-1)}>
          ↑ Subir
        </button>
        <button className="btn btn-outline btn-sm" disabled={isLast} onClick={() => onMove(1)}>
          ↓ Descer
        </button>
        <button className="btn btn-danger btn-sm" onClick={remove}>
          Excluir
        </button>
      </div>
    </div>
  )
}

function ServicesEditor() {
  const { services, refresh } = useSite()
  const toast = useToast()
  const [title, setTitle] = useState('')

  async function add(e) {
    e.preventDefault()
    if (!title.trim()) return
    const next = services.reduce((m, s) => Math.max(m, s.sort_order), 0) + 1
    const { error } = await supabase.from('services').insert({ title: title.trim(), description: '', sort_order: next })
    if (error) return toast(error.message, 'error')
    setTitle('')
    refresh()
  }

  async function move(idx, delta) {
    const a = services[idx]
    const b = services[idx + delta]
    if (!a || !b) return
    const r1 = await supabase.from('services').update({ sort_order: b.sort_order }).eq('id', a.id)
    const r2 = await supabase.from('services').update({ sort_order: a.sort_order }).eq('id', b.id)
    if (r1.error || r2.error) toast('Não foi possível reordenar.', 'error')
    refresh()
  }

  return (
    <section className="card">
      <h2 className="font-display text-xl">Serviços oferecidos</h2>
      <div className="mt-4 space-y-3">
        {services.map((s, idx) => (
          <ServiceRow
            key={`${s.id}-${s.title}-${s.description}`}
            service={s}
            isFirst={idx === 0}
            isLast={idx === services.length - 1}
            onMove={(d) => move(idx, d)}
            onChanged={refresh}
          />
        ))}
      </div>
      <form onSubmit={add} className="mt-4 flex flex-wrap gap-2">
        <input className="input mt-0 max-w-xs flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Novo serviço (ex.: Ensaio gestante)" />
        <button className="btn btn-dark btn-sm">Adicionar serviço</button>
      </form>
    </section>
  )
}

export default function AdminSite() {
  const { loading } = useSite()
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Página inicial</h1>
        <p className="mt-1 text-sm text-neutral-600">As mudanças aparecem no site assim que você salva.</p>
      </div>
      <LogoCard />
      <SettingsForm />
      <ServicesEditor />
    </div>
  )
}
