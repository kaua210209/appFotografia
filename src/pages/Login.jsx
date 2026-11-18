import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext.jsx'
import Field from '../components/Field.jsx'
import Spinner from '../components/Spinner.jsx'

export default function Login() {
  const { session, profile, loading, signIn } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (session && profile) {
    const dest = profile.role === 'admin' ? '/admin' : location.state?.from || '/minha-area'
    return <Navigate to={dest.startsWith('/admin') && profile.role !== 'admin' ? '/minha-area' : dest} replace />
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setError('E-mail ou senha incorretos.')
  }

  async function forgot() {
    setError('')
    setInfo('')
    if (!email.trim()) return setError('Digite seu e-mail acima para receber o link de redefinição.')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    if (error) setError('Não foi possível enviar o e-mail agora. Tente novamente mais tarde.')
    else setInfo('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.')
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
      <h1 className="text-center font-display text-3xl">Área do cliente</h1>
      <p className="mt-2 text-center text-sm text-neutral-600">
        Entre com o e-mail e a senha que o estúdio enviou para você.
      </p>
      <form onSubmit={submit} className="card mt-8 grid gap-4">
        <Field label="E-mail">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Senha">
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-emerald-700">{info}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <button type="button" onClick={forgot} className="cursor-pointer text-sm text-neutral-600 underline hover:text-ink">
          Esqueci minha senha
        </button>
      </form>
    </div>
  )
}
