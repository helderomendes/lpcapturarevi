// Duplicado de propositio em cada funcao: o deploy sobe um bundle autocontido,
// entao cada funcao carrega as proprias dependencias. Sao 12 linhas — mais
// barato do que amarrar as duas funcoes num diretorio compartilhado.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
