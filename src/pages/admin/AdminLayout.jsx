import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext.jsx'

const TABS = [
  { to: '/admin', label: 'Site', end: true },
  { to: '/admin/portfolio', label: 'Portfólio' },
  { to: '/admin/clientes', label: 'Clientes' },
  { to: '/admin/agendamentos', label: 'Agendamentos', badge: 'bookings' },
  { to: '/admin/depoimentos', label: 'Depoimentos', badge: 'testimonials' },
]

export default function AdminLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [pending, setPending] = useState({ bookings: 0, testimonials: 0 })

  useEffect(() => {
    ;(async () => {
      const [b, t] = await Promise.all([
        supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase.from('testimonials').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
      ])
      setPending({ bookings: b.count || 0, testimonials: t.count || 0 })
    })()
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="font-display text-lg">Painel administrativo</span>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-white/70 hover:text-white">
              Ver site
            </Link>
            <button
              className="cursor-pointer text-white/70 hover:text-white"
              onClick={async () => {
                await signOut()
                navigate('/')
              }}
            >
              Sair
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-4 py-3 text-sm transition ${
                  isActive ? 'border-gold text-white' : 'border-transparent text-white/60 hover:text-white'
                }`
              }
            >
              {t.label}
              {t.badge && pending[t.badge] > 0 && (
                <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-xs text-white">{pending[t.badge]}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
