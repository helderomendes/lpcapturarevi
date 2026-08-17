// =============================================================================
// Operacoes do painel de admin.
//
// Tudo aqui exige rede e papel `admin`. Diferente da captura, que e offline por
// principio, o painel e trabalho de escritorio: falhar com mensagem clara e
// melhor do que fingir que salvou.
// =============================================================================

import { supabase, urlEdgeFunction } from '@/lib/supabase'
import type { Evento, Papel, StatusSync, Usuario } from '@/types'

/** Lead como o admin ve: com quem captou e em qual evento, ja resolvidos. */
export interface LeadAdmin {
  id: string
  nome: string
  empresa: string
  email: string
  telefone: string
  status_sync: StatusSync
  erro_sync: string | null
  agendou_reuniao: boolean
  consentimento_lgpd: boolean
  plataforma_ecommerce: string | null
  hubspot_deal_id: string | null
  criado_em: string
  sincronizado_em: string | null
  capturado_por_nome: string
  evento_nome: string
}

/**
 * Toda consulta do painel morre sozinha se a rede pendurar. Sem isso, o painel
 * fica num spinner eterno — que e a mesma falha de uma tela em branco: o usuario
 * nao sabe se esta carregando ou quebrado.
 */
const LIMITE_MS = 12_000
const prazo = () => AbortSignal.timeout(LIMITE_MS)

async function exigirSessao(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')
  return token
}

// ---------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------

export async function listarEquipe(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, nome, email, hubspot_owner_id, papel, ativo')
    .order('nome')
    .abortSignal(prazo())

  if (error) throw new Error(traduzir(error.message))
  return (data ?? []) as Usuario[]
}

export interface NovoAcesso {
  email: string
  nome: string
  senha: string
  papel: Papel
}

export interface AcessoCriado {
  criou: boolean
  email: string
  nome: string
  papel: Papel
  hubspot_owner_id: string
  nome_hubspot: string
}

/**
 * Cria (ou reatribui a senha de) um acesso e amarra ao owner do HubSpot. Toda a
 * parte sensivel roda na Edge Function — o front nunca ve service role.
 */
export async function criarAcesso(dados: NovoAcesso): Promise<AcessoCriado> {
  const token = await exigirSessao()

  let resposta: Response
  try {
    resposta = await fetch(urlEdgeFunction('admin-usuarios'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    })
  } catch {
    throw new Error('Sem conexão com o servidor.')
  }

  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok || corpo?.status !== 'ok') {
    throw new Error(corpo?.erro ?? `Falha no servidor (HTTP ${resposta.status})`)
  }
  return corpo as AcessoCriado
}

export async function alternarUsuarioAtivo(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('app_users').update({ ativo }).eq('id', id)
  if (error) throw new Error(traduzir(error.message))
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

const CAMPOS_EVENTO =
  'id, nome, valor_detalhamento_origem, valor_canal, link_agendamento, data_inicio, data_fim, ativo'

export async function listarTodosOsEventos(): Promise<Evento[]> {
  const { data, error } = await supabase
    .from('eventos')
    .select(CAMPOS_EVENTO)
    .order('data_inicio', { ascending: false })
    .abortSignal(prazo())

  if (error) throw new Error(traduzir(error.message))
  return (data ?? []) as Evento[]
}

export interface NovoEvento {
  nome: string
  valor_detalhamento_origem: string
  data_inicio: string
  data_fim: string
  link_agendamento: string | null
}

export async function criarEvento(dados: NovoEvento): Promise<Evento> {
  const { data, error } = await supabase
    .from('eventos')
    .insert({ ...dados, ativo: true })
    .select(CAMPOS_EVENTO)
    .single()

  if (error) throw new Error(traduzir(error.message))
  return data as Evento
}

export async function alternarEventoAtivo(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('eventos').update({ ativo }).eq('id', id)
  if (error) throw new Error(traduzir(error.message))
}

// ---------------------------------------------------------------------------
// Leads de todos
// ---------------------------------------------------------------------------

/**
 * Junta em memoria em vez de pedir embed ao PostgREST: equipe e eventos sao
 * listas pequenas, e assim a tela nao quebra se um nome de foreign key mudar.
 */
export async function listarTodosOsLeads(): Promise<LeadAdmin[]> {
  const [leads, equipe, eventos] = await Promise.all([
    supabase
      .from('leads')
      .select(
        'id, nome, empresa, email, telefone, status_sync, erro_sync, agendou_reuniao, consentimento_lgpd, plataforma_ecommerce, hubspot_deal_id, criado_em, sincronizado_em, capturado_por, evento_id',
      )
      .order('criado_em', { ascending: false })
      .limit(1000)
      .abortSignal(prazo()),
    listarEquipe(),
    listarTodosOsEventos(),
  ])

  if (leads.error) throw new Error(traduzir(leads.error.message))

  const nomePorUsuario = new Map(equipe.map((u) => [u.id, u.nome]))
  const nomePorEvento = new Map(eventos.map((e) => [e.id, e.nome]))

  return (leads.data ?? []).map((l) => ({
    ...(l as Omit<LeadAdmin, 'capturado_por_nome' | 'evento_nome'>),
    capturado_por_nome: nomePorUsuario.get((l as { capturado_por: string }).capturado_por) ?? '—',
    evento_nome: nomePorEvento.get((l as { evento_id: string }).evento_id) ?? '—',
  }))
}

// ---------------------------------------------------------------------------

function traduzir(mensagem: string): string {
  if (/row-level security|permission denied/i.test(mensagem)) {
    return 'Sem permissão para esta ação. Confirme que seu usuário é admin.'
  }
  if (/abort|timeout|timed out|signal/i.test(mensagem)) {
    return 'O servidor não respondeu. Confira a conexão e tente atualizar.'
  }
  if (/failed to fetch|network/i.test(mensagem)) {
    return 'Sem conexão. O painel precisa de rede.'
  }
  if (/duplicate key|already exists/i.test(mensagem)) return 'Esse registro já existe.'
  return mensagem
}
