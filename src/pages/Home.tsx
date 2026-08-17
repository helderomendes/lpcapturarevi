import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Header } from '@/components/Header'
import { StatusPill } from '@/components/StatusPill'
import { Botao, Card } from '@/components/ui'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { listarLeads } from '@/lib/db'
import { formatarHora } from '@/lib/validacao'
import type { Lead } from '@/types'

export function Home() {
  const navegar = useNavigate()
  const { usuario, sair, sessaoExpirada } = useAuth()
  const { eventos, evento, selecionarEvento, capturadosHoje, resumo, sync } = useApp()
  const [recentes, setRecentes] = useState<Lead[]>([])

  useEffect(() => {
    if (!usuario) return
    void listarLeads(usuario.id, 12).then(setRecentes)
  }, [usuario, resumo, sync.rodando])

  const precisaLogin = sessaoExpirada || sync.precisaLogin

  return (
    <div className="min-h-full pb-16">
      <Header />

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {precisaLogin && (
          <Card className="border-amber-400/30 bg-amber-400/[0.07]">
            <p className="text-sm text-amber-100">
              Sua sessão expirou. Você pode continuar capturando normalmente — os leads
              ficam salvos no aparelho. Faça login de novo para sincronizar.
            </p>
            <Botao
              variante="secundario"
              className="mt-3"
              onClick={() => {
                void sair().then(() => navegar('/login'))
              }}
            >
              Fazer login
            </Botao>
          </Card>
        )}

        {/* Evento ativo. Trocar de evento nunca exige alteracao de codigo. */}
        <Card>
          <label htmlFor="evento" className="rotulo">
            Evento ativo
          </label>
          <select
            id="evento"
            className="campo appearance-none"
            value={evento?.id ?? ''}
            onChange={(e) => void selecionarEvento(e.target.value)}
          >
            {/* Sem placeholder o navegador exibiria a primeira opcao mesmo com
                nenhum evento realmente selecionado — e o BDR acharia que esta
                capturando para um evento que o app nao conhece. */}
            {!evento && (
              <option value="" className="bg-canvas">
                {eventos.length === 0 ? 'Nenhum evento cadastrado' : 'Selecione o evento…'}
              </option>
            )}
            {eventos.map((item) => (
              <option key={item.id} value={item.id} className="bg-canvas">
                {item.nome}
              </option>
            ))}
          </select>
          {eventos.length === 0 && (
            <p className="mt-2 text-sm text-white/45">
              Cadastre um evento na tabela <code>eventos</code> do Supabase.
            </p>
          )}
        </Card>

        <Botao
          larguraTotal
          className="!min-h-[76px] !text-lg"
          disabled={!evento}
          onClick={() => navegar('/captura')}
        >
          + Novo lead
        </Botao>

        <div className="grid grid-cols-2 gap-3">
          <Card className="text-center">
            <p className="text-4xl font-bold tabular-nums">{capturadosHoje}</p>
            <p className="mt-1 text-sm text-white/50">capturados hoje</p>
          </Card>
          <Link to="/fila" className="block">
            <Card className="h-full text-center transition hover:bg-white/[0.07]">
              <p className="text-4xl font-bold tabular-nums">
                {resumo.pendentes + resumo.erros + resumo.duplicados}
              </p>
              <p className="mt-1 text-sm text-white/50">na fila de envio</p>
            </Card>
          </Link>
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              Últimos leads
            </h2>
            {recentes.length > 0 && (
              <Link to="/fila" className="text-sm font-medium text-revi-300">
                Ver fila
              </Link>
            )}
          </div>

          {recentes.length === 0 ? (
            <Card>
              <p className="text-sm text-white/45">
                Nenhum lead capturado ainda. Toque em “Novo lead” para começar.
              </p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {recentes.map((lead) => (
                <li key={lead.id}>
                  {/* Tocavel para editar ou completar os campos internos. */}
                  <Link
                    to={`/captura/${lead.id}`}
                    className="glass flex min-h-touch items-center gap-3 px-4 py-3 transition hover:bg-white/[0.07]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{lead.nome}</p>
                      <p className="truncate text-sm text-white/45">
                        {lead.empresa} · {formatarHora(lead.criado_em)}
                        {lead.agendou_reuniao && ' · reunião agendada'}
                      </p>
                    </div>
                    <StatusPill status={lead.status_sync} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Painel só aparece para admin — o BDR no estande não precisa dele. */}
        {usuario?.papel === 'admin' && (
          <Link to="/painel" className="block">
            <Card className="flex items-center gap-3 transition hover:bg-white/[0.07]">
              <div className="flex-1">
                <p className="text-sm font-semibold">Painel</p>
                <p className="text-xs text-white/45">
                  Equipe, eventos e leads de todos
                </p>
              </div>
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white/35" fill="none" aria-hidden>
                <path
                  d="M9 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Card>
          </Link>
        )}

        <div className="pt-4 text-center">
          <button
            onClick={() => void sair().then(() => navegar('/login'))}
            className="min-h-touch px-4 text-sm text-white/40 transition hover:text-white/70"
          >
            Sair ({usuario?.email})
          </button>
        </div>
      </main>
    </div>
  )
}
