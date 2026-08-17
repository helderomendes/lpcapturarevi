// =============================================================================
// Configuracao do front. Tudo o que muda de evento para evento mora aqui ou,
// melhor ainda, na tabela `eventos` do Supabase.
// =============================================================================

/**
 * Link de agendamento round-robin do HubSpot (revezamento de qualificacao).
 * Cada evento pode sobrescrever em `eventos.link_agendamento`, porque a escala
 * de closers muda de feira para feira.
 */
export const LINK_AGENDAMENTO_PADRAO = (
  import.meta.env.VITE_LINK_AGENDAMENTO_ROUND_ROBIN ??
  'https://meetings.hubspot.com/nicholas-love/revezamento-de-qualificacao-'
).trim()

/**
 * Valores exatos do enum `plataforma_de_e_commerce_utilizada` do HubSpot.
 * Enviar qualquer coisa fora desta lista faz a API devolver 400 — por isso
 * "Outra" grava o valor `Outros` e o texto livre vai para a nota do negocio.
 */
export const PLATAFORMAS_ECOMMERCE: readonly string[] = [
  'Bling',
  'Braavo',
  'CartPanda',
  'Desenvolvimento Próprio',
  'Guru Digital',
  'Iroba',
  'JET Commerce',
  'Linux Commerce',
  'Loja Integrada',
  'Magazord',
  'Magento',
  'Millennium',
  'NuvemShop',
  'Ommy',
  'Ormie',
  'Shopify',
  'Shoppub',
  'Tiny',
  'Tray',
  'Uappi',
  'Unbox',
  'Varejo Online',
  'Venda Ai',
  'Visual E-Commerce',
  'VNDA',
  'VTEX',
  'Wake Commerce',
  'WooCommerce',
  'Yampi',
  // Ordenado no carregamento, e nao so na mao: incluir uma plataforma nova no
  // meio da lista nao pode virar um item fora de ordem no dropdown.
].sort((a, b) => a.localeCompare(b, 'pt-BR'))

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

/**
 * Aviso de LGPD, exibido como texto e nao como checkbox.
 *
 * O consentimento acontece na conversa do estande — o visitante entrega os
 * dados sabendo que vai receber contato. Transformar isso num toque extra so
 * atrasa a fila sem acrescentar prova nenhuma. O que fica registrado e a
 * divulgacao (este texto) mais a data e hora da captura.
 */
export const TEXTO_LGPD =
  'Ao enviar, você autoriza a Revi a entrar em contato por e-mail e WhatsApp ' +
  'sobre suas soluções, e o tratamento dos seus dados conforme a LGPD. ' +
  'Você pode solicitar a remoção a qualquer momento.'

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
 * para que a nota do negocio ja nasca com plataforma de e-commerce e
 * observacoes. Passado esse tempo ele sobe assim mesmo: lead incompleto no
 * HubSpot e sempre melhor do que lead parado no aparelho.
 */
export const LIBERAR_AGUARDANDO_APOS_MS = 2 * 60 * 60 * 1000
