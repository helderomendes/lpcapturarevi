// =============================================================================
// Empresa derivada do site.
//
// A captura nao pergunta mais o nome da empresa: no estande, o visitante diz o
// site da loja, e o nome sai dele. O dominio tambem e a chave com que a Edge
// Function acha empresa ja existente no HubSpot — e nesse caso o nome que ja
// esta la e mantido, entao o nome daqui so vale para empresa nova.
// =============================================================================

/**
 * Mesma lista que a Edge Function usa para nao criar uma empresa chamada
 * "gmail.com". Duplicada de proposito: o backend roda no Deno e nao importa de
 * `src/`, e uma lista de 19 dominios e mais barata de repetir do que de
 * compartilhar.
 */
export const PROVEDORES_PESSOAIS = new Set([
  'gmail.com', 'hotmail.com', 'outlook.com', 'outlook.com.br', 'yahoo.com',
  'yahoo.com.br', 'icloud.com', 'live.com', 'bol.com.br', 'uol.com.br',
  'terra.com.br', 'globo.com', 'me.com', 'msn.com', 'protonmail.com',
  'proton.me', 'aol.com', 'zipmail.com.br', 'ig.com.br',
])

/** "https://www.Loja.com.br/produtos" -> "loja.com.br". Null se nao parecer site. */
export function dominioDoSite(site?: string | null): string | null {
  const valor = (site ?? '').trim()
  if (!valor) return null
  try {
    const url = new URL(valor.startsWith('http') ? valor : `https://${valor}`)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) ? host : null
  } catch {
    return null
  }
}

/** Dominio do e-mail, desde que comercial: `@gmail.com` nao e o site de ninguem. */
export function dominioDoEmail(email?: string | null): string | null {
  const dominio = (email ?? '').split('@')[1]?.toLowerCase().trim()
  if (!dominio || !dominio.includes('.') || PROVEDORES_PESSOAIS.has(dominio)) return null
  return dominio
}

/** Site informado; na falta, o dominio do e-mail comercial. Mesma regra do backend. */
export function dominioDaEmpresa(site?: string | null, email?: string | null): string | null {
  return dominioDoSite(site) ?? dominioDoEmail(email)
}

/** Sufixos de segundo nivel: em "loja.com.br", a marca e "loja", nao "com". */
const SEGUNDO_NIVEL = new Set(['com', 'net', 'org', 'ind', 'art', 'eco', 'app', 'tec', 'shop', 'co'])

/**
 * Plataformas que hospedam a loja num subdominio: em "marca.myshopify.com" a
 * marca e o subdominio, nao a plataforma.
 */
const HOSPEDAGENS = [
  'myshopify.com',
  'lojaintegrada.com.br',
  'nuvemshop.com.br',
  'mitiendanube.com',
  'tray.com.br',
  'wixsite.com',
  'vtexcommercestable.com.br',
  'myvtex.com',
  'yampi.com.br',
]

/** "loja-da-maria.com.br" -> "Loja Da Maria". */
export function nomeDaEmpresa(dominio: string): string {
  const hospedagem = HOSPEDAGENS.find((h) => dominio.endsWith(`.${h}`))
  let marca: string
  if (hospedagem) {
    marca = dominio.slice(0, -(hospedagem.length + 1)).split('.').pop() ?? dominio
  } else {
    const partes = dominio.split('.')
    const corte =
      partes.length >= 3 && partes[partes.length - 1].length === 2 &&
      SEGUNDO_NIVEL.has(partes[partes.length - 2])
        ? 2
        : 1
    marca = partes[partes.length - 1 - corte] ?? dominio
  }
  return marca
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}
