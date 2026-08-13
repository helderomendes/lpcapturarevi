// =============================================================================
// Persistencia local (IndexedDB via Dexie).
//
// Todo lead nasce aqui, sempre — mesmo com rede perfeita. Um unico caminho de
// gravacao significa que nao existe codigo raro que so roda quando o Wi-Fi do
// evento cai.
//
// O IndexedDB nunca e limpo automaticamente.
// =============================================================================

import Dexie, { type Table } from 'dexie'
import { LIBERAR_AGUARDANDO_APOS_MS } from '@/config/app'
import type { Evento, Lead, ResumoFila, Usuario } from '@/types'

interface Meta {
  chave: string
  valor: unknown
}

class ReviDB extends Dexie {
  leads!: Table<Lead, string>
  eventos!: Table<Evento, string>
  meta!: Table<Meta, string>

  constructor() {
    super('revi-captura')
    this.version(1).stores({
      leads: 'id, status_sync, evento_id, capturado_por, criado_em',
      eventos: 'id, ativo',
      meta: 'chave',
    })
  }
}

export const db = new ReviDB()

// ---------------------------------------------------------------------------
// Meta (cache de sessao, evento selecionado)
// ---------------------------------------------------------------------------

async function lerMeta<T>(chave: string): Promise<T | null> {
  const registro = await db.meta.get(chave)
  return (registro?.valor as T) ?? null
}

async function gravarMeta(chave: string, valor: unknown): Promise<void> {
  await db.meta.put({ chave, valor })
}

/**
 * Cache do usuario logado. E o que permite o app abrir e capturar leads em cold
 * start offline, quando nao da para consultar o Supabase.
 */
export const usuarioCache = {
  ler: () => lerMeta<Usuario>('usuario'),
  gravar: (usuario: Usuario) => gravarMeta('usuario', usuario),
  limpar: () => db.meta.delete('usuario'),
}

/** Ultimo evento usado, por usuario. O BDR nao escolhe o evento 40x por dia. */
export const eventoCache = {
  ler: (usuarioId: string) => lerMeta<string>(`evento:${usuarioId}`),
  gravar: (usuarioId: string, eventoId: string) =>
    gravarMeta(`evento:${usuarioId}`, eventoId),
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

export async function salvarEventos(eventos: Evento[]): Promise<void> {
  await db.eventos.bulkPut(eventos)
}

export async function listarEventos(): Promise<Evento[]> {
  const eventos = await db.eventos.toArray()
  return eventos
    .filter((e) => e.ativo)
    .sort((a, b) => b.data_inicio.localeCompare(a.data_inicio))
}

export async function obterEvento(id: string): Promise<Evento | undefined> {
  return db.eventos.get(id)
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export async function salvarLead(lead: Lead): Promise<void> {
  await db.leads.put({ ...lead, atualizado_em: new Date().toISOString() })
}

export async function atualizarLead(id: string, patch: Partial<Lead>): Promise<void> {
  await db.leads.update(id, { ...patch, atualizado_em: new Date().toISOString() })
}

export async function obterLead(id: string): Promise<Lead | undefined> {
  return db.leads.get(id)
}

export async function listarLeads(usuarioId: string, limite?: number): Promise<Lead[]> {
  const leads = await db.leads.where('capturado_por').equals(usuarioId).toArray()
  leads.sort((a, b) => b.criado_em.localeCompare(a.criado_em))
  return limite ? leads.slice(0, limite) : leads
}

/** Leads que ainda precisam de alguma acao: fila da tela de sincronizacao. */
export async function listarNaoResolvidos(usuarioId: string): Promise<Lead[]> {
  const leads = await listarLeads(usuarioId)
  return leads.filter((l) => l.status_sync !== 'enviado')
}

/**
 * Um lead do modo cliente segura o envio ate o BDR complementar — mas so por um
 * tempo. Depois disso ele sobe incompleto, porque lead incompleto no HubSpot e
 * sempre melhor do que lead parado no aparelho.
 */
export function aguardandoComplemento(lead: Lead, agora = Date.now()): boolean {
  if (!lead.aguardando_bdr) return false
  return agora - new Date(lead.criado_em).getTime() < LIBERAR_AGUARDANDO_APOS_MS
}

/** Fila de envio: pendentes liberados cujo backoff ja venceu. */
export async function listarProntosParaEnvio(usuarioId: string): Promise<Lead[]> {
  const agora = Date.now()
  const leads = await db.leads.where('capturado_por').equals(usuarioId).toArray()
  return leads
    .filter((l) => l.status_sync === 'pendente')
    .filter((l) => !aguardandoComplemento(l, agora))
    .filter((l) => !l.proximo_retry_em || l.proximo_retry_em <= agora)
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
}

/** Leads do modo cliente esperando o BDR completar os campos internos. */
export async function listarAguardandoBdr(usuarioId: string): Promise<Lead[]> {
  const leads = await db.leads.where('capturado_por').equals(usuarioId).toArray()
  return leads
    .filter((l) => l.status_sync === 'pendente' && aguardandoComplemento(l))
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
}

export async function resumoFila(usuarioId: string): Promise<ResumoFila> {
  const leads = await db.leads.where('capturado_por').equals(usuarioId).toArray()
  return {
    pendentes: leads.filter((l) => l.status_sync === 'pendente').length,
    erros: leads.filter((l) => l.status_sync === 'erro').length,
    duplicados: leads.filter((l) => l.status_sync === 'duplicado').length,
    enviados: leads.filter((l) => l.status_sync === 'enviado').length,
  }
}

export async function contarCapturadosHoje(usuarioId: string): Promise<number> {
  const inicioDoDia = new Date()
  inicioDoDia.setHours(0, 0, 0, 0)
  const corte = inicioDoDia.toISOString()

  const leads = await db.leads.where('capturado_por').equals(usuarioId).toArray()
  return leads.filter((l) => l.criado_em >= corte).length
}
