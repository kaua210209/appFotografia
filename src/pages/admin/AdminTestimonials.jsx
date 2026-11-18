import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext.jsx'
import { EVENT_TYPES, formatDate } from '../../lib/constants.js'
import Field from '../../components/Field.jsx'
import Spinner from '../../components/Spinner.jsx'

export default function AdminTestimonials() {
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [form, setForm] = useState({ author_name: '', event_type: EVENT_TYPES[0], rating: 5, content: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const load = useCallback(async () => {
    const { data } = await supabase.from('testimonials').select('*').order('created_at', { ascending: false })
    setItems(data || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function setStatus(id, status) {
    const { error } = await supabase.from('testimonials').update({ status }).eq('id', id)
    if (error) return toast(error.message, 'error')
    load()
  }

  async function remove(id) {
    if (!window.confirm('Excluir este depoimento?')) return
    const { error } = await supabase.from('testimonials').delete().eq('id', id)
    if (error) return toast(error.message, 'error')
    load()
  }

  async function add(e) {
    e.preventDefault()
    const { error } = await supabase.from('testimonials').insert({
      author_name: form.author_name.trim(),
      event_type: form.event_type,
      rating: Number(form.rating),
      content: form.content.trim(),
      status: 'pendente',
    })
    if (error) return toast(error.message, 'error')
    setForm({ author_name: '', event_type: EVENT_TYPES[0], rating: 5, content: '' })
    toast('Depoimento adicionado. Aprove-o para aparecer no site.')
    load()
  }

  const pending = (items || []).filter((t) => t.status === 'pendente')
  const approved = (items || []).filter((t) => t.status === 'aprovado')

  const Card = ({ t }) => (
    <article className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {t.author_name} <span className="text-gold">{'★'.repeat(t.rating)}</span>
          </p>
          <p className="text-xs text-neutral-500">
            {t.event_type} · {formatDate(t.created_at)}
          </p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-line text-sm text-neutral-700">{t.content}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {t.status === 'pendente' ? (
          <button className="btn btn-primary btn-sm" onClick={() => setStatus(t.id, 'aprovado')}>
            Aprovar e publicar
          </button>
        ) : (
          <button className="btn btn-outline btn-sm" onClick={() => setStatus(t.id, 'pendente')}>
            Ocultar do site
          </button>
        )}
        <button className="btn btn-danger btn-sm" onClick={() => remove(t.id)}>
          Excluir
        </button>
      </div>
    </article>
  )

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl">Depoimentos</h1>

      {items === null && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      <section>
        <h2 className="mb-3 font-display text-xl">Aguardando aprovação ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-neutral-500">Nenhum depoimento pendente.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {pending.map((t) => (
            <Card key={t.id} t={t} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl">Publicados no site ({approved.length})</h2>
        {approved.length === 0 && <p className="text-sm text-neutral-500">Nenhum depoimento publicado ainda.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {approved.map((t) => (
            <Card key={t.id} t={t} />
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="font-display text-xl">Adicionar depoimento manualmente</h2>
        <p className="mt-1 text-sm text-neutral-600">Útil para registrar elogios recebidos por mensagem.</p>
        <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Nome">
            <input className="input" required value={form.author_name} onChange={set('author_name')} />
          </Field>
          <Field label="Tipo de evento">
            <select className="input" value={form.event_type} onChange={set('event_type')}>
              {EVENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Nota">
            <select className="input" value={form.rating} onChange={set('rating')}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} ★
                </option>
              ))}
            </select>
          </Field>
          <Field label="Texto" className="sm:col-span-3">
            <textarea className="input min-h-24" required maxLength={1000} value={form.content} onChange={set('content')} />
          </Field>
          <div className="sm:col-span-3">
            <button className="btn btn-dark btn-sm">Adicionar</button>
          </div>
        </form>
      </section>
    </div>
  )
}
