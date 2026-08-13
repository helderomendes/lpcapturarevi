import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Header } from '@/components/Header'
import { Botao, Card } from '@/components/ui'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { baseDoAgendamento, montarLinkAgendamento } from '@/lib/agendamento'
import { atualizarLead, obterLead } from '@/lib/db'
import { sincronizar } from '@/lib/sync'
import type { Lead } from '@/types'

export function PosSalvamento() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const { usuario } = useAuth()
  const { evento, atualizar } = useApp()
  const [lead, setLead] = useState<Lead | null>(null)
  // Chegou aqui vindo do botao "Agendar reunião": a aba do HubSpot ja abriu.
  const [aguardandoConfirmacao, setAguardandoConfirmacao] = useState(
    params.get('agendando') === '1',
  )

  useEffect(() => {
    if (!id) return
    void obterLead(id).then((encontrado) => {
      if (!encontrado) navegar('/', { replace: true })
      else setLead(encontrado)
    })
  }, [id, navegar])

  if (!lead) return null

  const link = montarLinkAgendamento(lead, baseDoAgendamento(evento), evento)

  const definirAgendamento = async (agendou: boolean) => {
    await atualizarLead(lead.id, {
      agendou_reuniao: agendou,
      agendamento_aberto: agendou ? false : lead.agendamento_aberto,
    })
    setLead({ ...lead, agendou_reuniao: agendou })
    setAguardandoConfirmacao(false)
    await atualizar()
    if (usuario) void sincronizar(usuario.id).then(atualizar)
  }

  return (
    <div className="min-h-full pb-16">
      <Header voltarPara="/" titulo="Lead salvo" />

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Card forte className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/15">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-emerald-300" fill="none" aria-hidden>
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold">{lead.nome}</h1>
          <p className="mt-1 text-white/50">{lead.empresa}</p>
          <p className="mt-3 text-sm text-white/40">
            Salvo no aparelho. A sincronização acontece em segundo plano.
          </p>
        </Card>

        {lead.agendou_reuniao && (
          <Card className="border-emerald-400/30 bg-emerald-400/[0.07]">
            <p className="text-sm font-medium text-emerald-100">Reunião marcada como agendada.</p>
          </Card>
        )}

        {/* `agendou_reuniao` segmenta as trilhas pos-evento, entao so vira true
            com confirmacao humana — abrir o link nao basta. */}
        {aguardandoConfirmacao && !lead.agendou_reuniao && (
          <Card className="space-y-3">
            <p className="text-sm text-white/70">
              O agendamento abriu em outra aba. O visitante escolheu um horário?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Botao variante="secundario" onClick={() => setAguardandoConfirmacao(false)}>
                Ainda não
              </Botao>
              <Botao onClick={() => void definirAgendamento(true)}>Sim, agendou</Botao>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {link ? (
            !lead.agendou_reuniao && (
              <Botao
                larguraTotal
                className="!min-h-[64px] !text-lg"
                onClick={() => {
                  window.open(link, '_blank', 'noopener,noreferrer')
                  setAguardandoConfirmacao(true)
                }}
              >
                {lead.agendamento_aberto ? 'Reabrir agendamento' : 'Agendar reunião agora'}
              </Botao>
            )
          ) : (
            <Card className="border-amber-400/30 bg-amber-400/[0.07]">
              <p className="text-sm text-amber-100">
                Link de agendamento não configurado. Preencha{' '}
                <code>VITE_LINK_AGENDAMENTO_ROUND_ROBIN</code> no .env ou{' '}
                <code>eventos.link_agendamento</code> no Supabase.
              </p>
            </Card>
          )}

          <Botao
            variante="secundario"
            larguraTotal
            className="!min-h-[56px]"
            onClick={() => navegar(`/captura/${lead.id}`, { replace: true })}
          >
            Completar dados internos
          </Botao>

          <Botao
            variante="fantasma"
            larguraTotal
            className="!min-h-[56px]"
            onClick={() => navegar('/', { replace: true })}
          >
            Concluir
          </Botao>
        </div>
      </main>
    </div>
  )
}
