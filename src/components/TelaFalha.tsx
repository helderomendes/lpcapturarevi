import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { variaveisFaltando } from '@/lib/supabase'

/**
 * Qualquer falha que impeca o app de funcionar precisa aparecer escrita na
 * tela. Um app de evento que abre em branco e pior do que um app que nao abre:
 * o BDR fica sem saber se pode capturar, e ninguem tem console aberto no
 * estande para descobrir o motivo.
 */
function Falha({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center text-white">
          <Logo className="h-8 w-auto" />
        </div>
        <div className="glass-forte space-y-4 p-6">
          <h1 className="text-lg font-semibold text-amber-200">{titulo}</h1>
          {children}
        </div>
      </div>
    </main>
  )
}

/** Falta variavel de ambiente: o app nao tem como falar com o Supabase. */
export function TelaConfiguracao() {
  return (
    <Falha titulo="Configuração incompleta">
      <p className="text-sm text-white/70">
        O app foi publicado sem estas variáveis de ambiente:
      </p>
      <ul className="space-y-1">
        {variaveisFaltando.map((nome) => (
          <li key={nome} className="rounded-lg bg-black/40 px-3 py-2 font-mono text-sm text-red-200">
            {nome}
          </li>
        ))}
      </ul>
      <div className="space-y-2 text-sm text-white/60">
        <p>
          Na Vercel: <b>Settings → Environment Variables</b>. Os valores estão no painel do
          Supabase, em <b>Project Settings → API</b>.
        </p>
        <p className="text-amber-200/90">
          Depois de adicionar, é preciso <b>refazer o deploy</b>. O Vite embute essas
          variáveis no bundle durante o build — adicionar sem rebuildar não muda nada.
        </p>
        <p>
          Localmente: copie <code>.env.example</code> para <code>.env</code> e rode{' '}
          <code>npm run dev</code> de novo.
        </p>
      </div>
    </Falha>
  )
}

interface EstadoBoundary {
  erro: Error | null
}

/** Rede de segurança para qualquer outro erro de render. */
export class LimiteDeErro extends Component<{ children: ReactNode }, EstadoBoundary> {
  state: EstadoBoundary = { erro: null }

  static getDerivedStateFromError(erro: Error): EstadoBoundary {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('[revi-captura] erro fatal na interface', erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children

    return (
      <Falha titulo="O app encontrou um erro">
        <p className="text-sm text-white/70">
          Nenhum lead foi perdido — tudo que já foi capturado continua salvo no aparelho.
        </p>
        <pre className="max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-red-200">
          {this.state.erro.message}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="min-h-touch w-full rounded-xl bg-revi-500 px-5 font-semibold text-white transition hover:bg-revi-400"
        >
          Recarregar
        </button>
      </Falha>
    )
  }
}
