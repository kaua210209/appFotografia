import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext.jsx'
import { EVENT_TYPES } from '../lib/constants.js'
import Field from './Field.jsx'

export default function BookingForm({ onDone }) {
  const { session, profile } = useAuth()
  const [form, setForm] = useState({
    name: profile?.full_name || '',
    email: profile?.email || session?.user?.email || '',
    phone: profile?.phone || '',
    event_type: EVENT_TYPES[0],
    event_date: '',
    location: '',
    message: '',
    website: '', // campo isca contra robôs
  })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (form.website) {
      setSent(true)
      return
    }
    setSending(true)
    const { error } = await supabase.from('bookings').insert({
      client_id: session?.user?.id ?? null,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      event_type: form.event_type,
      event_date: form.event_date || null,
      location: form.location.trim() || null,
      message: form.message.trim() || null,
    })
    setSending(false)
    if (error) {
      setError('Não foi possível enviar agora. Tente novamente em instantes.')
      return
    }
    setSent(true)
    onDone?.()
  }

  if (sent) {
    return (
      <div className="card text-center">
        <p className="font-display text-2xl">Solicitação enviada!</p>
        <p className="mt-2 text-neutral-600">Recebemos seu pedido e entraremos em contato em breve para confirmar os detalhes.</p>
        <button className="btn btn-outline btn-sm mt-5" onClick={() => setSent(false)}>
          Fazer outra solicitação
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 sm:grid-cols-2">
      <Field label="Nome completo">
        <input className="input" required value={form.name} onChange={set('name')} autoComplete="name" />
      </Field>
      <Field label="E-mail">
        <input className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
      </Field>
      <Field label="Telefone / WhatsApp">
        <input className="input" value={form.phone} onChange={set('phone')} autoComplete="tel" />
      </Field>
      <Field label="Tipo de evento">
        <select className="input" value={form.event_type} onChange={set('event_type')}>
          {EVENT_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Data prevista">
        <input className="input" type="date" value={form.event_date} onChange={set('event_date')} />
      </Field>
      <Field label="Local do evento">
        <input className="input" value={form.location} onChange={set('location')} />
      </Field>
      <Field label="Conte mais sobre o que você precisa" className="sm:col-span-2">
        <textarea className="input min-h-28" value={form.message} onChange={set('message')} />
      </Field>

      <input
        type="text"
        name="website"
        value={form.website}
        onChange={set('website')}
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button className="btn btn-primary" disabled={sending}>
          {sending ? 'Enviando…' : 'Solicitar agendamento'}
        </button>
      </div>
    </form>
  )
}
