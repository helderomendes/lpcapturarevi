// =============================================================================
// Operacoes do painel de admin.
//
// Tudo aqui exige rede. Diferente da captura, que e offline por principio, o
// painel e trabalho de escritorio: falhar com mensagem clara e melhor do que
// fingir que salvou.
//
// A excecao ao "papel admin" e `salvarMeuLinkAgendamento`, que qualquer usuario
// chama para a propria agenda. Vive aqui porque usa a mesma Edge Function e a
// mesma plumbing de sessao — duplicar isso em outro arquivo renderia duas
// copias do mesmo fetch.
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

const CAMPOS_USUARIO = 'id, nome, email, hubspot_owner_id, papel, ativo, link_agendamento'

export async function listarEquipe(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select(CAMPOS_USUARIO)
    .order('nome')
    .abortSignal(prazo())

  if (error) throw new Error(traduzir(error.message))
  return (data ?? []) as Usuario[]
}

/**
 * `app_users` nao tem policy de escrita, e isso e de proposito: um update de
 * `papel` liberado na API publica seria qualquer logado se promovendo a admin.
 * Toda mudanca de acesso passa pela Edge Function, que roda com service role,
 * confere o papel de quem chamou e protege o ultimo admin ativo.
 */
async function chamarAdminUsuarios<T>(corpo: unknown): Promise<T> {
  const token = await exigirSessao()

  let resposta: Response
  try {
    resposta = await fetch(urlEdgeFunction('admin-usuarios'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
  } catch {
    throw new Error('Sem conexão com o servidor.')
  }

  const resultado = await resposta.json().catch(() => null)
  if (!resposta.ok || resultado?.status !== 'ok') {
    throw new Error(resultado?.erro ?? `Falha no servidor (HTTP ${resposta.status})`)
  }
  return resultado as T
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
export function criarAcesso(dados: NovoAcesso): Promise<AcessoCriado> {
  return chamarAdminUsuarios<AcessoCriado>({ ...dados, acao: 'criar' })
}

/**
 * Edicao de quem ja existe. Somente os campos enviados mudam — omitir e
 * diferente de mandar vazio, que apaga (no caso do link) ou e recusado (nome).
 */
export interface EdicaoUsuario {
  id: string
  nome?: string
  email?: string
  papel?: Papel
  ativo?: boolean
  /** String vazia limpa o link e devolve a pessoa para o link do evento. */
  link_agendamento?: string | null
  /** Em branco nao troca a senha. */
  senha?: string
  /** Re-resolve o HubSpot owner ID pelo e-mail atual. */
  revincular?: boolean
}

export async function atualizarUsuario(dados: EdicaoUsuario): Promise<Usuario> {
  const resultado = await chamarAdminUsuarios<{ usuario: Usuario }>({
    ...dados,
    acao: 'atualizar',
  })
  return resultado.usuario
}

export function alternarUsuarioAtivo(id: string, ativo: boolean): Promise<Usuario> {
  return atualizarUsuario({ id, ativo })
}

// ---------------------------------------------------------------------------
// A propria agenda (qualquer usuario, sem papel admin)
// ---------------------------------------------------------------------------

/**
 * Salva o link de reuniao de quem esta logado. String vazia limpa o link e
 * devolve a pessoa para o link do evento.
 *
 * Quem e "quem esta logado" e decidido no servidor, pelo JWT — o id nao viaja
 * no corpo. Nao ha requisicao capaz de editar a agenda de outra pessoa.
 */
/**
 * O proprio registro, direto do servidor.
 *
 * A tela nao pode partir do cache: um cache gravado antes desta coluna existir
 * traria `link_agendamento` vazio, e salvar com o campo em branco APAGARIA o
 * link que esta no banco. A policy de leitura de `app_users` ja permite que
 * cada um leia a propria linha.
 */
export async function lerMeuPerfil(id: string): Promise<Usuario> {
  const { data, error } = await supabase
    .from('app_users')
    .select(CAMPOS_USUARIO)
    .eq('id', id)
    .abortSignal(prazo())
    .single()

  if (error) throw new Error(traduzir(error.message))
  return data as Usuario
}

export async function salvarMeuLinkAgendamento(link: string): Promise<Usuario> {
  const resultado = await chamarAdminUsuarios<{ usuario: Usuario }>({
    acao: 'meu_link',
    link_agendamento: link,
  })
  return resultado.usuario
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
