// =============================================================================
// Link de agendamento round-robin do HubSpot.
//
// A roleta de closers e configurada no HubSpot — a aplicacao nunca decide quem
// atende nem consulta disponibilidade pela API. Aqui so montamos a URL com os
// dados que a pessoa ja preencheu, para ela nao digitar nada de novo: escolhe
// o horario e pronto.
// =============================================================================

import { LINK_AGENDAMENTO_PADRAO } from '@/config/app'
import type { Evento } from '@/types'

export interface DadosAgendamento {
  nome: string
  email: string
  empresa: string
  telefone: string
}

/** Link do evento quando houver; senao o padrao do .env. */
export function baseDoAgendamento(evento: Evento | null): string {
  return (evento?.link_agendamento ?? LINK_AGENDAMENTO_PADRAO).trim()
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

  // Atribuicao: a reuniao agendada no estande fica rastreavel ate o evento.
  if (evento) {
    url.searchParams.set('utm_source', 'captura-eventos')
    url.searchParams.set('utm_medium', 'evento-presencial')
    url.searchParams.set('utm_campaign', evento.valor_detalhamento_origem)
  }

  return url.toString()
}
