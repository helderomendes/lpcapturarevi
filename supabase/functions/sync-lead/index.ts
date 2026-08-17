// =============================================================================
// Edge Function `sync-lead`
//
// Recebe um lead capturado no dispositivo e o materializa no HubSpot como
// contato + empresa + negocio + nota, sempre nessa ordem.
//
// Garantias:
//  - O token do HubSpot vive so aqui. O front nunca o ve.
//  - Sem JWT valido do Supabase, 401 antes de qualquer chamada ao HubSpot.
//  - Idempotente pelo UUID do dispositivo: reenviar a mesma requisicao mil
//    vezes nao cria um registro a mais.
//  - Falha parcial retoma de onde parou: cada ID criado e persistido na hora.
// =============================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { config, validarConfig } from './lib/config.ts'
import { corsHeaders, json } from './lib/cors.ts'
import * as hs from './lib/hubspot.ts'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type ResolucaoDuplicado = 'anexar_nota' | 'criar_assim_mesmo'

interface LeadEntrada {
  id: string
  evento_id: string
  nome: string
  telefone: string
  email: string
  empresa: string
  cargo?: string | null
  site?: string | null
  instagram?: string | null
  plataforma_ecommerce?: string | null
  plataforma_outra?: string | null
  observacoes?: string | null
  consentimento_lgpd?: boolean
  consentimento_em?: string | null
  agendou_reuniao?: boolean
  criado_em?: string | null
}

interface Corpo {
  lead: LeadEntrada
  resolucao_duplicado?: ResolucaoDuplicado
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROVEDORES_PESSOAIS = new Set([
  'gmail.com', 'hotmail.com', 'outlook.com', 'outlook.com.br', 'yahoo.com',
  'yahoo.com.br', 'icloud.com', 'live.com', 'bol.com.br', 'uol.com.br',
  'terra.com.br', 'globo.com', 'me.com', 'msn.com', 'protonmail.com',
  'proton.me', 'aol.com', 'zipmail.com.br', 'ig.com.br',
])

/**
 * Dominio da empresa: preferencia para o site informado; se nao houver, o
 * dominio do e-mail — desde que nao seja provedor pessoal, senao a gente
 * acabaria criando uma empresa chamada "gmail.com".
 */
function extrairDominio(site?: string | null, email?: string | null): string | null {
  const doSite = (site ?? '').trim()
  if (doSite) {
    try {
      const url = new URL(doSite.startsWith('http') ? doSite : `https://${doSite}`)
      const host = url.hostname.toLowerCase().replace(/^www\./, '')
      if (host.includes('.')) return host
    } catch {
      // segue para o e-mail
    }
  }

  const dominioEmail = (email ?? '').split('@')[1]?.toLowerCase().trim()
  if (dominioEmail && dominioEmail.includes('.') && !PROVEDORES_PESSOAIS.has(dominioEmail)) {
    return dominioEmail
  }
  return null
}

function separarNome(nomeCompleto: string): { firstname: string; lastname: string } {
  const partes = nomeCompleto.trim().split(/\s+/)
  return {
    firstname: partes[0] ?? '',
    lastname: partes.slice(1).join(' '),
  }
}

function normalizarSite(site?: string | null): string | null {
  const valor = (site ?? '').trim()
  if (!valor) return null
  return valor.startsWith('http') ? valor : `https://${valor}`
}

function normalizarInstagram(instagram?: string | null): string | null {
  const valor = (instagram ?? '').trim()
  if (!valor) return null
  if (valor.startsWith('http')) return valor
  return `@${valor.replace(/^@+/, '')}`
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Nota do negocio: e o que faz o closer chegar preparado na reuniao. */
function montarNota(lead: LeadEntrada, evento: { nome: string }, autor: string): string {
  const linhas: string[] = [
    `<b>Lead captado em evento — ${escapar(evento.nome)}</b>`,
    `Captado por: ${escapar(autor)}`,
    '<br><b>Quem e</b>',
    `Nome: ${escapar(lead.nome)}`,
  ]

  // Telefone e e-mail tambem aqui, e nao so no contato: a nota e o unico lugar
  // que o closer ve sem sair do negocio, e nao depende de property nenhuma
  // estar configurada.
  if (lead.cargo) linhas.push(`Cargo: ${escapar(lead.cargo)}`)
  linhas.push(`Telefone / WhatsApp: ${escapar(lead.telefone)}`)
  linhas.push(`E-mail: ${escapar(lead.email)}`)

  const instagram = normalizarInstagram(lead.instagram)
  if (instagram) linhas.push(`Instagram: ${escapar(instagram)}`)

  const site = normalizarSite(lead.site)
  if (site) linhas.push(`Site: ${escapar(site)}`)

  if (lead.plataforma_ecommerce) {
    const detalhe = lead.plataforma_outra?.trim()
    linhas.push(
      `Plataforma de e-commerce: ${escapar(lead.plataforma_ecommerce)}` +
        (detalhe ? ` — ${escapar(detalhe)}` : ''),
    )
  }

  linhas.push('<br><b>Registro</b>')
  linhas.push(`Agendou reuniao no estande: ${lead.agendou_reuniao ? 'sim' : 'nao'}`)
  linhas.push(
    `Consentimento LGPD: ${
      lead.consentimento_lgpd
        ? `sim (${lead.consentimento_em ?? 'sem data'})`
        : 'nao'
    }`,
  )

  if (lead.observacoes?.trim()) {
    linhas.push('<br><b>Observacoes do BDR</b>', escapar(lead.observacoes.trim()))
  }

  return linhas.join('<br>')
}

function erroLegivel(erro: unknown): string {
  if (erro instanceof hs.HubSpotError) {
    return `HubSpot ${erro.status}: ${erro.corpo || erro.message}`
  }
  if (erro instanceof Error) return erro.message
  return String(erro)
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ status: 'erro', erro: 'Metodo nao suportado' }, 405)

  const faltando = validarConfig()
  if (faltando.length > 0) {
    console.error('[sync-lead] configuracao incompleta', faltando)
    return json(
      { status: 'erro', erro: `Configuracao incompleta no servidor: ${faltando.join(', ')}` },
      500,
    )
  }

  // --- 1. JWT do Supabase ---------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ status: 'erro', erro: 'Token ausente' }, 401)

  const admin: SupabaseClient = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data: auth, error: erroAuth } = await admin.auth.getUser(token)
  if (erroAuth || !auth?.user) {
    return json({ status: 'erro', erro: 'Sessao invalida ou expirada' }, 401)
  }
  const userId = auth.user.id

  let corpo: Corpo
  try {
    corpo = await req.json()
  } catch {
    return json({ status: 'erro', erro: 'JSON invalido' }, 400)
  }

  const lead = corpo?.lead
  if (!lead?.id || !lead.evento_id || !lead.nome || !lead.email || !lead.telefone || !lead.empresa) {
    return json(
      { status: 'erro', erro: 'Lead incompleto: id, evento_id, nome, telefone, email e empresa sao obrigatorios' },
      400,
    )
  }

  const log = (msg: string, extra?: unknown) =>
    console.log(`[sync-lead][${lead.id}] ${msg}`, extra ?? '')

  try {
    // --- 2. Quem capturou -------------------------------------------------
    const { data: appUser, error: erroUser } = await admin
      .from('app_users')
      .select('id, nome, email, hubspot_owner_id, ativo')
      .eq('id', userId)
      .maybeSingle()

    if (erroUser) throw new Error(`Falha ao ler app_users: ${erroUser.message}`)
    if (!appUser) {
      return json(
        { status: 'erro', erro: 'Usuario sem cadastro em app_users. Fale com o admin.' },
        403,
      )
    }
    if (!appUser.ativo) return json({ status: 'erro', erro: 'Usuario inativo' }, 403)

    const ownerId = String(appUser.hubspot_owner_id)

    // --- 3. Evento --------------------------------------------------------
    const { data: evento, error: erroEvento } = await admin
      .from('eventos')
      .select('id, nome, valor_detalhamento_origem, valor_canal')
      .eq('id', lead.evento_id)
      .maybeSingle()

    if (erroEvento) throw new Error(`Falha ao ler eventos: ${erroEvento.message}`)
    if (!evento) return json({ status: 'erro', erro: 'Evento nao encontrado' }, 400)

    // --- 4. Registro de controle (idempotencia primaria) ------------------
    const { data: existente } = await admin
      .from('leads')
      .select(
        'status_sync, hubspot_contact_id, hubspot_company_id, hubspot_deal_id, hubspot_note_id, tentativas_sync, capturado_por, resolucao_duplicado',
      )
      .eq('id', lead.id)
      .maybeSingle()

    if (existente && existente.capturado_por !== userId) {
      // O UUID e gerado no dispositivo; ainda assim, ninguem reescreve lead alheio.
      return json({ status: 'erro', erro: 'Este lead pertence a outro usuario' }, 403)
    }

    // Ja resolvido: com negocio criado, ou com a nota anexada a um contato
    // existente (caso em que nao ha negocio a criar, e de proposito).
    const jaResolvido = existente?.status_sync === 'enviado' &&
      (Boolean(existente.hubspot_deal_id) || existente.resolucao_duplicado === 'anexar_nota')

    if (jaResolvido && existente) {
      log('ja processado, nada a fazer')
      return json({
        status: 'enviado',
        ja_processado: true,
        hubspot_contact_id: existente.hubspot_contact_id,
        hubspot_company_id: existente.hubspot_company_id,
        hubspot_deal_id: existente.hubspot_deal_id,
        resolucao_duplicado: existente.resolucao_duplicado ?? undefined,
      })
    }

    const registro = {
      id: lead.id,
      evento_id: lead.evento_id,
      capturado_por: userId, // vem da sessao, nunca do corpo da requisicao
      nome: lead.nome,
      telefone: lead.telefone,
      email: lead.email.toLowerCase().trim(),
      empresa: lead.empresa,
      cargo: lead.cargo ?? null,
      site: normalizarSite(lead.site),
      instagram: normalizarInstagram(lead.instagram),
      plataforma_ecommerce: lead.plataforma_ecommerce ?? null,
      plataforma_outra: lead.plataforma_outra ?? null,
      observacoes: lead.observacoes ?? null,
      consentimento_lgpd: lead.consentimento_lgpd ?? false,
      consentimento_em: lead.consentimento_em ?? null,
      agendou_reuniao: lead.agendou_reuniao ?? false,
      criado_em: lead.criado_em ?? new Date().toISOString(),
      status_sync: 'pendente' as const,
      tentativas_sync: (existente?.tentativas_sync ?? 0) + 1,
    }

    const { error: erroUpsert } = await admin.from('leads').upsert(registro, { onConflict: 'id' })
    if (erroUpsert) throw new Error(`Falha ao gravar lead: ${erroUpsert.message}`)

    /** Persiste progresso parcial imediatamente: o proximo retry retoma daqui. */
    const salvar = async (patch: Record<string, unknown>) => {
      const { error } = await admin.from('leads').update(patch).eq('id', lead.id)
      if (error) console.error(`[sync-lead][${lead.id}] falha ao salvar progresso`, error.message)
    }

    let contactId = existente?.hubspot_contact_id ?? null
    let companyId = existente?.hubspot_company_id ?? null
    let dealId = existente?.hubspot_deal_id ?? null

    // --- 5. Idempotencia secundaria: o negocio ja existe no HubSpot? ------
    if (!dealId && config.hubspot.propertyIdCaptura) {
      const jaNoHubspot = await hs.buscarNegocioPorIdCaptura(lead.id)
      if (jaNoHubspot.total > 0) {
        dealId = jaNoHubspot.results[0].id
        log('negocio ja existia no HubSpot com este UUID de captura', dealId)
        await salvar({
          hubspot_deal_id: dealId,
          status_sync: 'enviado',
          erro_sync: null,
          sincronizado_em: new Date().toISOString(),
        })
        return json({
          status: 'enviado',
          ja_processado: true,
          hubspot_contact_id: contactId,
          hubspot_company_id: companyId,
          hubspot_deal_id: dealId,
        })
      }
    }

    const { firstname, lastname } = separarNome(lead.nome)
    const email = registro.email

    // --- 6. Contato: duplicata e decisao humana ---------------------------
    if (!contactId) {
      const busca = await hs.buscarContatoPorEmail(email)
      const encontrado = busca.results[0]

      if (encontrado && !corpo.resolucao_duplicado) {
        // Nao sobrescreve nada e nao rouba a propriedade do registro.
        // Quem decide o que fazer e o BDR, na tela.
        const donoAtual = await hs.nomeDoProprietario(encontrado.properties.hubspot_owner_id)
        log('contato duplicado, devolvendo decisao ao BDR', { contactId: encontrado.id })
        await salvar({
          status_sync: 'duplicado',
          hubspot_contact_id: encontrado.id,
          duplicado_owner_nome: donoAtual,
          erro_sync: null,
        })
        return json({
          status: 'duplicado',
          hubspot_contact_id: encontrado.id,
          duplicado_owner_nome: donoAtual,
        })
      }

      if (encontrado && corpo.resolucao_duplicado === 'anexar_nota') {
        // Se a nota ja subiu num retry anterior, nao cria outra.
        let notaId = existente?.hubspot_note_id ?? null
        if (!notaId) {
          const nota = await hs.criarNota(
            montarNota(lead, evento, appUser.nome),
            new Date().toISOString(),
          )
          notaId = nota.id
          await salvar({ hubspot_note_id: notaId })
          await hs.associar('notes', notaId, 'contacts', encontrado.id)
        }
        log('nota anexada ao contato existente', { contactId: encontrado.id, noteId: notaId })
        await salvar({
          status_sync: 'enviado',
          hubspot_contact_id: encontrado.id,
          resolucao_duplicado: 'anexar_nota',
          erro_sync: null,
          sincronizado_em: new Date().toISOString(),
        })
        return json({
          status: 'enviado',
          hubspot_contact_id: encontrado.id,
          hubspot_company_id: null,
          hubspot_deal_id: null,
          resolucao_duplicado: 'anexar_nota',
        })
      }

      if (encontrado) {
        // 'criar_assim_mesmo': reaproveita o contato (o HubSpot nao aceita dois
        // contatos com o mesmo e-mail) e segue criando empresa + negocio novos,
        // sem tocar nas properties nem no dono do contato.
        contactId = encontrado.id
        log('seguindo com contato existente por decisao do BDR', contactId)
        await salvar({ hubspot_contact_id: contactId, resolucao_duplicado: 'criar_assim_mesmo' })
      } else {
        const propsContato: Record<string, string> = {
          email,
          firstname,
          phone: lead.telefone,
          company: lead.empresa,
        }
        if (lastname) propsContato.lastname = lastname
        if (lead.cargo) propsContato.jobtitle = lead.cargo
        const siteContato = normalizarSite(lead.site)
        if (siteContato) propsContato.website = siteContato
        propsContato.hubspot_owner_id = ownerId

        const instagramContato = normalizarInstagram(lead.instagram)
        if (instagramContato && config.hubspot.propertyInstagramContato) {
          propsContato[config.hubspot.propertyInstagramContato] = instagramContato
        }

        const contato = await hs.criarContato(propsContato)
        contactId = contato.id
        log('contato criado', contactId)
        await salvar({ hubspot_contact_id: contactId })
      }
    }

    // --- 7. Empresa -------------------------------------------------------
    if (!companyId) {
      const dominio = extrairDominio(lead.site, email)
      const site = normalizarSite(lead.site)
      const instagram = normalizarInstagram(lead.instagram)
      const propInstagram = config.hubspot.propertyInstagramEmpresa

      let jaExistia: { id: string; properties: Record<string, string | null> } | undefined
      if (dominio) {
        const busca = await hs.buscarEmpresaPorDominio(dominio)
        jaExistia = busca.results[0]
        companyId = jaExistia?.id ?? null
      }

      if (!companyId) {
        const propsEmpresa: Record<string, string> = { name: lead.empresa }
        if (dominio) propsEmpresa.domain = dominio
        if (site) propsEmpresa.website = site
        if (instagram && propInstagram) propsEmpresa[propInstagram] = instagram
        propsEmpresa.hubspot_owner_id = ownerId

        const empresa = await hs.criarEmpresa(propsEmpresa)
        companyId = empresa.id
        log('empresa criada', companyId)
      } else {
        // Empresa que ja existia: completa o que esta vazio e nunca sobrescreve.
        // Site e Instagram de uma loja nao mudam por causa de um lead novo, e
        // apagar o que alguem preencheu a mao seria pior do que nao preencher.
        const completar: Record<string, string> = {}
        const atual = jaExistia!.properties

        if (site && !atual.website?.trim()) completar.website = site
        if (instagram && propInstagram && !atual[propInstagram]?.trim()) {
          completar[propInstagram] = instagram
        }

        if (Object.keys(completar).length > 0) {
          try {
            await hs.atualizarEmpresa(companyId, completar)
            log('empresa existente completada', Object.keys(completar))
          } catch (erro) {
            // Campo complementar nao derruba a captura.
            console.warn(
              `[sync-lead][${lead.id}] nao consegui completar a empresa ${companyId}: ` +
                erroLegivel(erro),
            )
          }
        } else {
          log('empresa existente reaproveitada', companyId)
        }
      }
      await salvar({ hubspot_company_id: companyId })
    }

    // --- 8. Negocio -------------------------------------------------------
    if (!dealId) {
      // Nucleo: sem isto o negocio nao serve para nada.
      const nucleo: Record<string, string> = {
        dealname: lead.empresa,
        pipeline: config.hubspot.pipelineId,
        dealstage: config.hubspot.dealStageInicialId,
        // O BDR que captou nasce como proprietario. O workflow do HubSpot
        // migra a propriedade para o closer quando a reuniao e agendada.
        hubspot_owner_id: ownerId,
      }

      if (config.hubspot.propertyBdrResponsavel) {
        nucleo[config.hubspot.propertyBdrResponsavel] = ownerId
      }
      if (config.hubspot.propertyCanal) {
        nucleo[config.hubspot.propertyCanal] = evento.valor_canal || config.hubspot.valorCanal
      }
      if (config.hubspot.propertyDetalhamentoOrigem) {
        nucleo[config.hubspot.propertyDetalhamentoOrigem] = evento.valor_detalhamento_origem
      }
      if (config.hubspot.propertyOrigemNegocio && config.hubspot.valorOrigemNegocio) {
        nucleo[config.hubspot.propertyOrigemNegocio] = config.hubspot.valorOrigemNegocio
      }
      if (config.hubspot.propertyIdCaptura) {
        nucleo[config.hubspot.propertyIdCaptura] = lead.id
      }

      // Espelho: quem e o lead, no proprio negocio. Telefone, e-mail e site nao
      // entram aqui — o contato e a empresa ja os recebem nos campos padrao.
      const espelho: Record<string, string> = {}
      const espelhar = (property: string, valor?: string | null) => {
        if (property && valor?.trim()) espelho[property] = valor.trim()
      }

      espelhar(config.hubspot.propertyNomeLead, lead.nome)
      espelhar(config.hubspot.propertyCargoLead, lead.cargo)
      espelhar(config.hubspot.propertyPlataforma, lead.plataforma_ecommerce)

      let negocio: { id: string }
      try {
        negocio = await hs.criarNegocio({ ...nucleo, ...espelho })
      } catch (erro) {
        // Uma property de espelho mal configurada (nome errado, tipo errado,
        // valor fora de um enum) devolve 400 e derrubaria a captura inteira.
        // Preferimos o negocio sem os campos extras: a nota abaixo continua
        // levando tudo, e o lead nao fica preso no aparelho por causa de
        // configuracao. O aviso fica no log para alguem consertar depois.
        const ehRecusa = erro instanceof hs.HubSpotError && erro.status === 400
        if (!ehRecusa || Object.keys(espelho).length === 0) throw erro

        console.warn(
          `[sync-lead][${lead.id}] HubSpot recusou as properties de espelho ` +
            `(${Object.keys(espelho).join(', ')}). Criando o negocio sem elas. ` +
            `Confira os nomes e tipos: ${erro.corpo}`,
        )
        negocio = await hs.criarNegocio(nucleo)
      }

      dealId = negocio.id
      log('negocio criado', dealId)
      await salvar({ hubspot_deal_id: dealId })
    }

    // --- 9. Associacoes ---------------------------------------------------
    // Idempotentes por natureza: reassociar o mesmo par nao gera duplicata.
    await hs.associar('contacts', contactId!, 'companies', companyId!)
    await hs.associar('deals', dealId!, 'contacts', contactId!)
    await hs.associar('deals', dealId!, 'companies', companyId!)
    log('associacoes aplicadas')

    // --- 10. Nota ---------------------------------------------------------
    // Guiada pelo ID da nota, nao pelo do negocio: um retry que entra com o
    // negocio ja criado e a nota faltando precisa criar a nota.
    if (!existente?.hubspot_note_id) {
      const nota = await hs.criarNota(
        montarNota(lead, evento, appUser.nome),
        new Date().toISOString(),
      )
      await salvar({ hubspot_note_id: nota.id })
      await hs.associar('notes', nota.id, 'deals', dealId!)
      await hs.associar('notes', nota.id, 'contacts', contactId!)
      log('nota criada', nota.id)
    }

    // --- 11. Fechamento ---------------------------------------------------
    await salvar({
      status_sync: 'enviado',
      erro_sync: null,
      sincronizado_em: new Date().toISOString(),
    })

    log('sincronizado com sucesso', { contactId, companyId, dealId })
    return json({
      status: 'enviado',
      hubspot_contact_id: contactId,
      hubspot_company_id: companyId,
      hubspot_deal_id: dealId,
    })
  } catch (erro) {
    const mensagem = erroLegivel(erro)
    console.error(`[sync-lead][${lead.id}] falhou:`, mensagem)

    // Grava o erro, preservando o que ja subiu (contato/empresa/negocio) para
    // o proximo retry retomar de onde parou.
    await admin
      .from('leads')
      .update({ status_sync: 'erro', erro_sync: mensagem.slice(0, 500) })
      .eq('id', lead.id)

    return json({ status: 'erro', erro: mensagem }, 502)
  }
})
