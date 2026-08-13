export type Papel = 'bdr' | 'closer' | 'admin'
export type Temperatura = 'quente' | 'morno' | 'frio'
export type StatusSync = 'pendente' | 'enviado' | 'erro' | 'duplicado'
export type ResolucaoDuplicado = 'anexar_nota' | 'criar_assim_mesmo'

export interface Usuario {
  id: string
  nome: string
  email: string
  hubspot_owner_id: string
  papel: Papel
  ativo: boolean
}

export interface Evento {
  id: string
  nome: string
  valor_detalhamento_origem: string
  valor_canal: string | null
  link_agendamento: string | null
  data_inicio: string
  data_fim: string
  ativo: boolean
}

/**
 * Lead como vive no dispositivo. O `id` e gerado aqui e e a chave de
 * idempotencia usada pelo backend — nunca regenere para o mesmo lead.
 */
export interface Lead {
  id: string
  evento_id: string
  capturado_por: string

  nome: string
  telefone: string
  email: string
  empresa: string

  cargo: string | null
  site: string | null
  instagram: string | null

  plataforma_ecommerce: string | null
  plataforma_outra: string | null
  temperatura: Temperatura | null
  observacoes: string | null

  consentimento_lgpd: boolean
  consentimento_em: string | null

  agendou_reuniao: boolean

  status_sync: StatusSync
  erro_sync: string | null
  resolucao_duplicado: ResolucaoDuplicado | null
  duplicado_owner_nome: string | null

  hubspot_contact_id: string | null
  hubspot_company_id: string | null
  hubspot_deal_id: string | null

  /** Controle local da fila. Nao vai para o servidor. */
  tentativas: number
  proximo_retry_em: number | null

  /**
   * Lead capturado no modo cliente, esperando o BDR complementar (temperatura,
   * plataforma, observacoes). Segura o envio para que a nota do negocio nasca
   * completa — com liberacao automatica por tempo, para nao existir cenario em
   * que um lead fica parado para sempre.
   */
  aguardando_bdr: boolean

  criado_em: string
  sincronizado_em: string | null
  atualizado_em: string
}

export interface RespostaSync {
  status: 'enviado' | 'duplicado' | 'erro'
  ja_processado?: boolean
  hubspot_contact_id?: string | null
  hubspot_company_id?: string | null
  hubspot_deal_id?: string | null
  duplicado_owner_nome?: string | null
  resolucao_duplicado?: ResolucaoDuplicado
  erro?: string
}

export interface ResumoFila {
  pendentes: number
  erros: number
  duplicados: number
  enviados: number
}
