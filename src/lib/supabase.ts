import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

/**
 * Variaveis de ambiente ausentes no momento do BUILD. O Vite embute os valores
 * no bundle, entao adicionar a variavel depois exige um novo deploy.
 */
export const variaveisFaltando: string[] = [
  !url && 'VITE_SUPABASE_URL',
  !anonKey && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean) as string[]

export const configuracaoValida = variaveisFaltando.length === 0

// Sem placeholder, `createClient` lanca e o app inteiro morre antes de pintar
// qualquer pixel — o usuario ve uma tela vazia e nenhuma pista do motivo. Com
// ele, o app monta e a tela de configuracao explica o que falta.
const PLACEHOLDER_URL = 'https://configuracao-ausente.invalid'

export const supabase = createClient(url || PLACEHOLDER_URL, anonKey || 'configuracao-ausente', {
  auth: {
    // Sessao persistente: o BDR loga uma vez em casa e nao e deslogado durante
    // o evento. A duracao real do refresh token e configurada no painel do
    // Supabase (Authentication > Sessions).
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage,
    storageKey: 'revi-captura-auth',
  },
})

export const urlEdgeFunction = (nome: string) => `${url}/functions/v1/${nome}`
