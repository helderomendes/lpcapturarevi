// =============================================================================
// Fila de sincronizacao.
//
// Principios:
//  - Nenhum lead e descartado. Nunca.
//  - Queda de rede nao gasta tentativa: o contador so avanca quando o servidor
//    de fato recusou o lead. Um Wi-Fi ruim de feira nao pode empurrar a fila
//    inteira para "erro".
//  - Reenvio e sempre seguro: o backend deduplica pelo UUID do dispositivo.
// =============================================================================

import { SYNC } from '@/config/app'
import {
  atualizarLead,
  listarProntosParaEnvio,
  obterLead,
} from '@/lib/db'
import { supabase, urlEdgeFunction } from '@/lib/supabase'
import type { Lead, ResolucaoDuplicado, RespostaSync } from '@/types'

export interface EstadoSync {
  rodando: boolean
  /** Mensagem efemera para o usuario: "3 leads enviados". */
  aviso: string | null
  /** True quando o backend recusou por sessao invalida e o login e necessario. */
  precisaLogin: boolean
}

let estado: EstadoSync = { rodando: false, aviso: null, precisaLogin: false }
const ouvintes = new Set<(estado: EstadoSync) => void>()

export function assinarSync(cb: (estado: EstadoSync) => void): () => void {
  ouvintes.add(cb)
  cb(estado)
  return () => ouvintes.delete(cb)
}

function definirEstado(patch: Partial<EstadoSync>) {
  estado = { ...estado, ...patch }
  ouvintes.forEach((cb) => cb(estado))
}

export function limparAviso() {
  if (estado.aviso) definirEstado({ aviso: null })
}

/** Erro de rede (offline, DNS, timeout) — nao e recusa do servidor. */
class ErroDeRede extends Error {}

/** Sessao ausente ou expirada. Nao gasta tentativa: exige login, nao retry. */
class ErroDeSessao extends Error {}

async function tokenDeAcesso(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ErroDeSessao('Sessão expirada. Faça login para sincronizar.')
  return token
}

function corpoDoLead(lead: Lead) {
  return {
    id: lead.id,
    evento_id: lead.evento_id,
    nome: lead.nome,
    telefone: lead.telefone,
    email: lead.email,
    empresa: lead.empresa,
    cargo: lead.cargo,
    site: lead.site,
    instagram: lead.instagram,
    plataforma_ecommerce: lead.plataforma_ecommerce,
    plataforma_outra: lead.plataforma_outra,
    temperatura: lead.temperatura,
    observacoes: lead.observacoes,
    consentimento_lgpd: lead.consentimento_lgpd,
    consentimento_em: lead.consentimento_em,
    agendou_reuniao: lead.agendou_reuniao,
    criado_em: lead.criado_em,
  }
}

async function chamarEdgeFunction(
  lead: Lead,
  resolucao?: ResolucaoDuplicado,
): Promise<RespostaSync> {
  const token = await tokenDeAcesso()

  let resposta: Response
  try {
    resposta = await fetch(urlEdgeFunction('sync-lead'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lead: corpoDoLead(lead), resolucao_duplicado: resolucao }),
    })
  } catch {
    throw new ErroDeRede('Sem conexão com o servidor')
  }

  let dados: RespostaSync
  try {
    dados = (await resposta.json()) as RespostaSync
  } catch {
    throw new Error(`Resposta inválida do servidor (HTTP ${resposta.status})`)
  }

  if (resposta.status === 401) throw new ErroDeSessao(dados.erro ?? 'Sessão inválida')
  if (!resposta.ok && dados.status !== 'duplicado') {
    throw new Error(dados.erro ?? `Falha no servidor (HTTP ${resposta.status})`)
  }

  return dados
}

/**
 * Envia um lead. Devolve o status resultante para quem quiser reagir na hora
 * (a tela de fila mostra o conflito de duplicata imediatamente).
 */
export async function enviarLead(
  leadId: string,
  resolucao?: ResolucaoDuplicado,
): Promise<'enviado' | 'duplicado' | 'erro' | 'adiado'> {
  const lead = await obterLead(leadId)
  if (!lead) return 'erro'

  // Uma resolucao de duplicata ja decidida pelo BDR precisa acompanhar TODAS as
  // tentativas seguintes. Sem isso, uma falha de rede logo apos a decisao faria
  // o retry automatico cair de novo no aviso de duplicata.
  const decisao = resolucao ?? lead.resolucao_duplicado ?? undefined

  try {
    const resposta = await chamarEdgeFunction(lead, decisao)

    if (resposta.status === 'duplicado') {
      await atualizarLead(lead.id, {
        status_sync: 'duplicado',
        duplicado_owner_nome: resposta.duplicado_owner_nome ?? null,
        hubspot_contact_id: resposta.hubspot_contact_id ?? null,
        erro_sync: null,
        proximo_retry_em: null,
      })
      return 'duplicado'
    }

    await atualizarLead(lead.id, {
      status_sync: 'enviado',
      hubspot_contact_id: resposta.hubspot_contact_id ?? lead.hubspot_contact_id,
      hubspot_company_id: resposta.hubspot_company_id ?? lead.hubspot_company_id,
      hubspot_deal_id: resposta.hubspot_deal_id ?? lead.hubspot_deal_id,
      resolucao_duplicado: decisao ?? null,
      erro_sync: null,
      tentativas: 0,
      proximo_retry_em: null,
      sincronizado_em: new Date().toISOString(),
    })
    return 'enviado'
  } catch (erro) {
    // Offline: o lead continua pendente, intacto, sem gastar tentativa.
    if (erro instanceof ErroDeRede) return 'adiado'

    if (erro instanceof ErroDeSessao) {
      definirEstado({ precisaLogin: true })
      await atualizarLead(lead.id, { erro_sync: erro.message })
      return 'adiado'
    }

    const tentativas = lead.tentativas + 1
    const estourou = tentativas >= SYNC.maxTentativas
    const espera = SYNC.backoffMs[Math.min(tentativas - 1, SYNC.backoffMs.length - 1)]

    await atualizarLead(lead.id, {
      tentativas,
      // Depois do maximo de tentativas o lead para e aguarda acao manual —
      // mas continua aqui, integro, esperando o botao de reenviar.
      status_sync: estourou ? 'erro' : 'pendente',
      erro_sync: erro instanceof Error ? erro.message : String(erro),
      proximo_retry_em: estourou ? null : Date.now() + espera,
    })
    return estourou ? 'erro' : 'adiado'
  }
}

let emExecucao = false

/**
 * Processa a fila inteira. Disparada por: retorno de conectividade, abertura do
 * app, timer de 60s e botao manual.
 */
export async function sincronizar(
  usuarioId: string,
  opcoes: { manual?: boolean } = {},
): Promise<{ enviados: number; erros: number }> {
  if (emExecucao) return { enviados: 0, erros: 0 }
  if (!navigator.onLine && !opcoes.manual) return { enviados: 0, erros: 0 }

  emExecucao = true
  definirEstado({ rodando: true, precisaLogin: false })

  let enviados = 0
  let erros = 0

  try {
    const fila = await listarProntosParaEnvio(usuarioId)
    for (const lead of fila) {
      const resultado = await enviarLead(lead.id)
      if (resultado === 'enviado') enviados++
      else if (resultado === 'erro') erros++
    }

    if (enviados > 0) {
      definirEstado({
        aviso: enviados === 1 ? '1 lead enviado' : `${enviados} leads enviados`,
      })
    } else if (opcoes.manual && fila.length === 0) {
      definirEstado({ aviso: 'Nada pendente para enviar' })
    }
  } finally {
    emExecucao = false
    definirEstado({ rodando: false })
  }

  return { enviados, erros }
}

/**
 * Reenvio manual. Zera o backoff e devolve o lead para a fila — util depois de
 * o BDR corrigir um dado ou de a rede voltar.
 */
export async function reenviar(leadId: string): Promise<void> {
  await atualizarLead(leadId, {
    status_sync: 'pendente',
    tentativas: 0,
    proximo_retry_em: null,
    erro_sync: null,
  })
  await enviarLead(leadId)
}

/** Resolucao humana do conflito de duplicata. Nunca automatica. */
export async function resolverDuplicado(
  leadId: string,
  resolucao: ResolucaoDuplicado,
): Promise<'enviado' | 'duplicado' | 'erro' | 'adiado'> {
  await atualizarLead(leadId, {
    resolucao_duplicado: resolucao,
    status_sync: 'pendente',
    tentativas: 0,
    proximo_retry_em: null,
    erro_sync: null,
  })
  return enviarLead(leadId, resolucao)
}
