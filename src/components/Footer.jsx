import { Link } from 'react-router-dom'
import { useSite } from '../context/SiteContext.jsx'

export default function Footer() {
  const { settings } = useSite()
  return (
    <footer className="bg-ink py-8 text-sm text-white/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6">
        <p>
          © {new Date().getFullYear()} {settings.company_name || 'Estúdio de Fotografia'}. Todos os direitos
          reservados.
        </p>
        <Link to="/entrar" className="hover:text-gold">
          Área do cliente
        </Link>
      </div>
    </footer>
  )
}
