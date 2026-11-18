import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Spinner from './Spinner.jsx'

export default function ProtectedRoute({ children, admin = false }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (!session) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  if (admin && profile?.role !== 'admin') return <Navigate to="/minha-area" replace />
  return children
}
