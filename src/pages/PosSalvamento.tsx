import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header } from '@/components/Header'
import { Botao, Card } from '@/components/ui'
import { LINK_AGENDAMENTO_PADRAO } from '@/config/app'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { atualizarLead, obterLead } from '@/lib/db'
import { sincronizar } from '@/lib/sync'
import type { Lead } from '@/types'

/**
 * Monta o link de roteamento round-robin do HubSpot com os dados ja
 * preenchidos. O visitante so escolhe o horario.
 *
 * A roleta de closers e configurada no HubSpot — a aplicacao nunca decide quem
 * atende, nem consulta disponibilidade pela API.
 */
function montarLinkAgendamento(lead: Lead, base: string): string {
  const partes = lead.nome.trim().split(/\s+/)
  const url = new URL(base)
  url.searchParams.set('firstname', partes[0] ?? '')
  url.searchParams.set('lastname', partes.slice(1).join(' '))
  url.searchParams.set('email', lead.email)
  url.searchParams.set('company', lead.empresa)
  url.searchParams.set('phone', lead.telefone)
  return url.toString()
}

export function PosSalvamento() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const { usuario } = useAuth()
  const { evento, atualizar } = useApp()
  const [lead, setLead] = useState<Lead | null>(null)
  const [abriuAgendamento, setAbriuAgendamento] = useState(false)

  useEffect(() => {
    if (!id) return
    void obterLead(id).then((encontrado) => {
      if (!encontrado) navegar('/', { replace: true })
      else setLead(encontrado)
    })
  }, [id, navegar])

  if (!lead) return null

  const base = (evento?.link_agendamento ?? LINK_AGENDAMENTO_PADRAO).trim()
  let link: string | null = null
  if (base) {
    try {
      link = montarLinkAgendamento(lead, base)
    } catch {
      link = null
    }
  }

  const marcarAgendado = async () => {
    await atualizarLead(lead.id, { agendou_reuniao: true })
    setLead({ ...lead, agendou_reuniao: true })
    await atualizar()
    // Se o lead ja subiu, a flag local nao volta ao HubSpot — o agendamento em
    // si ja registra a reuniao la. A flag serve para segmentar as trilhas
    // pos-evento a partir do Supabase.
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

        <div className="space-y-3">
          {link ? (
            <>
              <Botao
                larguraTotal
                className="!min-h-[64px] !text-lg"
                onClick={() => {
                  window.open(link!, '_blank', 'noopener,noreferrer')
                  setAbriuAgendamento(true)
                }}
              >
                Agendar reunião agora
              </Botao>

              {/* Caminho de volta explicito: a aba do HubSpot fica aberta ao lado. */}
              {abriuAgendamento && !lead.agendou_reuniao && (
                <Card className="space-y-3">
                  <p className="text-sm text-white/70">
                    O visitante concluiu o agendamento na outra aba?
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Botao variante="secundario" onClick={() => setAbriuAgendamento(false)}>
                      Ainda não
                    </Botao>
                    <Botao onClick={() => void marcarAgendado()}>Sim, agendou</Botao>
                  </div>
                </Card>
              )}
            </>
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
