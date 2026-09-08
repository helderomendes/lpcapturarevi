// =============================================================================
// Edge Function `admin-usuarios`
//
// Cria e mantem o acesso da equipe, sempre amarrado ao HubSpot owner ID
// correspondente, buscado pelo e-mail. Existe para matar o vaivem "painel do
// Supabase + SQL" que e onde o login quebra silenciosamente: conta criada sem
// vinculo entra com a senha certa e e deslogada na hora.
//
// Tres acoes:
//   `criar`     (default) — conta no auth + vinculo em app_users. Admin.
//   `atualizar`           — nome, e-mail, papel, link de reuniao, senha e ativo
//                           de quem ja existe. Admin.
//   `meu_link`            — a propria agenda, por qualquer usuario ativo. Nao
//                           precisa de admin: e o unico caminho de escrita que
//                           cada um tem sobre o proprio registro, e escreve uma
//                           coluna so.
//
// Garantias:
//  - `criar` e `atualizar` exigem `papel = 'admin'`. Sem isso, 403.
//  - `meu_link` grava SOMENTE `link_agendamento` e SOMENTE na linha de quem
//    chamou — o id vem do JWT, nunca do corpo da requisicao. Nao ha como
//    editar o link de outra pessoa nem tocar em papel por essa porta.
//  - Sem owner ativo no HubSpot para aquele e-mail, nada e criado nem
//    revinculado: melhor recusar do que deixar lead nascer sem dono.
//  - `app_users` nao tem policy de escrita e nao vai ter: todo update de
//    `papel` passa por aqui. Liberado na API publica, seria escalonamento de
//    privilegio — qualquer logado se promovendo a admin.
//  - Ninguem se tranca fora: o ultimo admin ativo nao pode ser rebaixado nem
//    desativado, e admin nenhum remove o proprio acesso.
// =============================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders, json } from './lib/cors.ts'
import { ownerPorEmail } from './lib/owners.ts'

type Papel = 'bdr' | 'closer' | 'admin'
type Acao = 'criar' | 'atualizar' | 'meu_link'

interface Corpo {
  acao?: Acao
  /** Somente em `atualizar`: quem esta sendo editado. */
  id?: string
  email?: string
  nome?: string
  senha?: string
  papel?: Papel
  ativo?: boolean
  link_agendamento?: string | null
  /** Somente em `atualizar`: re-resolve o owner do HubSpot pelo e-mail atual. */
  revincular?: boolean
}

const PAPEIS: Papel[] = ['bdr', 'closer', 'admin']
const SENHA_MINIMA = 8
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const CAMPOS = 'id, nome, email, hubspot_owner_id, papel, ativo, link_agendamento'

/** Link de agendamento aceita qualquer provedor, mas tem que ser URL http(s). */
function linkValido(valor: string): boolean {
  try {
    const url = new URL(valor)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

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
  if (!solicitante) {
    return json({ status: 'erro', erro: 'Usuario sem cadastro em app_users' }, 403)
  }
  if (!solicitante.ativo) return json({ status: 'erro', erro: 'Usuario inativo' }, 403)

  // --- 2. Entrada -----------------------------------------------------------
  let corpo: Corpo
  try {
    corpo = await req.json()
  } catch {
    return json({ status: 'erro', erro: 'JSON invalido' }, 400)
  }

  // A propria agenda vem antes da barreira de admin: cada um cuida da sua.
  if (corpo.acao === 'meu_link') {
    return await meuLink(admin, corpo, auth.user.id)
  }

  if (solicitante.papel !== 'admin') {
    return json({ status: 'erro', erro: 'Somente admin pode gerenciar acessos' }, 403)
  }

  if (corpo.acao === 'atualizar') {
    return await atualizar(admin, corpo, auth.user.id)
  }

  return await criar(admin, corpo)
})

// ---------------------------------------------------------------------------
// meu_link
// ---------------------------------------------------------------------------

/**
 * A agenda de quem chamou. Duas escolhas que sustentam a seguranca disso:
 *
 *  - o id vem do JWT (`solicitanteId`), nao do corpo: nao existe requisicao
 *    capaz de apontar para outra pessoa;
 *  - o update carrega uma coluna e ponto. `papel` e `ativo` nao passam por
 *    aqui, entao nao ha caminho de escalonamento de privilegio.
 */
async function meuLink(
  admin: SupabaseClient,
  corpo: Corpo,
  solicitanteId: string,
): Promise<Response> {
  const link = (corpo.link_agendamento ?? '').trim()
  if (link && !linkValido(link)) {
    return json(
      { status: 'erro', erro: 'O link de reuniao precisa ser uma URL http(s) completa' },
      400,
    )
  }

  const { data, error } = await admin
    .from('app_users')
    .update({ link_agendamento: link || null })
    .eq('id', solicitanteId)
    .select(CAMPOS)
    .single()

  if (error) {
    console.error('[admin-usuarios] falha ao salvar o proprio link', error.message)
    return json({ status: 'erro', erro: `Falha ao salvar: ${error.message}` }, 500)
  }

  console.log(`[admin-usuarios][${data.email}] proprio link ${link ? 'salvo' : 'removido'}`)
  return json({ status: 'ok', usuario: data, alterou: true })
}

// ---------------------------------------------------------------------------
// criar
// ---------------------------------------------------------------------------

async function criar(admin: SupabaseClient, corpo: Corpo): Promise<Response> {
  const email = (corpo.email ?? '').trim().toLowerCase()
  const nome = (corpo.nome ?? '').trim()
  const senha = corpo.senha ?? ''
  const papel: Papel = PAPEIS.includes(corpo.papel as Papel) ? (corpo.papel as Papel) : 'bdr'

  if (!EMAIL_VALIDO.test(email)) {
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
    // --- Owner no HubSpot ---------------------------------------------------
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

    // --- Conta no auth ------------------------------------------------------
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

      const encontrado = await contaPorEmail(admin, email)
      if (!encontrado) {
        throw new Error('A conta existe mas nao apareceu na listagem. Verifique no painel.')
      }

      userId = encontrado
      const { error: erroSenha } = await admin.auth.admin.updateUserById(userId, {
        password: senha,
        email_confirm: true,
      })
      if (erroSenha) throw new Error(`Falha ao atualizar a senha: ${erroSenha.message}`)
      log('conta ja existia, senha atualizada', userId)
    }

    // --- Vinculo em app_users ----------------------------------------------
    // Recadastro nao apaga o link de reuniao de quem ja existia: `upsert` so
    // manda as colunas abaixo, e `link_agendamento` fica como esta.
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
}

// ---------------------------------------------------------------------------
// atualizar
// ---------------------------------------------------------------------------

async function atualizar(
  admin: SupabaseClient,
  corpo: Corpo,
  solicitanteId: string,
): Promise<Response> {
  const id = (corpo.id ?? '').trim()
  if (!id) return json({ status: 'erro', erro: 'Informe o id de quem sera editado' }, 400)

  const { data: alvo, error: erroAlvo } = await admin
    .from('app_users')
    .select(CAMPOS)
    .eq('id', id)
    .maybeSingle()

  if (erroAlvo) {
    console.error('[admin-usuarios] falha ao ler o alvo', erroAlvo.message)
    return json({ status: 'erro', erro: 'Falha ao carregar o usuario' }, 500)
  }
  if (!alvo) return json({ status: 'erro', erro: 'Usuario nao encontrado' }, 404)

  const log = (msg: string, extra?: unknown) =>
    console.log(`[admin-usuarios][${alvo.email}] ${msg}`, extra ?? '')

  const patch: Record<string, unknown> = {}

  // --- Nome ---------------------------------------------------------------
  if (corpo.nome !== undefined) {
    const nome = corpo.nome.trim()
    if (!nome) return json({ status: 'erro', erro: 'O nome nao pode ficar vazio' }, 400)
    patch.nome = nome
  }

  // --- Link de reuniao ----------------------------------------------------
  if (corpo.link_agendamento !== undefined) {
    const link = (corpo.link_agendamento ?? '').trim()
    if (link && !linkValido(link)) {
      return json(
        { status: 'erro', erro: 'O link de reuniao precisa ser uma URL http(s) completa' },
        400,
      )
    }
    patch.link_agendamento = link || null
  }

  // --- Papel e ativo ------------------------------------------------------
  const novoPapel = corpo.papel !== undefined && PAPEIS.includes(corpo.papel)
    ? corpo.papel
    : undefined
  if (corpo.papel !== undefined && novoPapel === undefined) {
    return json({ status: 'erro', erro: 'Papel invalido' }, 400)
  }

  const perdeAdmin = novoPapel !== undefined && novoPapel !== 'admin' && alvo.papel === 'admin'
  const perdeAcesso = corpo.ativo === false && alvo.ativo

  if (id === solicitanteId && (perdeAdmin || perdeAcesso)) {
    return json(
      {
        status: 'erro',
        erro: 'Voce nao pode remover o proprio acesso de admin. Pedir para outro admin fazer isso evita ficar sem ninguem no painel.',
      },
      400,
    )
  }

  // Rebaixar ou desativar o ultimo admin ativo deixaria o painel inacessivel
  // e sem caminho de volta pela aplicacao — so por SQL no Supabase.
  if (alvo.papel === 'admin' && alvo.ativo && (perdeAdmin || perdeAcesso)) {
    const { count, error } = await admin
      .from('app_users')
      .select('id', { count: 'exact', head: true })
      .eq('papel', 'admin')
      .eq('ativo', true)

    if (error) {
      console.error('[admin-usuarios] falha ao contar admins', error.message)
      return json({ status: 'erro', erro: 'Falha ao validar a mudanca de papel' }, 500)
    }
    if ((count ?? 0) <= 1) {
      return json(
        {
          status: 'erro',
          erro: 'Este e o unico admin ativo. Promova outra pessoa a admin antes de mudar este acesso.',
        },
        400,
      )
    }
  }

  if (novoPapel !== undefined) patch.papel = novoPapel
  if (corpo.ativo !== undefined) patch.ativo = Boolean(corpo.ativo)

  try {
    // --- E-mail -----------------------------------------------------------
    // Muda em auth.users e em app_users, e revincula o owner do HubSpot: sao
    // as tres pontas do mesmo dado. Deixar qualquer uma para tras e o cenario
    // do login que entra e cai na hora.
    const emailNovo = (corpo.email ?? '').trim().toLowerCase()
    const trocouEmail = Boolean(emailNovo) && emailNovo !== alvo.email

    if (emailNovo && !EMAIL_VALIDO.test(emailNovo)) {
      return json({ status: 'erro', erro: 'E-mail invalido' }, 400)
    }

    if (trocouEmail) {
      const { data: ocupado } = await admin
        .from('app_users')
        .select('nome')
        .eq('email', emailNovo)
        .neq('id', id)
        .maybeSingle()

      if (ocupado) {
        return json(
          { status: 'erro', erro: `O e-mail ${emailNovo} ja pertence a ${ocupado.nome}.` },
          409,
        )
      }
    }

    if (trocouEmail || corpo.revincular) {
      const owner = await ownerPorEmail(trocouEmail ? emailNovo : alvo.email)
      if (!owner) {
        return json(
          {
            status: 'erro',
            erro:
              `Nao encontrei nenhum usuario do HubSpot com o e-mail ` +
              `${trocouEmail ? emailNovo : alvo.email}. Sem owner, o lead nasceria sem dono.`,
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
      patch.hubspot_owner_id = owner.id
      log('owner revinculado', owner)
    }

    if (trocouEmail) {
      const { error } = await admin.auth.admin.updateUserById(id, {
        email: emailNovo,
        email_confirm: true,
      })
      if (error) throw new Error(`Falha ao trocar o e-mail do login: ${error.message}`)
      patch.email = emailNovo
      log('e-mail do login trocado', emailNovo)
    }

    // --- Senha ------------------------------------------------------------
    if (corpo.senha !== undefined && corpo.senha !== '') {
      if (corpo.senha.length < SENHA_MINIMA) {
        return json(
          { status: 'erro', erro: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres` },
          400,
        )
      }
      const { error } = await admin.auth.admin.updateUserById(id, {
        password: corpo.senha,
        email_confirm: true,
      })
      if (error) throw new Error(`Falha ao trocar a senha: ${error.message}`)
      log('senha trocada')
    }

    // --- Grava ------------------------------------------------------------
    if (Object.keys(patch).length === 0) {
      return json({ status: 'ok', usuario: alvo, alterou: false })
    }

    const { data: atualizado, error: erroUpdate } = await admin
      .from('app_users')
      .update(patch)
      .eq('id', id)
      .select(CAMPOS)
      .single()

    if (erroUpdate) throw new Error(`Falha ao salvar: ${erroUpdate.message}`)

    log('atualizado', Object.keys(patch))
    return json({ status: 'ok', usuario: atualizado, alterou: true })
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro)
    console.error(`[admin-usuarios][${alvo.email}] falhou:`, mensagem)
    return json({ status: 'erro', erro: mensagem }, 500)
  }
}

// ---------------------------------------------------------------------------

/** Localiza o uid de uma conta pelo e-mail, paginando o auth. */
async function contaPorEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let pagina = 1; pagina <= 10; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 })
    if (error) throw new Error(`Falha ao localizar a conta existente: ${error.message}`)

    const achado = data.users.find((u) => (u.email ?? '').toLowerCase() === email)
    if (achado) return achado.id
    if (data.users.length < 200) break
  }
  return null
}
