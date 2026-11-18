import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import ClientArea from './pages/ClientArea.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'
import AdminSite from './pages/admin/AdminSite.jsx'
import AdminPortfolio from './pages/admin/AdminPortfolio.jsx'
import AdminClients from './pages/admin/AdminClients.jsx'
import AdminClientDetail from './pages/admin/AdminClientDetail.jsx'
import AdminBookings from './pages/admin/AdminBookings.jsx'
import AdminTestimonials from './pages/admin/AdminTestimonials.jsx'

function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

function SetupNotice() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="font-display text-3xl">Falta conectar o Supabase</h1>
      <p className="mt-4 text-neutral-700">
        Crie o arquivo <code className="rounded bg-sand px-1.5 py-0.5">.env</code> na raiz do projeto com:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-4 text-sm text-white">
{`VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica`}
      </pre>
      <p className="mt-4 text-neutral-700">
        Depois reinicie o <code className="rounded bg-sand px-1.5 py-0.5">npm run dev</code>. O passo a passo
        completo está no README.
      </p>
    </div>
  )
}

export default function App() {
  if (!isConfigured) return <SetupNotice />

  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/entrar" element={<Login />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route
          path="/minha-area"
          element={
            <ProtectedRoute>
              <ClientArea />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route
        path="/admin"
        element={
          <ProtectedRoute admin>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminSite />} />
        <Route path="portfolio" element={<AdminPortfolio />} />
        <Route path="clientes" element={<AdminClients />} />
        <Route path="clientes/:id" element={<AdminClientDetail />} />
        <Route path="agendamentos" element={<AdminBookings />} />
        <Route path="depoimentos" element={<AdminTestimonials />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
