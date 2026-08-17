// =============================================================================
// Resolve o HubSpot owner ID a partir do e-mail.
//
// E o que elimina o passo manual: o admin digita o e-mail da pessoa e o vinculo
// com o HubSpot sai daqui, sem ninguem caçar ID em tela nenhuma.
// =============================================================================

const BASE = (Deno.env.get('HUBSPOT_BASE_URL') ?? 'https://api.hubapi.com').trim()
const TOKEN = (Deno.env.get('HUBSPOT_TOKEN') ?? '').trim()

export interface Owner {
  id: string
  nome: string
  ativo: boolean
}

interface OwnerApi {
  id: string
  email?: string
  firstName?: string
  lastName?: string
  archived?: boolean
}

async function chamar(caminho: string): Promise<{ results?: OwnerApi[]; paging?: { next?: { after?: string } } }> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  })
  if (!resposta.ok) {
    const corpo = (await resposta.text()).slice(0, 400)
    throw new Error(`HubSpot ${resposta.status} em ${caminho}: ${corpo}`)
  }
  return await resposta.json()
}

function montar(owner: OwnerApi): Owner {
  const nome = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim()
  return {
    id: String(owner.id),
    nome: nome || owner.email || String(owner.id),
    ativo: owner.archived !== true,
  }
}

/**
 * Busca por e-mail. Tenta o filtro nativo primeiro e, se ele nao devolver nada,
 * pagina a lista completa e compara no cliente — assim uma mudanca de contrato
 * no parametro `email` nao vira um "nao encontrei" errado na cara do admin.
 */
export async function ownerPorEmail(email: string): Promise<Owner | null> {
  const alvo = email.trim().toLowerCase()

  try {
    const direto = await chamar(`/crm/v3/owners/?email=${encodeURIComponent(alvo)}&limit=1`)
    const achado = direto.results?.[0]
    if (achado) return montar(achado)
  } catch {
    // cai para a varredura
  }

  let after: string | undefined
  for (let pagina = 0; pagina < 20; pagina++) {
    const query = `/crm/v3/owners/?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`
    const lote = await chamar(query)
    const achado = lote.results?.find((o) => (o.email ?? '').toLowerCase() === alvo)
    if (achado) return montar(achado)

    after = lote.paging?.next?.after
    if (!after) break
  }

  return null
}
