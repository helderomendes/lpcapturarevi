import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Botao, Campo, Card } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'

/** Minimalista de proposito: logo, e-mail, senha, botao. Nada mais. */
export function Login() {
  const { usuario, entrar, carregando } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (carregando) return null
  if (usuario) return <Navigate to="/" replace />

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await entrar(email, senha)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center text-white">
          <Logo className="h-9 w-auto" />
        </div>

        <Card forte>
          <form onSubmit={enviar} className="space-y-4" noValidate>
            <Campo
              id="email"
              rotulo="E-mail"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Campo
              id="senha"
              rotulo="Senha"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />

            {erro && (
              <p role="alert" className="text-sm text-red-300">
                {erro}
              </p>
            )}

            <Botao type="submit" larguraTotal carregando={enviando}>
              Entrar
            </Botao>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-white/35">
          Acesso interno Revi. Usuários são criados pelo admin.
        </p>
      </div>
    </main>
  )
}
