// =============================================================================
// Link de agendamento round-robin do HubSpot.
//
// A roleta de closers e configurada no HubSpot — a aplicacao nunca decide quem
// atende nem consulta disponibilidade pela API. Aqui so montamos a URL com os
// dados que a pessoa ja preencheu, para ela nao digitar nada de novo: escolhe
// o horario e pronto.
// =============================================================================

import { LINK_AGENDAMENTO_PADRAO } from '@/config/app'
import type { Evento, Usuario } from '@/types'

export interface DadosAgendamento {
  nome: string
  email: string
  empresa: string
  telefone: string
  site?: string | null
  cargo?: string | null
}

/** O BDR digita "loja.com.br"; o HubSpot espera URL. */
function normalizarSite(site?: string | null): string | null {
  const valor = (site ?? '').trim()
  if (!valor) return null
  return valor.startsWith('http') ? valor : `https://${valor}`
}

/**
 * Mesma lista que a Edge Function usa para nao criar uma empresa chamada
 * "gmail.com". Duplicada de proposito: o backend roda no Deno e nao importa de
 * `src/`, e uma lista de 19 dominios e mais barata de repetir do que de
 * compartilhar.
 */
const PROVEDORES_PESSOAIS = new Set([
  'gmail.com', 'hotmail.com', 'outlook.com', 'outlook.com.br', 'yahoo.com',
  'yahoo.com.br', 'icloud.com', 'live.com', 'bol.com.br', 'uol.com.br',
  'terra.com.br', 'globo.com', 'me.com', 'msn.com', 'protonmail.com',
  'proton.me', 'aol.com', 'zipmail.com.br', 'ig.com.br',
])

/**
 * Site da loja: o que o BDR digitou; na falta, o dominio do e-mail.
 *
 * O campo Site e o mais deixado em branco no estande — no meio da conversa,
 * ninguem para para perguntar a URL de quem acabou de dar o e-mail comercial.
 * E o e-mail comercial JA carrega o dominio, que e o mesmo caminho que a Edge
 * Function usa para achar a empresa no HubSpot. Sem isso, o formulario de
 * reuniao abria com o campo de site vazio tendo o dado na mao.
 *
 * Provedor pessoal fica de fora: `@gmail.com` nao e o site de ninguem.
 */
function siteProvavel(dados: DadosAgendamento): string | null {
  const informado = normalizarSite(dados.site)
  if (informado) return informado

  const dominio = (dados.email ?? '').split('@')[1]?.toLowerCase().trim()
  if (dominio && dominio.includes('.') && !PROVEDORES_PESSOAIS.has(dominio)) {
    return `https://${dominio}`
  }
  return null
}

/**
 * Do mais especifico para o mais generico:
 *   1. agenda de quem captou   (`app_users.link_agendamento`)
 *   2. escala da feira         (`eventos.link_agendamento`)
 *   3. revezamento padrao      (`VITE_LINK_AGENDAMENTO_ROUND_ROBIN`)
 *
 * A pessoa vence o evento porque quem conversou no estande e quem deve receber
 * a reuniao. Quem nao tem agenda propria cadastrada cai na escala da feira.
 *
 * Compara com `||` e nao com `??`: link salvo como string vazia ou com espaco
 * e link nao configurado, e teria vencido o proximo da fila.
 */
export function baseDoAgendamento(evento: Evento | null, usuario?: Usuario | null): string {
  return (
    usuario?.link_agendamento?.trim() ||
    evento?.link_agendamento?.trim() ||
    LINK_AGENDAMENTO_PADRAO
  ).trim()
}

export function montarLinkAgendamento(
  dados: DadosAgendamento,
  base: string,
  evento?: Evento | null,
): string | null {
  if (!base) return null

  let url: URL
  try {
    url = new URL(base)
  } catch {
    return null
  }

  const partes = dados.nome.trim().split(/\s+/)
  url.searchParams.set('firstname', partes[0] ?? '')
  url.searchParams.set('lastname', partes.slice(1).join(' '))
  url.searchParams.set('email', dados.email.trim().toLowerCase())
  url.searchParams.set('company', dados.empresa.trim())
  url.searchParams.set('phone', dados.telefone.trim())

  // O HubSpot preenche um campo do formulario de reuniao pelo nome interno da
  // property (`website`, `jobtitle`). Se o formulario daquele link NAO tiver o
  // campo, o parametro e simplesmente ignorado pelo HubSpot — sem erro e sem
  // aviso. Mandar nao custa nada; faltar custa o visitante digitar.
  const site = siteProvavel(dados)
  if (site) url.searchParams.set('website', site)
  if (dados.cargo?.trim()) url.searchParams.set('jobtitle', dados.cargo.trim())

  // Atribuicao: a reuniao agendada no estande fica rastreavel ate o evento.
  if (evento) {
    url.searchParams.set('utm_source', 'captura-eventos')
    url.searchParams.set('utm_medium', 'evento-presencial')
    url.searchParams.set('utm_campaign', evento.valor_detalhamento_origem)
  }

  return url.toString()
}
