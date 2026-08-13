// =============================================================================
// Ponto unico de configuracao do backend.
//
// Regra: nenhuma constante de HubSpot espalhada pelo codigo. A cada evento algo
// aqui muda, e trocar isso nao pode exigir caca a string em varios arquivos.
//
// Os valores default abaixo sao os que existem hoje no portal da Revi
// (22634045). Cada um pode ser sobrescrito por variavel de ambiente:
//   supabase secrets set HUBSPOT_PIPELINE_ID=...
// =============================================================================

function env(nome: string, padrao = ''): string {
  return (Deno.env.get(nome) ?? padrao).trim()
}

export const config = {
  hubspot: {
    token: env('HUBSPOT_TOKEN'),
    baseUrl: env('HUBSPOT_BASE_URL', 'https://api.hubapi.com'),

    /** Pipeline "Vendas Diretas". */
    pipelineId: env('HUBSPOT_PIPELINE_ID', '139031732'),

    /** Etapa inicial. 238830450 = "Prospect/Pesquisa". */
    dealStageInicialId: env('HUBSPOT_DEAL_STAGE_INICIAL_ID', '238830450'),

    /** Canal do lead: enum no negocio. */
    propertyCanal: env('HUBSPOT_PROPERTY_CANAL', 'canal_de_lead'),
    valorCanal: env('HUBSPOT_VALOR_CANAL', 'Eventos'),

    /** Detalhamento de origem: texto livre. O valor vem do evento. */
    propertyDetalhamentoOrigem: env(
      'HUBSPOT_PROPERTY_DETALHAMENTO_ORIGEM',
      'detalhamento_de_origem',
    ),

    /** BDR responsavel: enum cujos valores sao HubSpot owner IDs. */
    propertyBdrResponsavel: env('HUBSPOT_PROPERTY_BDR_RESPONSAVEL', 'bdr_responsavel'),

    /** Origem do negocio. Vazio = nao preencher. */
    propertyOrigemNegocio: env('HUBSPOT_PROPERTY_ORIGEM_NEGOCIO', 'origem_do_negocio'),
    valorOrigemNegocio: env('HUBSPOT_VALOR_ORIGEM_NEGOCIO', 'Venda Direta'),

    /** Plataforma de e-commerce no negocio. Vazio = so vai na nota. */
    propertyPlataforma: env(
      'HUBSPOT_PROPERTY_PLATAFORMA',
      'plataforma_de_e_commerce_utilizada',
    ),

    /**
     * ⚠️ PREENCHER — property de texto no negocio com o UUID de captura.
     * Ainda nao existe no portal. Enquanto estiver vazia, a idempotencia fica
     * garantida apenas pela tabela `leads` no Supabase (que ja e suficiente);
     * a property e a segunda barreira, util se alguem apagar a linha local.
     */
    propertyIdCaptura: env('HUBSPOT_PROPERTY_ID_CAPTURA', ''),

    /** Opcional: property de contato para o @ do Instagram. Vazio = so na nota. */
    propertyInstagramContato: env('HUBSPOT_PROPERTY_INSTAGRAM_CONTATO', ''),
  },

  supabase: {
    url: env('SUPABASE_URL'),
    anonKey: env('SUPABASE_ANON_KEY'),
    serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  },
} as const

/** Falha cedo e com mensagem clara em vez de estourar no meio da sincronizacao. */
export function validarConfig(): string[] {
  const faltando: string[] = []
  if (!config.hubspot.token) faltando.push('HUBSPOT_TOKEN')
  if (!config.hubspot.pipelineId) faltando.push('HUBSPOT_PIPELINE_ID')
  if (!config.hubspot.dealStageInicialId) faltando.push('HUBSPOT_DEAL_STAGE_INICIAL_ID')
  if (!config.supabase.url) faltando.push('SUPABASE_URL')
  if (!config.supabase.serviceRoleKey) faltando.push('SUPABASE_SERVICE_ROLE_KEY')
  return faltando
}
