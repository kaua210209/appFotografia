import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import ChangePassword from '../components/ChangePassword.jsx'
import Spinner from '../components/Spinner.jsx'

export default function ResetPassword() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
      <h1 className="font-display text-3xl">Criar nova senha</h1>
      <div className="card mt-6">
        {loading ? (
          <div className="flex justify-center">
            <Spinner />
          </div>
        ) : session ? (
          <ChangePassword onDone={() => setTimeout(() => navigate('/minha-area'), 1200)} />
        ) : (
          <p className="text-sm text-neutral-600">
            Este link expirou ou já foi usado. Volte à tela de login e peça um novo link em “Esqueci minha senha”.
          </p>
        )}
      </div>
    </div>
  )
}
