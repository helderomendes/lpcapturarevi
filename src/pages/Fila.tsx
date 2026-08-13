import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '@/components/Header'
import { StatusPill } from '@/components/StatusPill'
import { Botao, Card } from '@/components/ui'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { aguardandoComplemento, listarNaoResolvidos } from '@/lib/db'
import { reenviar, resolverDuplicado } from '@/lib/sync'
import { formatarDataHora } from '@/lib/validacao'
import type { Lead, ResolucaoDuplicado } from '@/types'

export function Fila() {
  const { usuario } = useAuth()
  const { sincronizarAgora, sync, atualizar, online } = useApp()
  const [leads, setLeads] = useState<Lead[]>([])
  const [ocupado, setOcupado] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    if (!usuario) return
    setLeads(await listarNaoResolvidos(usuario.id))
  }, [usuario])

  useEffect(() => {
    void recarregar()
  }, [recarregar, sync.rodando])

  const agir = async (id: string, acao: () => Promise<unknown>) => {
    setOcupado(id)
    try {
      await acao()
      await atualizar()
      await recarregar()
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="min-h-full pb-16">
      <Header voltarPara="/" titulo="Fila de sincronização" />

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        <Botao
          larguraTotal
          carregando={sync.rodando}
          className="!min-h-[56px]"
          onClick={() => void sincronizarAgora()}
        >
          Sincronizar agora
        </Botao>

        {!online && (
          <Card className="border-amber-400/30 bg-amber-400/[0.07]">
            <p className="text-sm text-amber-100">
              Sem conexão. Os leads continuam salvos no aparelho e sobem sozinhos quando a
              rede voltar.
            </p>
          </Card>
        )}

        {leads.length === 0 ? (
          <Card>
            <p className="text-sm text-white/50">
              Nada na fila. Todos os leads foram enviados ao HubSpot.
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {leads.map((lead) => (
              <li key={lead.id}>
                <Card className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{lead.nome}</p>
                      <p className="truncate text-sm text-white/45">
                        {lead.empresa} · {formatarDataHora(lead.criado_em)}
                      </p>
                    </div>
                    <StatusPill status={lead.status_sync} />
                  </div>

                  {/* Aguardando complemento do BDR (veio do modo cliente). */}
                  {aguardandoComplemento(lead) && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-sm text-white/60">
                        Esperando você completar temperatura, plataforma e observações
                        antes de subir.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link to={`/captura/${lead.id}`}>
                          <Botao variante="secundario" className="!min-h-[44px] !py-2 !text-sm">
                            Completar agora
                          </Botao>
                        </Link>
                        <Botao
                          variante="fantasma"
                          className="!min-h-[44px] !py-2 !text-sm"
                          carregando={ocupado === lead.id}
                          onClick={() => void agir(lead.id, () => reenviar(lead.id))}
                        >
                          Enviar assim mesmo
                        </Botao>
                      </div>
                    </div>
                  )}

                  {/* Conflito de duplicata: a decisao e do humano, nunca automatica. */}
                  {lead.status_sync === 'duplicado' && (
                    <div className="rounded-xl border border-orange-400/30 bg-orange-400/[0.07] p-3">
                      <p className="text-sm text-orange-100">
                        Esse contato já existe no HubSpot
                        {lead.duplicado_owner_nome ? ` (dono: ${lead.duplicado_owner_nome})` : ''}.
                        Nada foi sobrescrito.
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <BotaoResolucao
                          rotulo="Anexar nota ao existente"
                          resolucao="anexar_nota"
                          leadId={lead.id}
                          ocupado={ocupado === lead.id}
                          aoAgir={agir}
                        />
                        <BotaoResolucao
                          rotulo="Criar mesmo assim"
                          resolucao="criar_assim_mesmo"
                          leadId={lead.id}
                          ocupado={ocupado === lead.id}
                          aoAgir={agir}
                        />
                      </div>
                    </div>
                  )}

                  {lead.erro_sync && lead.status_sync !== 'duplicado' && (
                    <div className="rounded-xl border border-red-400/30 bg-red-500/[0.07] p-3">
                      <p className="break-words text-sm text-red-100">{lead.erro_sync}</p>
                      {lead.tentativas > 0 && (
                        <p className="mt-1 text-xs text-red-200/60">
                          {lead.tentativas} tentativa{lead.tentativas > 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Link to={`/captura/${lead.id}`}>
                      <Botao variante="secundario" className="!min-h-[44px] !py-2 !text-sm">
                        Editar
                      </Botao>
                    </Link>
                    {lead.status_sync !== 'duplicado' && !aguardandoComplemento(lead) && (
                      <Botao
                        variante="secundario"
                        className="!min-h-[44px] !py-2 !text-sm"
                        carregando={ocupado === lead.id}
                        onClick={() => void agir(lead.id, () => reenviar(lead.id))}
                      >
                        Reenviar
                      </Botao>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <p className="px-1 text-xs text-white/30">
          Nenhum lead é apagado automaticamente. Os dados só saem do aparelho depois de
          confirmados no HubSpot — e mesmo assim ficam como histórico local.
        </p>
      </main>
    </div>
  )
}

function BotaoResolucao({
  rotulo,
  resolucao,
  leadId,
  ocupado,
  aoAgir,
}: {
  rotulo: string
  resolucao: ResolucaoDuplicado
  leadId: string
  ocupado: boolean
  aoAgir: (id: string, acao: () => Promise<unknown>) => Promise<void>
}) {
  return (
    <Botao
      variante="secundario"
      className="!min-h-[44px] !py-2 !text-sm"
      carregando={ocupado}
      onClick={() => void aoAgir(leadId, () => resolverDuplicado(leadId, resolucao))}
    >
      {rotulo}
    </Botao>
  )
}
