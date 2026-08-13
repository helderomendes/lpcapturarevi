import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header } from '@/components/Header'
import { Logo } from '@/components/Logo'
import { Botao, Campo, CampoSelect, CampoTexto, Card } from '@/components/ui'
import {
  PLATAFORMAS_ECOMMERCE,
  PLATAFORMA_OUTRA,
  SEGUNDOS_TELA_OBRIGADO,
  TEXTO_LGPD,
  VALOR_HUBSPOT_PLATAFORMA,
} from '@/config/app'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { obterLead, salvarLead } from '@/lib/db'
import { sincronizar } from '@/lib/sync'
import {
  mascararTelefone,
  novoId,
  temErro,
  validarObrigatorios,
  type ErrosCampo,
} from '@/lib/validacao'
import type { Lead, Temperatura } from '@/types'

type Modo = 'bdr' | 'cliente'

interface Formulario {
  nome: string
  telefone: string
  email: string
  empresa: string
  cargo: string
  site: string
  instagram: string
  plataforma: string
  plataformaOutra: string
  temperatura: Temperatura | ''
  observacoes: string
  consentimento: boolean
}

const FORM_VAZIO: Formulario = {
  nome: '',
  telefone: '',
  email: '',
  empresa: '',
  cargo: '',
  site: '',
  instagram: '',
  plataforma: '',
  plataformaOutra: '',
  temperatura: '',
  observacoes: '',
  consentimento: false,
}

const TEMPERATURAS: { valor: Temperatura; rotulo: string; classe: string }[] = [
  { valor: 'quente', rotulo: 'Quente', classe: 'border-red-400/50 bg-red-500/15 text-red-100' },
  { valor: 'morno', rotulo: 'Morno', classe: 'border-amber-400/50 bg-amber-400/15 text-amber-100' },
  { valor: 'frio', rotulo: 'Frio', classe: 'border-sky-400/50 bg-sky-400/15 text-sky-100' },
]

export function Captura() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const { usuario } = useAuth()
  const { evento, atualizar } = useApp()

  const editando = Boolean(id)
  const [form, setForm] = useState<Formulario>(FORM_VAZIO)
  const [erros, setErros] = useState<ErrosCampo>({})
  const [modo, setModo] = useState<Modo>('bdr')
  const [salvando, setSalvando] = useState(false)
  const [obrigado, setObrigado] = useState(false)
  const [leadOriginal, setLeadOriginal] = useState<Lead | null>(null)
  const [carregandoLead, setCarregandoLead] = useState(editando)

  const definir = useCallback(<C extends keyof Formulario>(campo: C, valor: Formulario[C]) => {
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
  }, [])

  // Edicao: carrega o lead e forca o modo BDR (campos internos ficam visiveis).
  useEffect(() => {
    if (!id) return
    let ativo = true
    void obterLead(id).then((lead) => {
      if (!ativo) return
      if (!lead) {
        navegar('/', { replace: true })
        return
      }
      setLeadOriginal(lead)
      setModo('bdr')
      setForm({
        nome: lead.nome,
        telefone: lead.telefone,
        email: lead.email,
        empresa: lead.empresa,
        cargo: lead.cargo ?? '',
        site: lead.site ?? '',
        instagram: lead.instagram ?? '',
        plataforma: lead.plataforma_outra ? 'Outra' : (lead.plataforma_ecommerce ?? ''),
        plataformaOutra: lead.plataforma_outra ?? '',
        temperatura: lead.temperatura ?? '',
        observacoes: lead.observacoes ?? '',
        consentimento: lead.consentimento_lgpd,
      })
      setCarregandoLead(false)
    })
    return () => {
      ativo = false
    }
  }, [id, navegar])

  const opcoesPlataforma = useMemo(() => [...PLATAFORMAS_ECOMMERCE, 'Outra'], [])

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    if (!usuario || !evento) return

    const novosErros = validarObrigatorios(form)
    // O consentimento so e obrigatorio quando o proprio visitante preenche.
    if (modo === 'cliente' && !form.consentimento) {
      novosErros.consentimento = 'É necessário aceitar para continuar'
    }
    setErros(novosErros)
    if (temErro(novosErros)) {
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      return
    }

    setSalvando(true)

    const agora = new Date().toISOString()
    const ehOutra = form.plataforma === 'Outra'
    const plataformaHubspot = ehOutra
      ? PLATAFORMA_OUTRA
      : form.plataforma
        ? (VALOR_HUBSPOT_PLATAFORMA[form.plataforma] ?? form.plataforma)
        : null

    const lead: Lead = {
      id: leadOriginal?.id ?? novoId(),
      evento_id: leadOriginal?.evento_id ?? evento.id,
      capturado_por: usuario.id,

      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      email: form.email.trim().toLowerCase(),
      empresa: form.empresa.trim(),
      cargo: form.cargo.trim() || null,
      site: form.site.trim() || null,
      instagram: form.instagram.trim() || null,

      plataforma_ecommerce: plataformaHubspot,
      plataforma_outra: ehOutra ? form.plataformaOutra.trim() || null : null,
      temperatura: form.temperatura || null,
      observacoes: form.observacoes.trim() || null,

      consentimento_lgpd: form.consentimento,
      consentimento_em: form.consentimento
        ? (leadOriginal?.consentimento_em ?? agora)
        : null,

      agendou_reuniao: leadOriginal?.agendou_reuniao ?? false,

      // Lead ja enviado ao HubSpot nao volta para a fila: reenviar seria no-op
      // (o backend deduplica pelo UUID) e daria falsa sensacao de atualizacao.
      status_sync: leadOriginal?.status_sync === 'enviado' ? 'enviado' : 'pendente',
      erro_sync: null,
      resolucao_duplicado: leadOriginal?.resolucao_duplicado ?? null,
      duplicado_owner_nome: leadOriginal?.duplicado_owner_nome ?? null,

      hubspot_contact_id: leadOriginal?.hubspot_contact_id ?? null,
      hubspot_company_id: leadOriginal?.hubspot_company_id ?? null,
      hubspot_deal_id: leadOriginal?.hubspot_deal_id ?? null,

      tentativas: 0,
      proximo_retry_em: null,
      // Modo cliente segura o envio ate o BDR complementar; no modo BDR o lead
      // ja sai completo e vai direto para a fila.
      aguardando_bdr: modo === 'cliente',

      criado_em: leadOriginal?.criado_em ?? agora,
      sincronizado_em: leadOriginal?.sincronizado_em ?? null,
      atualizado_em: agora,
    }

    // Salvamento otimista: grava local e confirma na hora. A rede vem depois.
    await salvarLead(lead)
    await atualizar()
    setSalvando(false)

    // Sincroniza em background — o BDR nunca espera a rede.
    void sincronizar(usuario.id).then(atualizar)

    if (modo === 'cliente') {
      setObrigado(true)
      return
    }
    navegar(`/salvo/${lead.id}`, { replace: true })
  }

  if (carregandoLead) return null

  // -------------------------------------------------------------------------
  // Modo cliente: tela de obrigado + volta automatica ao estado neutro.
  // -------------------------------------------------------------------------
  if (obrigado) {
    return (
      <TelaObrigado
        aoTerminar={() => {
          setForm(FORM_VAZIO)
          setErros({})
          setObrigado(false)
        }}
      />
    )
  }

  const jaEnviado = leadOriginal?.status_sync === 'enviado'

  return (
    <div className="min-h-full pb-16">
      {/* No modo cliente o header some: o visitante nao navega pelo app. */}
      {modo === 'cliente' ? (
        <div className="flex items-center justify-center border-b border-white/10 py-5 text-white">
          <Logo className="h-7 w-auto" />
        </div>
      ) : (
        <Header voltarPara="/" titulo={editando ? 'Editar lead' : 'Novo lead'} />
      )}

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        {/* O seletor some no modo cliente: com ele na tela, o visitante voltaria
            aos campos internos com um toque, e a saida protegida por "segurar"
            nao valeria de nada. */}
        {!editando && modo === 'bdr' && <SeletorModo aoTrocar={setModo} />}

        {jaEnviado && (
          <Card className="border-white/15 bg-white/[0.06]">
            <p className="text-sm text-white/70">
              Este lead já foi enviado ao HubSpot. Edições feitas aqui ficam apenas no
              registro local — atualize o negócio direto no HubSpot se precisar.
            </p>
          </Card>
        )}

        <form onSubmit={salvar} className="space-y-4" noValidate>
          <Card className="space-y-4">
            <Campo
              id="nome"
              rotulo="Nome"
              obrigatorio
              autoComplete="name"
              autoCapitalize="words"
              value={form.nome}
              erro={erros.nome}
              onChange={(e) => definir('nome', e.target.value)}
            />
            <Campo
              id="telefone"
              rotulo="Telefone"
              obrigatorio
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(47) 99999-9999"
              value={form.telefone}
              erro={erros.telefone}
              onChange={(e) => definir('telefone', mascararTelefone(e.target.value))}
            />
            <Campo
              id="email"
              rotulo="E-mail"
              obrigatorio
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={form.email}
              erro={erros.email}
              onChange={(e) => definir('email', e.target.value)}
            />
            <Campo
              id="empresa"
              rotulo="Empresa"
              obrigatorio
              autoComplete="organization"
              autoCapitalize="words"
              value={form.empresa}
              erro={erros.empresa}
              onChange={(e) => definir('empresa', e.target.value)}
            />
            <Campo
              id="cargo"
              rotulo="Cargo"
              autoComplete="organization-title"
              value={form.cargo}
              onChange={(e) => definir('cargo', e.target.value)}
            />
            <Campo
              id="site"
              rotulo="Site"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="loja.com.br"
              value={form.site}
              onChange={(e) => definir('site', e.target.value)}
            />
            <Campo
              id="instagram"
              rotulo="Instagram"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="@loja"
              value={form.instagram}
              onChange={(e) => definir('instagram', e.target.value)}
            />
          </Card>

          {/* ------------------------------------------------------------- */}
          {/* Campos internos: invisiveis quando o tablet esta com o visitante */}
          {/* ------------------------------------------------------------- */}
          {modo === 'bdr' && (
            <Card className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
                Complemento do BDR
              </p>

              <CampoSelect
                id="plataforma"
                rotulo="Plataforma de e-commerce"
                opcoes={opcoesPlataforma}
                value={form.plataforma}
                onChange={(e) => definir('plataforma', e.target.value)}
              />
              {form.plataforma === 'Outra' && (
                <Campo
                  id="plataformaOutra"
                  rotulo="Qual plataforma?"
                  value={form.plataformaOutra}
                  onChange={(e) => definir('plataformaOutra', e.target.value)}
                />
              )}

              <div>
                <span className="rotulo">Temperatura</span>
                <div className="grid grid-cols-3 gap-2">
                  {TEMPERATURAS.map((opcao) => {
                    const ativo = form.temperatura === opcao.valor
                    return (
                      <button
                        key={opcao.valor}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() =>
                          definir('temperatura', ativo ? '' : opcao.valor)
                        }
                        className={[
                          'min-h-[56px] rounded-xl border text-base font-semibold transition',
                          ativo
                            ? opcao.classe
                            : 'border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08]',
                        ].join(' ')}
                      >
                        {opcao.rotulo}
                      </button>
                    )
                  })}
                </div>
              </div>

              <CampoTexto
                id="observacoes"
                rotulo="Observações"
                rows={6}
                placeholder="O que ele falou, dor principal, objeção, quem decide."
                dica="É isso que faz o closer chegar preparado na reunião."
                value={form.observacoes}
                onChange={(e) => definir('observacoes', e.target.value)}
              />

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-6 w-6 min-h-0 shrink-0 accent-revi-500"
                  checked={form.consentimento}
                  onChange={(e) => definir('consentimento', e.target.checked)}
                />
                <span className="text-sm text-white/70">
                  O visitante autorizou contato por e-mail e WhatsApp (LGPD).
                </span>
              </label>
            </Card>
          )}

          {/* ------------------------------------------------------------- */}
          {/* Consentimento no modo cliente: obrigatorio, curto e claro.      */}
          {/* ------------------------------------------------------------- */}
          {modo === 'cliente' && (
            <Card className={erros.consentimento ? 'border-red-400/50' : ''}>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-7 w-7 min-h-0 shrink-0 accent-revi-500"
                  checked={form.consentimento}
                  onChange={(e) => definir('consentimento', e.target.checked)}
                  aria-invalid={Boolean(erros.consentimento)}
                />
                <span className="text-[15px] leading-relaxed text-white/80">{TEXTO_LGPD}</span>
              </label>
              {erros.consentimento && (
                <p role="alert" className="mt-2 text-sm text-red-300">
                  {erros.consentimento}
                </p>
              )}
            </Card>
          )}

          <Botao
            type="submit"
            larguraTotal
            carregando={salvando}
            className="!min-h-[64px] !text-lg"
          >
            {editando ? 'Salvar alterações' : modo === 'cliente' ? 'Enviar' : 'Salvar lead'}
          </Botao>
        </form>

        {modo === 'cliente' && <SairDoModoCliente aoSair={() => setModo('bdr')} />}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Seletor de modo
// ---------------------------------------------------------------------------

function SeletorModo({ aoTrocar }: { aoTrocar: (modo: Modo) => void }) {
  return (
    <div className="glass flex items-center justify-between gap-3 p-3">
      <p className="text-sm text-white/55">Preenchendo você mesmo.</p>
      <button
        type="button"
        onClick={() => aoTrocar('cliente')}
        className="min-h-touch shrink-0 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.11]"
      >
        Entregar o tablet
      </button>
    </div>
  )
}

/**
 * Saida do modo cliente exige segurar o botao: impede que o visitante volte ao
 * app com um toque acidental, sem precisar de senha.
 */
function SairDoModoCliente({ aoSair }: { aoSair: () => void }) {
  const [progresso, setProgresso] = useState(0)
  const timer = useRef<number | null>(null)

  const parar = () => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    setProgresso(0)
  }

  const comecar = () => {
    parar()
    timer.current = window.setInterval(() => {
      setProgresso((atual) => {
        if (atual >= 100) {
          parar()
          aoSair()
          return 0
        }
        return atual + 7
      })
    }, 100)
  }

  useEffect(() => parar, [])

  return (
    <div className="pt-6 text-center">
      <button
        type="button"
        onPointerDown={comecar}
        onPointerUp={parar}
        onPointerLeave={parar}
        onContextMenu={(e) => e.preventDefault()}
        className="relative min-h-touch overflow-hidden rounded-xl px-5 text-sm text-white/30 transition hover:text-white/60"
      >
        <span
          className="absolute inset-y-0 left-0 bg-revi-500/25 transition-[width] duration-100"
          style={{ width: `${progresso}%` }}
          aria-hidden
        />
        <span className="relative">Segure para voltar ao modo BDR</span>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tela de obrigado
// ---------------------------------------------------------------------------

function TelaObrigado({ aoTerminar }: { aoTerminar: () => void }) {
  const [restante, setRestante] = useState(SEGUNDOS_TELA_OBRIGADO)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRestante((atual) => {
        if (atual <= 1) {
          window.clearInterval(timer)
          aoTerminar()
          return 0
        }
        return atual - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [aoTerminar])

  return (
    <main className="flex min-h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-8 text-white">
        <Logo className="h-8 w-auto" />
      </div>
      <div className="glass-forte w-full max-w-md p-10">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-revi-500/20">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-revi-300" fill="none" aria-hidden>
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-semibold">Obrigado!</h1>
        <p className="mt-3 text-white/60">Recebemos seus dados. Em breve entramos em contato.</p>
      </div>
      <p className="mt-6 text-sm text-white/25" aria-live="polite">
        {restante}
      </p>
    </main>
  )
}
