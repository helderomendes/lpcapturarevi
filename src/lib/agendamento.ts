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
  site?: string | null
  cargo?: string | null
}

/** O BDR digita "loja.com.br"; o HubSpot espera URL. */
function normalizarSite(site?: string | null): string | null {
  const valor = (site ?? '').trim()
  if (!valor) return null
  return valor.startsWith('http') ? valor : `https://${valor}`
}

/** "(47) 99999-9999" -> "+5547999999999". Numero que ja vem com DDI e mantido. */
function telefoneInternacional(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, '')
  if (!digitos) return null
  if (telefone.trim().startsWith('+')) return `+${digitos}`
  // 10 ou 11 digitos = DDD + numero brasileiro, formato da mascara da captura.
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`
  return `+${digitos}`
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

  // O formulario de reuniao do HubSpot pre-preenche cada campo pelo nome
  // interno da property, e parametro que nao corresponde a nenhum campo e
  // simplesmente ignorado. Como nao controlamos quais properties o formulario
  // do link usa (e o portal tem mais de uma para o mesmo dado: `website` e
  // `site`, `phone`, `mobilephone` e as de WhatsApp), mandamos o mesmo valor
  // em todos os nomes possiveis. Sobrar parametro nao custa nada; faltar
  // custa o visitante digitar de novo.
  const definir = (nomes: string[], valor: string | null | undefined) => {
    const limpo = (valor ?? '').trim()
    if (!limpo) return
    for (const nome of nomes) url.searchParams.set(nome, limpo)
  }

  const partes = dados.nome.trim().split(/\s+/).filter(Boolean)
  // A documentacao do HubSpot usa camelCase (`firstName`); o nome interno da
  // property e minusculo. Os dois vao, para funcionar em qualquer versao.
  definir(['firstName', 'firstname'], partes[0])
  definir(['lastName', 'lastname'], partes.slice(1).join(' '))
  definir(['email'], dados.email.toLowerCase())
  definir(['company'], dados.empresa)
  definir(['website', 'site'], normalizarSite(dados.site))
  definir(['jobtitle'], dados.cargo)

  // O campo de telefone do HubSpot tem seletor de pais e espera o numero em
  // formato internacional; com a mascara "(47) 99999-9999" ele pode descartar
  // o valor pre-preenchido sem avisar.
  definir(
    ['phone', 'mobilephone', 'hs_whatsapp_phone_number', 'nmero_do_whatsapp'],
    telefoneInternacional(dados.telefone),
  )

  // Atribuicao: a reuniao agendada no estande fica rastreavel ate o evento.
  url.searchParams.set('utm_source', 'captura-eventos')
  url.searchParams.set('utm_medium', 'evento-presencial')
  if (evento?.valor_detalhamento_origem) {
    url.searchParams.set('utm_campaign', evento.valor_detalhamento_origem)
  }

  return url.toString()
}
