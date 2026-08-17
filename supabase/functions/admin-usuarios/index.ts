// =============================================================================
// Edge Function `admin-usuarios`
//
// Cria o acesso de um BDR e ja amarra ao HubSpot owner ID correspondente,
// buscado pelo e-mail. Existe para matar o vaivem "painel do Supabase + SQL"
// que e onde o login quebra silenciosamente: conta criada sem vinculo entra com
// a senha certa e e deslogada na hora.
//
// Garantias:
//  - Somente `papel = 'admin'` pode chamar. Sem isso, 403.
//  - Sem owner ativo no HubSpot para aquele e-mail, nada e criado. Melhor
//    recusar do que gerar um usuario que captura lead sem dono.
//  - Idempotente: se a conta ja existe no auth, apenas atualiza o vinculo.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders, json } from './lib/cors.ts'
import { ownerPorEmail } from './lib/owners.ts'

type Papel = 'bdr' | 'closer' | 'admin'

interface Corpo {
  email?: string
  nome?: string
  senha?: string
  papel?: Papel
}

const PAPEIS: Papel[] = ['bdr', 'closer', 'admin']
const SENHA_MINIMA = 8

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ status: 'erro', erro: 'Metodo nao suportado' }, 405)

  const url = (Deno.env.get('SUPABASE_URL') ?? '').trim()
  const serviceRole = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  const hubspotToken = (Deno.env.get('HUBSPOT_TOKEN') ?? '').trim()

  const faltando = [
    !url && 'SUPABASE_URL',
    !serviceRole && 'SUPABASE_SERVICE_ROLE_KEY',
    !hubspotToken && 'HUBSPOT_TOKEN',
  ].filter(Boolean)

  if (faltando.length > 0) {
    console.error('[admin-usuarios] configuracao incompleta', faltando)
    return json(
      { status: 'erro', erro: `Configuracao incompleta no servidor: ${faltando.join(', ')}` },
      500,
    )
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ status: 'erro', erro: 'Token ausente' }, 401)

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // --- 1. Quem esta chamando -----------------------------------------------
  const { data: auth, error: erroAuth } = await admin.auth.getUser(token)
  if (erroAuth || !auth?.user) {
    return json({ status: 'erro', erro: 'Sessao invalida ou expirada' }, 401)
  }

  const { data: solicitante, error: erroSolicitante } = await admin
    .from('app_users')
    .select('papel, ativo, nome')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (erroSolicitante) {
    console.error('[admin-usuarios] falha ao ler app_users', erroSolicitante.message)
    return json({ status: 'erro', erro: 'Falha ao verificar permissao' }, 500)
  }
  if (!solicitante?.ativo || solicitante.papel !== 'admin') {
    return json({ status: 'erro', erro: 'Somente admin pode criar acessos' }, 403)
  }

  // --- 2. Entrada -----------------------------------------------------------
  let corpo: Corpo
  try {
    corpo = await req.json()
  } catch {
    return json({ status: 'erro', erro: 'JSON invalido' }, 400)
  }

  const email = (corpo.email ?? '').trim().toLowerCase()
  const nome = (corpo.nome ?? '').trim()
  const senha = corpo.senha ?? ''
  const papel: Papel = PAPEIS.includes(corpo.papel as Papel) ? (corpo.papel as Papel) : 'bdr'

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json({ status: 'erro', erro: 'E-mail invalido' }, 400)
  }
  if (senha.length < SENHA_MINIMA) {
    return json(
      { status: 'erro', erro: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres` },
      400,
    )
  }

  const log = (msg: string, extra?: unknown) =>
    console.log(`[admin-usuarios][${email}] ${msg}`, extra ?? '')

  try {
    // --- 3. Owner no HubSpot ----------------------------------------------
    // Antes de criar qualquer coisa: sem owner, o lead nasceria sem dono.
    const owner = await ownerPorEmail(email)
    if (!owner) {
      log('sem owner no HubSpot, recusando')
      return json(
        {
          status: 'erro',
          erro:
            `Nao encontrei nenhum usuario do HubSpot com o e-mail ${email}. ` +
            'Confirme que a pessoa tem acesso ao HubSpot antes de criar o login aqui.',
        },
        422,
      )
    }
    if (!owner.ativo) {
      return json(
        { status: 'erro', erro: `O usuario ${owner.nome} esta arquivado no HubSpot.` },
        422,
      )
    }

    log('owner resolvido', owner)

    // --- 4. Conta no auth --------------------------------------------------
    let userId: string | null = null
    let criou = false

    const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true, // sem confirmacao por e-mail: em evento ninguem abre inbox
    })

    if (criado?.user) {
      userId = criado.user.id
      criou = true
      log('conta criada no auth', userId)
    } else {
      // Ja existe: nao e erro. Localiza e segue para o vinculo, e a senha
      // informada passa a valer — e isso que faz o botao servir de reset.
      const jaExiste = /already|exists|registered|duplicate/i.test(erroCriar?.message ?? '')
      if (!jaExiste) throw new Error(erroCriar?.message ?? 'Falha ao criar a conta')

      const { data: lista, error: erroLista } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      })
      if (erroLista) throw new Error(`Falha ao localizar a conta existente: ${erroLista.message}`)

      const encontrado = lista.users.find((u) => (u.email ?? '').toLowerCase() === email)
      if (!encontrado) {
        throw new Error('A conta existe mas nao apareceu na listagem. Verifique no painel.')
      }

      userId = encontrado.id
      const { error: erroSenha } = await admin.auth.admin.updateUserById(userId, {
        password: senha,
        email_confirm: true,
      })
      if (erroSenha) throw new Error(`Falha ao atualizar a senha: ${erroSenha.message}`)
      log('conta ja existia, senha atualizada', userId)
    }

    // --- 5. Vinculo em app_users ------------------------------------------
    const { error: erroVinculo } = await admin.from('app_users').upsert(
      {
        id: userId,
        nome: nome || owner.nome,
        email,
        hubspot_owner_id: owner.id,
        papel,
        ativo: true,
      },
      { onConflict: 'id' },
    )

    if (erroVinculo) throw new Error(`Falha ao vincular ao HubSpot: ${erroVinculo.message}`)

    log('vinculado', { owner: owner.id, papel })

    return json({
      status: 'ok',
      criou,
      email,
      nome: nome || owner.nome,
      papel,
      hubspot_owner_id: owner.id,
      nome_hubspot: owner.nome,
    })
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro)
    console.error(`[admin-usuarios][${email}] falhou:`, mensagem)
    return json({ status: 'erro', erro: mensagem }, 500)
  }
})
