import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { adminUsers } from '../../lib/api.js'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../lib/constants.js'
import Field from '../../components/Field.jsx'
import Modal from '../../components/Modal.jsx'
import Spinner from '../../components/Spinner.jsx'

function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(10))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

function NewClientModal({ onClose, onCreated }) {
  const toast = useToast()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: generatePassword() })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const { id } = await adminUsers({ action: 'create', ...form })
      toast('Cliente cadastrado. Anote a senha para enviar a ele!')
      onCreated(id)
    } catch (err) {
      toast(err.message, 'error')
      setSaving(false)
    }
  }

  return (
    <Modal title="Novo cliente" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Nome completo">
          <input className="input" required value={form.full_name} onChange={set('full_name')} />
        </Field>
        <Field label="E-mail (será o login)">
          <input className="input" type="email" required value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Telefone / WhatsApp">
          <input className="input" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Senha inicial" hint="Mínimo de 8 caracteres. Copie e envie ao cliente; ele poderá trocar depois.">
          <div className="flex gap-2">
            <input className="input mt-1 font-mono" required minLength={8} value={form.password} onChange={set('password')} />
            <button type="button" className="btn btn-outline btn-sm mt-1" onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}>
              Gerar outra
            </button>
          </div>
        </Field>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Cadastrando…' : 'Cadastrar cliente'}
        </button>
      </form>
    </Modal>
  )
}

export default function AdminClients() {
  const navigate = useNavigate()
  const [clients, setClients] = useState(null)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'client').order('full_name')
    setClients(data || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients || []
    return (clients || []).filter((c) => `${c.full_name} ${c.email} ${c.phone || ''}`.toLowerCase().includes(q))
  }, [clients, query])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Clientes</h1>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Novo cliente
        </button>
      </div>
      <input className="input mt-4 max-w-sm" placeholder="Buscar por nome, e-mail ou telefone" value={query} onChange={(e) => setQuery(e.target.value)} />

      {clients === null && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {clients?.length === 0 && <div className="card mt-6 text-neutral-600">Nenhum cliente cadastrado ainda.</div>}

      <div className="mt-5 grid gap-3">
        {filtered.map((c) => (
          <Link key={c.id} to={`/admin/clientes/${c.id}`} className="card flex flex-wrap items-center justify-between gap-2 py-4 transition hover:shadow-md">
            <div>
              <p className="font-medium">{c.full_name || '(sem nome)'}</p>
              <p className="text-sm text-neutral-600">
                {c.email}
                {c.phone && ` · ${c.phone}`}
              </p>
            </div>
            <span className="text-xs text-neutral-500">Desde {formatDate(c.created_at)}</span>
          </Link>
        ))}
      </div>

      {creating && (
        <NewClientModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            navigate(`/admin/clientes/${id}`)
          }}
        />
      )}
    </div>
  )
}
