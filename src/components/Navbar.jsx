import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSite } from '../context/SiteContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { publicUrl } from '../lib/storage.js'

const LINKS = [
  ['Início', ''],
  ['Serviços', 'servicos'],
  ['Portfólio', 'portfolio'],
  ['Depoimentos', 'depoimentos'],
  ['Agendar', 'agendar'],
  ['Contato', 'contato'],
]

export default function Navbar() {
  const { settings } = useSite()
  const { session, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const logo = settings.logo_path ? publicUrl(settings.logo_path) : null

  const to = (id) => ({ pathname: '/', hash: id ? `#${id}` : '' })

  async function handleSignOut() {
    setOpen(false)
    await signOut()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-40 bg-ink/95 text-white backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          {logo ? (
            <img src={logo} alt={settings.company_name || 'Logotipo'} className="h-10 w-auto object-contain" />
          ) : (
            <span className="font-display text-xl tracking-wide">{settings.company_name || 'Estúdio'}</span>
          )}
        </Link>

        <nav className="hidden items-center gap-6 text-sm lg:flex">
          {LINKS.map(([label, id]) => (
            <Link key={label} to={to(id)} className="text-white/80 transition hover:text-gold">
              {label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {session ? (
            <>
              <Link to={isAdmin ? '/admin' : '/minha-area'} className="btn btn-primary btn-sm">
                {isAdmin ? 'Painel' : 'Minha área'}
              </Link>
              <button onClick={handleSignOut} className="cursor-pointer text-sm text-white/70 hover:text-white">
                Sair
              </button>
            </>
          ) : (
            <Link to="/entrar" className="btn btn-light btn-sm">
              Área do cliente
            </Link>
          )}
        </div>

        <button
          className="cursor-pointer p-2 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Abrir menu"
          aria-expanded={open}
        >
          <span className="block h-0.5 w-6 bg-white" />
          <span className="mt-1.5 block h-0.5 w-6 bg-white" />
          <span className="mt-1.5 block h-0.5 w-6 bg-white" />
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 px-4 pb-4 lg:hidden">
          <nav className="flex flex-col">
            {LINKS.map(([label, id]) => (
              <Link
                key={label}
                to={to(id)}
                onClick={() => setOpen(false)}
                className="border-b border-white/10 py-3 text-white/90"
              >
                {label}
              </Link>
            ))}
            {session ? (
              <>
                <Link
                  to={isAdmin ? '/admin' : '/minha-area'}
                  onClick={() => setOpen(false)}
                  className="py-3 text-gold"
                >
                  {isAdmin ? 'Painel administrativo' : 'Minha área'}
                </Link>
                <button onClick={handleSignOut} className="py-3 text-left text-white/70">
                  Sair
                </button>
              </>
            ) : (
              <Link to="/entrar" onClick={() => setOpen(false)} className="py-3 text-gold">
                Área do cliente
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
