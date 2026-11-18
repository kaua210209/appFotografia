import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext.jsx'
import { BOOKING_STATUS, formatDate } from '../../lib/constants.js'
import Spinner from '../../components/Spinner.jsx'

export default function AdminBookings() {
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [filter, setFilter] = useState('todos')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('bookings')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
    setItems(data || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function setStatus(id, status) {
    const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
    if (error) return toast(error.message, 'error')
    setItems((list) => list.map((b) => (b.id === id ? { ...b, status } : b)))
  }

  async function remove(id) {
    if (!window.confirm('Excluir esta solicitação?')) return
    const { error } = await supabase.from('bookings').delete().eq('id', id)
    if (error) return toast(error.message, 'error')
    setItems((list) => list.filter((b) => b.id !== id))
  }

  const visible = (items || []).filter((b) => filter === 'todos' || b.status === filter)

  return (
    <div>
      <h1 className="font-display text-3xl">Agendamentos</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {['todos', ...Object.keys(BOOKING_STATUS)].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`btn btn-sm ${filter === s ? 'btn-dark' : 'btn-outline'}`}
          >
            {s === 'todos' ? 'Todos' : BOOKING_STATUS[s].label}
          </button>
        ))}
      </div>

      {items === null && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {items && visible.length === 0 && <div className="card mt-6 text-neutral-600">Nenhuma solicitação por aqui.</div>}

      <div className="mt-5 space-y-4">
        {visible.map((b) => {
          const phone = (b.phone || '').replace(/\D/g, '')
          return (
            <article key={b.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl">{b.name}</h3>
                  <p className="text-sm text-neutral-600">
                    {b.event_type || 'Evento'} · {formatDate(b.event_date)}
                    {b.location && ` · ${b.location}`}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Recebido em {formatDate(b.created_at)}
                    {b.client_id && (
                      <>
                        {' · '}
                        <Link className="underline" to={`/admin/clientes/${b.client_id}`}>
                          cliente cadastrado ({b.profiles?.full_name || 'ver perfil'})
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <select
                  className={`rounded-full border-0 px-3 py-1.5 text-xs font-medium ${BOOKING_STATUS[b.status]?.cls}`}
                  value={b.status}
                  onChange={(e) => setStatus(b.id, e.target.value)}
                >
                  {Object.entries(BOOKING_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              {b.message && <p className="mt-3 whitespace-pre-line rounded-xl bg-paper p-3 text-sm text-neutral-700">{b.message}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <a className="btn btn-outline btn-sm" href={`mailto:${b.email}`}>
                  {b.email}
                </a>
                {phone && (
                  <a className="btn btn-outline btn-sm" href={`https://wa.me/${phone.length <= 11 ? '55' + phone : phone}`} target="_blank" rel="noreferrer">
                    WhatsApp {b.phone}
                  </a>
                )}
                <button className="btn btn-danger btn-sm ml-auto" onClick={() => remove(b.id)}>
                  Excluir
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
