// =============================================================================
// Edge Function `admin-eventos`
//
// Garante que o evento exista como opcao do dropdown "Detalhamento de Origem do
// Negocio" no HubSpot. Sem a opcao, o sync-lead nao consegue gravar o dropdown
// e o negocio nasce com o campo vazio (so o texto livre guarda o nome).
//
// Uma acao so: `garantir_opcao`, recebe `valor`. Somente admin.
//
// Resultados (HTTP 200, sempre com `status: 'ok'` quando a verificacao rodou):
//   `ja_existia` — ha opcao com exatamente esse valor. Nada muda.
//   `criada`     — a opcao nao existia e foi adicionada ao dropdown.
//   `parecida`   — ha opcao que so difere em maiuscula, espaco ou acento
//                  (ex.: "BFSHOW2026" x "BFSHOW 2026"). NAO cria: duplicaria a
//                  opcao e racharia os relatorios. Devolve o valor existente.
//
// Nao existe versao sem permissao: se o token do HubSpot nao puder editar
// propriedades de negocio, a funcao responde erro explicando o escopo, e o app
// segue salvando o evento normalmente.
//
// Atencao: a API do HubSpot troca a lista de opcoes inteira, nao acrescenta.
// Por isso a funcao le a propriedade de novo logo antes de gravar e reenvia
// todas as opcoes existentes, sem mexer em nenhuma.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders, json } from './lib/cors.ts'

interface Opcao {
  label: string
  value: string
  displayOrder?: number
  hidden?: boolean
  description?: string
}

interface Propriedade {
  name: string
  type: string
  options?: Opcao[]
}

const TAMANHO_MAXIMO = 200

/** Compara sem ligar para maiuscula, acento ou espaco: "BFSHOW 2026" ~ "bfshow2026". */
function chave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ status: 'erro', erro: 'Metodo nao suportado' }, 405)

  const url = (Deno.env.get('SUPABASE_URL') ?? '').trim()
  const serviceRole = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  const hubspotToken = (Deno.env.get('HUBSPOT_TOKEN') ?? '').trim()
  const baseUrl = (Deno.env.get('HUBSPOT_BASE_URL') ?? 'https://api.hubapi.com').trim()
  const propriedade = (
    Deno.env.get('HUBSPOT_PROPERTY_DETALHAMENTO_ORIGEM_NEGOCIO') ?? 'detalhamento_de_origem_do_negocio'
  ).trim()

  const faltando = [
    !url && 'SUPABASE_URL',
    !serviceRole && 'SUPABASE_SERVICE_ROLE_KEY',
    !hubspotToken && 'HUBSPOT_TOKEN',
  ].filter(Boolean)
  if (faltando.length > 0) {
    console.error('[admin-eventos] configuracao incompleta', faltando)
    return json(
      { status: 'erro', erro: `Configuracao incompleta no servidor: ${faltando.join(', ')}` },
      500,
    )
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ status: 'erro', erro: 'Token ausente' }, 401)

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // --- 1. Quem esta chamando: so admin ativo -------------------------------
  const { data: auth, error: erroAuth } = await admin.auth.getUser(token)
  if (erroAuth || !auth?.user) {
    return json({ status: 'erro', erro: 'Sessao invalida ou expirada' }, 401)
  }

  const { data: solicitante, error: erroSolicitante } = await admin
    .from('app_users')
    .select('papel, ativo')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (erroSolicitante) {
    console.error('[admin-eventos] falha ao ler app_users', erroSolicitante.message)
    return json({ status: 'erro', erro: 'Falha ao verificar permissao' }, 500)
  }
  if (!solicitante?.ativo || solicitante.papel !== 'admin') {
    return json({ status: 'erro', erro: 'Somente admin pode alterar o HubSpot' }, 403)
  }

  // --- 2. Entrada -----------------------------------------------------------
  let valor = ''
  try {
    const corpo = await req.json()
    if (corpo?.acao !== 'garantir_opcao') {
      return json({ status: 'erro', erro: 'Acao desconhecida' }, 400)
    }
    valor = typeof corpo.valor === 'string' ? corpo.valor.trim() : ''
  } catch {
    return json({ status: 'erro', erro: 'Corpo invalido' }, 400)
  }
  if (!valor) return json({ status: 'erro', erro: 'Informe o valor do evento' }, 400)
  if (valor.length > TAMANHO_MAXIMO) {
    return json({ status: 'erro', erro: 'Valor longo demais para o HubSpot' }, 400)
  }

  // --- 3. HubSpot -----------------------------------------------------------
  const caminho = `${baseUrl}/crm/v3/properties/deals/${encodeURIComponent(propriedade)}`
  const chamar = (metodo: string, corpo?: unknown) =>
    fetch(caminho, {
      method: metodo,
      headers: { Authorization: `Bearer ${hubspotToken}`, 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })

  const falhaHubSpot = async (resposta: Response, acao: string) => {
    const texto = (await resposta.text()).slice(0, 400)
    console.error(`[admin-eventos] HubSpot ${acao} respondeu ${resposta.status}`, texto)
    if (resposta.status === 401 || resposta.status === 403) {
      return json(
        {
          status: 'erro',
          erro:
            'O token do HubSpot nao tem permissao para editar propriedades de negocio ' +
            '(escopo crm.schemas.deals.write). Adicione a opcao manualmente em ' +
            'Configuracoes > Propriedades > Negocio.',
        },
        502,
      )
    }
    return json({ status: 'erro', erro: `HubSpot recusou (${resposta.status}) ao ${acao}` }, 502)
  }

  const ler = async (): Promise<Propriedade | Response> => {
    const resposta = await chamar('GET')
    if (!resposta.ok) return falhaHubSpot(resposta, 'ler a propriedade')
    return (await resposta.json()) as Propriedade
  }

  const atual = await ler()
  if (atual instanceof Response) return atual
  if (atual.type !== 'enumeration') {
    return json(
      { status: 'erro', erro: `A propriedade ${propriedade} nao e um dropdown no HubSpot` },
      502,
    )
  }

  const achar = (opcoes: Opcao[]) => {
    const exata = opcoes.find((o) => o.value === valor)
    if (exata) return { tipo: 'ja_existia' as const, opcao: exata }
    const parecida = opcoes.find((o) => chave(o.value) === chave(valor))
    if (parecida) return { tipo: 'parecida' as const, opcao: parecida }
    return null
  }

  const resposta = (tipo: string, opcao?: Opcao) =>
    json({ status: 'ok', resultado: tipo, valor: opcao?.value ?? valor })

  const existente = achar(atual.options ?? [])
  if (existente) return resposta(existente.tipo, existente.opcao)

  // Releitura imediata: encurta a janela em que outra edicao poderia ser pisada.
  const recente = await ler()
  if (recente instanceof Response) return recente
  const opcoes = recente.options ?? []
  const apareceu = achar(opcoes)
  if (apareceu) return resposta(apareceu.tipo, apareceu.opcao)

  const proximaOrdem = opcoes.reduce((max, o) => Math.max(max, o.displayOrder ?? 0), 0) + 1
  const gravada = await chamar('PATCH', {
    options: [
      ...opcoes,
      { label: valor, value: valor, displayOrder: proximaOrdem, hidden: false },
    ],
  })
  if (!gravada.ok) return falhaHubSpot(gravada, 'criar a opcao')

  console.log('[admin-eventos] opcao criada', valor)
  return resposta('criada')
})
