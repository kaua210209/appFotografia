import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext.jsx'
import Field from './Field.jsx'

export default function ChangePassword({ onDone }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (password.length < 8) return toast('A senha precisa ter ao menos 8 caracteres.', 'error')
    if (password !== confirm) return toast('As senhas não conferem.', 'error')
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) return toast(error.message, 'error')
    setPassword('')
    setConfirm('')
    toast('Senha alterada com sucesso.')
    onDone?.()
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:max-w-sm">
      <Field label="Nova senha">
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="Repita a nova senha">
        <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </Field>
      <div>
        <button className="btn btn-dark" disabled={saving}>
          {saving ? 'Salvando…' : 'Alterar senha'}
        </button>
      </div>
    </form>
  )
}
