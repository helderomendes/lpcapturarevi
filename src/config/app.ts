// =============================================================================
// Configuracao do front. Tudo o que muda de evento para evento mora aqui ou,
// melhor ainda, na tabela `eventos` do Supabase.
// =============================================================================

/**
 * Link de agendamento round-robin do HubSpot usado como fallback.
 * O ideal e cadastrar o link em `eventos.link_agendamento`, porque cada feira
 * costuma ter uma escala de closers diferente.
 *
 * ⚠️ PREENCHER em .env: VITE_LINK_AGENDAMENTO_ROUND_ROBIN
 * HubSpot > Vendas > Reunioes > link de equipe (round-robin) > Copiar link.
 */
export const LINK_AGENDAMENTO_PADRAO = (
  import.meta.env.VITE_LINK_AGENDAMENTO_ROUND_ROBIN ?? ''
).trim()

/**
 * Valores exatos do enum `plataforma_de_e_commerce_utilizada` do HubSpot.
 * Enviar qualquer coisa fora desta lista faz a API devolver 400 — por isso
 * "Outra" grava o valor `Outros` e o texto livre vai para a nota do negocio.
 */
export const PLATAFORMAS_ECOMMERCE = [
  'Shopify',
  'VTEX',
  'NuvemShop',
  'Tray',
  'Loja Integrada',
  'WooCommerce',
  'Magento',
  'Magazord',
  'Wake Commerce',
  'Yampi',
  'CartPanda',
  'Bling',
  'Tiny',
  'Linux Commerce',
  'Shoppub',
  'JET Commerce',
  'VNDA',
  'Millennium',
  'Uappi',
  'Iroba',
  'Braavo',
  'Unbox',
  'Visual E-Commerce',
  'Varejo Online',
  'Venda Ai',
  'Guru Digital',
  'Ommy',
  'Ormie',
  'Desenvolvimento Próprio',
] as const

/**
 * Valor do enum usado quando o BDR escolhe "Outra".
 * O texto digitado vai em `plataforma_outra` e aparece na nota do negocio.
 */
export const PLATAFORMA_OUTRA = 'Outros'

/** Mapeia o valor exibido para o valor exato aceito pelo HubSpot. */
export const VALOR_HUBSPOT_PLATAFORMA: Record<string, string> = {
  VTEX: 'Vtex',
  VNDA: 'Vinda',
}

export const TEXTO_LGPD =
  'Autorizo a Revi a entrar em contato comigo por e-mail e WhatsApp sobre suas ' +
  'soluções, e o tratamento dos meus dados conforme a LGPD. Posso solicitar a ' +
  'remoção a qualquer momento.'

/** Cadencia da fila offline. */
export const SYNC = {
  /** Timer de sincronizacao automatica. */
  intervaloMs: 60_000,
  /** Maximo de tentativas automaticas antes de exigir acao manual. */
  maxTentativas: 5,
  /** Backoff exponencial, uma entrada por tentativa. */
  backoffMs: [5_000, 15_000, 60_000, 180_000, 600_000],
} as const

/** Segundos ate o modo cliente voltar sozinho para a tela neutra. */
export const SEGUNDOS_TELA_OBRIGADO = 5

/**
 * Um lead capturado no modo cliente espera o BDR complementar antes de subir,
 * para que a nota do negocio ja nasca com temperatura, plataforma e
 * observacoes. Passado esse tempo ele sobe assim mesmo: lead incompleto no
 * HubSpot e sempre melhor do que lead parado no aparelho.
 */
export const LIBERAR_AGUARDANDO_APOS_MS = 2 * 60 * 60 * 1000
