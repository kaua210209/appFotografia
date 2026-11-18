import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSite } from '../../context/SiteContext.jsx'
import { publicUrl } from '../../lib/storage.js'
import { EVENT_TYPES } from '../../lib/constants.js'
import Lightbox from '../Lightbox.jsx'
import Spinner from '../Spinner.jsx'
import Field from '../Field.jsx'

function SectionHeader({ kicker, title, children }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      {kicker && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-gold">{kicker}</p>}
      <h2 className="section-title">{title}</h2>
      {children && <p className="mt-3 text-neutral-600">{children}</p>}
    </div>
  )
}

export function About() {
  const { settings, services } = useSite()
  return (
    <section id="servicos" className="scroll-mt-16 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader kicker="Sobre o estúdio" title={settings.about_title || 'Quem somos'}>
          {settings.about_text}
        </SectionHeader>
        {services.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s, idx) => (
              <div key={s.id} className="card transition hover:-translate-y-1 hover:shadow-md">
                <span className="font-display text-3xl text-gold">{String(idx + 1).padStart(2, '0')}</span>
                <h3 className="mt-2 font-display text-xl">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{s.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export function Portfolio() {
  const [photos, setPhotos] = useState(null)
  const [limit, setLimit] = useState(18)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    supabase
      .from('public_photos')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setPhotos(data || []))
  }, [])

  const items = (photos || []).map((p) => ({ url: publicUrl(p.path), name: p.caption }))

  return (
    <section id="portfolio" className="scroll-mt-16 bg-sand/60 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader kicker="Portfólio" title="Alguns dos nossos trabalhos" />
        {photos === null && (
          <div className="flex justify-center">
            <Spinner />
          </div>
        )}
        {photos?.length === 0 && <p className="text-center text-neutral-500">Em breve, novas fotos por aqui.</p>}
        <div className="columns-2 gap-3 md:columns-3">
          {items.slice(0, limit).map((p, idx) => (
            <button
              key={p.url}
              onClick={() => setOpen(idx)}
              className="group mb-3 block w-full cursor-zoom-in overflow-hidden rounded-xl break-inside-avoid"
            >
              <img
                src={p.url}
                alt={p.name || 'Fotografia do portfólio'}
                loading="lazy"
                className="w-full transition duration-500 group-hover:scale-105"
              />
            </button>
          ))}
        </div>
        {items.length > limit && (
          <div className="mt-8 text-center">
            <button className="btn btn-outline" onClick={() => setLimit((l) => l + 18)}>
              Ver mais fotos
            </button>
          </div>
        )}
      </div>
      {open !== null && <Lightbox items={items} index={open} onChange={setOpen} onClose={() => setOpen(null)} />}
    </section>
  )
}

function Stars({ value }) {
  return (
    <span className="text-gold" aria-label={`${value} de 5 estrelas`}>
      {'★'.repeat(value)}
      <span className="text-neutral-300">{'★'.repeat(5 - value)}</span>
    </span>
  )
}

function TestimonialForm() {
  const [form, setForm] = useState({ author_name: '', event_type: EVENT_TYPES[0], rating: 5, content: '', website: '' })
  const [state, setState] = useState('idle')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (form.website) return setState('done')
    setState('sending')
    const { error } = await supabase.from('testimonials').insert({
      author_name: form.author_name.trim(),
      event_type: form.event_type,
      rating: Number(form.rating),
      content: form.content.trim(),
    })
    setState(error ? 'error' : 'done')
  }

  if (state === 'done') {
    return (
      <div className="card mx-auto mt-10 max-w-xl text-center">
        <p className="font-display text-xl">Obrigado pelo carinho!</p>
        <p className="mt-1 text-sm text-neutral-600">Seu depoimento foi enviado e aparecerá no site após a aprovação.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-10 grid max-w-xl gap-4 sm:grid-cols-2">
      <h3 className="font-display text-xl sm:col-span-2">Deixe seu depoimento</h3>
      <Field label="Seu nome">
        <input className="input" required value={form.author_name} onChange={set('author_name')} />
      </Field>
      <Field label="Tipo de evento">
        <select className="input" value={form.event_type} onChange={set('event_type')}>
          {EVENT_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Nota" className="sm:col-span-2">
        <select className="input" value={form.rating} onChange={set('rating')}>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {'★'.repeat(n)} ({n})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Seu depoimento" className="sm:col-span-2">
        <textarea className="input min-h-24" required maxLength={1000} value={form.content} onChange={set('content')} />
      </Field>
      <input type="text" name="website" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {state === 'error' && <p className="text-sm text-red-600 sm:col-span-2">Não foi possível enviar. Tente novamente.</p>}
      <div className="sm:col-span-2">
        <button className="btn btn-dark" disabled={state === 'sending'}>
          {state === 'sending' ? 'Enviando…' : 'Enviar depoimento'}
        </button>
      </div>
    </form>
  )
}

export function Testimonials() {
  const [items, setItems] = useState(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    supabase
      .from('testimonials')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setItems(data || []))
  }, [])

  return (
    <section id="depoimentos" className="scroll-mt-16 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader kicker="Depoimentos" title="O que dizem nossos clientes" />
        {items?.length === 0 && <p className="text-center text-neutral-500">Seja o primeiro a deixar um depoimento.</p>}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {(items || []).map((t) => (
            <figure key={t.id} className="card flex flex-col">
              <Stars value={t.rating} />
              <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-neutral-700">“{t.content}”</blockquote>
              <figcaption className="mt-4 text-sm">
                <span className="font-semibold">{t.author_name}</span>
                {t.event_type && <span className="text-neutral-500"> · {t.event_type}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-8 text-center">
          {!showForm && (
            <button className="btn btn-outline" onClick={() => setShowForm(true)}>
              Deixar um depoimento
            </button>
          )}
        </div>
        {showForm && <TestimonialForm />}
      </div>
    </section>
  )
}

export function Contact() {
  const { settings } = useSite()
  const whatsapp = (settings.whatsapp || '').replace(/\D/g, '')
  const insta = (settings.instagram || '').replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')

  const rows = [
    settings.contact_email && ['E-mail', settings.contact_email, `mailto:${settings.contact_email}`],
    settings.contact_phone && ['Telefone', settings.contact_phone, `tel:${settings.contact_phone.replace(/\D/g, '')}`],
    whatsapp && ['WhatsApp', 'Conversar agora', `https://wa.me/${whatsapp}`],
    insta && ['Instagram', `@${insta}`, `https://instagram.com/${insta}`],
    settings.address && ['Endereço', settings.address, null],
    settings.hours && ['Atendimento', settings.hours, null],
  ].filter(Boolean)

  return (
    <section id="contato" className="scroll-mt-16 bg-ink px-4 py-20 text-white sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-gold">Contato</p>
          <h2 className="section-title">Vamos conversar?</h2>
          <p className="mt-3 text-white/70">Fale com a gente por qualquer um dos canais abaixo.</p>
        </div>
        {rows.length === 0 ? (
          <p className="text-center text-white/60">Informações de contato em breve.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rows.map(([label, value, href]) => (
              <div key={label} className="rounded-2xl border border-white/10 p-5">
                <p className="text-xs uppercase tracking-wider text-gold">{label}</p>
                {href ? (
                  <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="mt-1 block break-words hover:text-gold">
                    {value}
                  </a>
                ) : (
                  <p className="mt-1">{value}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
