// =============================================================================
// Cliente minimo da API v3/v4 do HubSpot.
//
// Roda exclusivamente dentro da Edge Function — o token nunca sai daqui.
// =============================================================================

import { config } from './config.ts'

export class HubSpotError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly corpo: string,
  ) {
    super(message)
    this.name = 'HubSpotError'
  }
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504])

async function request<T>(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  tentativa = 1,
): Promise<T> {
  const resposta = await fetch(`${config.hubspot.baseUrl}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${config.hubspot.token}`,
      'Content-Type': 'application/json',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })

  if (resposta.ok) {
    if (resposta.status === 204) return undefined as T
    const texto = await resposta.text()
    return (texto ? JSON.parse(texto) : undefined) as T
  }

  const texto = await resposta.text()

  // Rate limit e instabilidade momentanea: 2 retentativas curtas aqui dentro.
  // Falhas alem disso voltam para a fila do dispositivo, que tem backoff longo.
  if (RETRY_STATUS.has(resposta.status) && tentativa < 3) {
    await new Promise((r) => setTimeout(r, 400 * tentativa))
    return request<T>(metodo, caminho, corpo, tentativa + 1)
  }

  throw new HubSpotError(
    `HubSpot ${metodo} ${caminho} respondeu ${resposta.status}`,
    resposta.status,
    texto.slice(0, 600),
  )
}

type Registro = { id: string; properties: Record<string, string | null> }
type RespostaBusca = { total: number; results: Registro[] }

// ---------------------------------------------------------------------------
// Buscas
// ---------------------------------------------------------------------------

export function buscarContatoPorEmail(email: string): Promise<RespostaBusca> {
  return request<RespostaBusca>('POST', '/crm/v3/objects/contacts/search', {
    filterGroups: [
      { filters: [{ propertyName: 'email', operator: 'EQ', value: email.toLowerCase() }] },
    ],
    properties: ['email', 'firstname', 'lastname', 'hubspot_owner_id'],
    limit: 1,
  })
}

export function buscarEmpresaPorDominio(dominio: string): Promise<RespostaBusca> {
  // Traz site e Instagram tambem: se a empresa ja existir com esses campos
  // vazios, a gente completa — e precisa saber que estao vazios para nao
  // sobrescrever o que alguem preencheu a mao.
  const properties = ['name', 'domain', 'website']
  if (config.hubspot.propertyInstagramEmpresa) {
    properties.push(config.hubspot.propertyInstagramEmpresa)
  }

  return request<RespostaBusca>('POST', '/crm/v3/objects/companies/search', {
    filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: dominio }] }],
    properties,
    limit: 1,
  })
}

/** Segunda barreira de idempotencia: procura o negocio pelo UUID de captura. */
export function buscarNegocioPorIdCaptura(idCaptura: string): Promise<RespostaBusca> {
  const propriedade = config.hubspot.propertyIdCaptura
  if (!propriedade) return Promise.resolve({ total: 0, results: [] })

  return request<RespostaBusca>('POST', '/crm/v3/objects/deals/search', {
    filterGroups: [{ filters: [{ propertyName: propriedade, operator: 'EQ', value: idCaptura }] }],
    properties: ['dealname', propriedade],
    limit: 1,
  })
}

export async function nomeDoProprietario(ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null
  try {
    const owner = await request<{ firstName?: string; lastName?: string; email?: string }>(
      'GET',
      `/crm/v3/owners/${ownerId}`,
    )
    const nome = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim()
    return nome || owner.email || null
  } catch {
    // Nao vale derrubar a sincronizacao so porque o nome do dono nao veio.
    return null
  }
}

// ---------------------------------------------------------------------------
// Criacao
// ---------------------------------------------------------------------------

type Props = Record<string, string>

export function criarContato(properties: Props): Promise<Registro> {
  return request<Registro>('POST', '/crm/v3/objects/contacts', { properties })
}

export function criarEmpresa(properties: Props): Promise<Registro> {
  return request<Registro>('POST', '/crm/v3/objects/companies', { properties })
}

/** Usado somente para completar campos vazios de uma empresa que ja existia. */
export function atualizarEmpresa(id: string, properties: Props): Promise<Registro> {
  return request<Registro>('PATCH', `/crm/v3/objects/companies/${id}`, { properties })
}

export function criarNegocio(properties: Props): Promise<Registro> {
  return request<Registro>('POST', '/crm/v3/objects/deals', { properties })
}

export function criarNota(corpoHtml: string, quando: string): Promise<Registro> {
  return request<Registro>('POST', '/crm/v3/objects/notes', {
    properties: { hs_timestamp: quando, hs_note_body: corpoHtml },
  })
}

/**
 * Associa dois objetos usando o tipo padrao da v4. Evita depender de typeIds
 * numericos, que variam por portal e sao facilmente quebrados.
 */
export async function associar(
  tipoOrigem: string,
  idOrigem: string,
  tipoDestino: string,
  idDestino: string,
): Promise<void> {
  await request(
    'PUT',
    `/crm/v4/objects/${tipoOrigem}/${idOrigem}/associations/default/${tipoDestino}/${idDestino}`,
  )
}
