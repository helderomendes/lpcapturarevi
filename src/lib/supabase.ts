import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Erro de configuracao, nao de runtime: melhor falhar alto no boot do que
  // descobrir no meio do evento.
  console.error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY sao obrigatorios. Confira o .env.',
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
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
