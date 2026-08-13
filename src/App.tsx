import { Navigate, Route, Routes } from 'react-router-dom'
import { AvisoSync } from '@/components/IndicadorSync'
import { Spinner } from '@/components/ui'
import { AppProvider } from '@/contexts/AppContext'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Captura } from '@/pages/Captura'
import { Fila } from '@/pages/Fila'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { PosSalvamento } from '@/pages/PosSalvamento'
import type { ReactNode } from 'react'

/**
 * Protege as rotas internas. Note que a sessao expirada NAO bloqueia o app:
 * enquanto houver usuario em cache, o BDR continua capturando — o login so e
 * exigido no momento de sincronizar.
 */
function Protegida({ children }: { children: ReactNode }) {
  const { usuario, carregando } = useAuth()

  if (carregando) {
    return (
      <div className="flex min-h-full items-center justify-center text-white/40">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (!usuario) return <Navigate to="/login" replace />
  return <>{children}</>
}

function Rotas() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protegida>
            <Home />
          </Protegida>
        }
      />
      <Route
        path="/captura"
        element={
          <Protegida>
            <Captura />
          </Protegida>
        }
      />
      <Route
        path="/captura/:id"
        element={
          <Protegida>
            <Captura />
          </Protegida>
        }
      />
      <Route
        path="/salvo/:id"
        element={
          <Protegida>
            <PosSalvamento />
          </Protegida>
        }
      />
      <Route
        path="/fila"
        element={
          <Protegida>
            <Fila />
          </Protegida>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <Rotas />
        <AvisoSync />
      </AppProvider>
    </AuthProvider>
  )
}
