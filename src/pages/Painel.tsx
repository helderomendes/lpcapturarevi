import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Header } from '@/components/Header'
import { StatusPill } from '@/components/StatusPill'
import { Botao, Campo, CampoSelect, Card, Spinner } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useApp } from '@/contexts/AppContext'
import {
  alternarEventoAtivo,
  alternarUsuarioAtivo,
  atualizarUsuario,
  criarAcesso,
  criarEvento,
  listarEquipe,
  listarTodosOsEventos,
  listarTodosOsLeads,
  type AcessoCriado,
  type EdicaoUsuario,
  type LeadAdmin,
} from '@/lib/admin'
import { emailValido, formatarDataHora } from '@/lib/validacao'
import type { Evento, Papel, Usuario } from '@/types'

type Aba = 'equipe' | 'eventos' | 'leads'

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: 'equipe', rotulo: 'Equipe' },
  { valor: 'eventos', rotulo: 'Eventos' },
  { valor: 'leads', rotulo: 'Leads' },
]

export function Painel() {
  const { usuario, carregando } = useAuth()
  const [aba, setAba] = useState<Aba>('equipe')

  if (carregando) return null
  // O painel é só para admin. Um BDR que digitar a URL volta para a home.
  if (!usuario || usuario.papel !== 'admin') return <Navigate to="/" replace />

  return (
    <div className="min-h-full pb-16">
      <Header voltarPara="/" titulo="Painel" />

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-5">
        <div className="glass grid grid-cols-3 gap-1 p-1">
          {ABAS.map((item) => (
            <button
              key={item.valor}
              type="button"
              onClick={() => setAba(item.valor)}
              aria-pressed={aba === item.valor}
              className={[
                'min-h-touch rounded-xl px-3 text-sm font-semibold transition',
                aba === item.valor
                  ? 'bg-revi-500 text-white'
                  : 'text-white/60 hover:bg-white/[0.06]',
              ].join(' ')}
            >
              {item.rotulo}
            </button>
          ))}
        </div>

        {aba === 'equipe' && <SecaoEquipe />}
        {aba === 'eventos' && <SecaoEventos />}
        {aba === 'leads' && <SecaoLeads />}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

function Erro({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null
  return (
    <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/[0.08] p-3">
      <p className="break-words text-sm text-red-100">{mensagem}</p>
    </div>
  )
}

function Sucesso({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] p-3">
      <p className="text-sm text-emerald-100">{children}</p>
    </div>
  )
}

function Carregando() {
  return (
    <div className="flex justify-center py-10 text-white/35">
      <Spinner className="h-6 w-6" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------

const PAPEIS: Papel[] = ['bdr', 'closer', 'admin']

function SecaoEquipe() {
  const { usuario: eu } = useAuth()
  const [equipe, setEquipe] = useState<Usuario[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [criado, setCriado] = useState<AcessoCriado | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [papel, setPapel] = useState<Papel>('bdr')
  const [errosCampo, setErrosCampo] = useState<Record<string, string | undefined>>({})

  const recarregar = useCallback(async () => {
    try {
      setEquipe(await listarEquipe())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    setErro(null)
    setCriado(null)

    const novos: Record<string, string | undefined> = {}
    if (!emailValido(email)) novos.email = 'E-mail inválido'
    if (senha.length < 8) novos.senha = 'Mínimo de 8 caracteres'
    setErrosCampo(novos)
    if (Object.values(novos).some(Boolean)) return

    setSalvando(true)
    try {
      const resultado = await criarAcesso({ email, nome, senha, papel })
      setCriado(resultado)
      setEmail('')
      setNome('')
      setSenha('')
      setPapel('bdr')
      await recarregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Novo acesso</h2>
          <p className="mt-1 text-sm text-white/50">
            O vínculo com o HubSpot é resolvido pelo e-mail — não precisa procurar owner ID.
            Se a pessoa não tiver usuário no HubSpot, o acesso não é criado.
          </p>
        </div>

        <form onSubmit={enviar} className="space-y-4" noValidate>
          <Campo
            id="novo-email"
            rotulo="E-mail"
            obrigatorio
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nome@userevi.com"
            value={email}
            erro={errosCampo.email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Campo
            id="novo-nome"
            rotulo="Nome"
            dica="Em branco, usa o nome cadastrado no HubSpot."
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <Campo
            id="nova-senha"
            rotulo="Senha provisória"
            obrigatorio
            type="text"
            autoComplete="off"
            spellCheck={false}
            dica="Combine com a pessoa. Repetir o cadastro com o mesmo e-mail troca a senha."
            value={senha}
            erro={errosCampo.senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <CampoSelect
            id="novo-papel"
            rotulo="Papel"
            opcoes={PAPEIS}
            vazio="bdr"
            value={papel}
            onChange={(e) => setPapel((e.target.value || 'bdr') as Papel)}
            dica="Admin vê os leads de todos e acessa este painel."
          />

          <Erro mensagem={erro} />
          {criado && (
            <Sucesso>
              {criado.criou ? 'Acesso criado' : 'Acesso atualizado'} para{' '}
              <b>{criado.nome}</b> — vinculado a <b>{criado.nome_hubspot}</b> no HubSpot
              (owner {criado.hubspot_owner_id}), papel {criado.papel}.
            </Sucesso>
          )}

          <Botao type="submit" larguraTotal carregando={salvando} className="!min-h-[56px]">
            Criar acesso
          </Botao>
        </form>
      </Card>

      {equipe === null ? (
        <Carregando />
      ) : (
        <Card className="space-y-3">
          <h2 className="text-base font-semibold">Equipe ({equipe.length})</h2>
          <ul className="space-y-2">
            {equipe.map((pessoa) => (
              <LinhaUsuario
                key={pessoa.id}
                pessoa={pessoa}
                souEu={pessoa.id === eu?.id}
                recarregar={recarregar}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Uma pessoa da equipe: cabecalho sempre visivel, edicao sob demanda.
//
// Editar aqui e mais do que conveniencia: sem isto, corrigir um nome errado ou
// cadastrar a agenda de alguem exigia SQL no painel do Supabase — e o link de
// reuniao muda de feira para feira.
// ---------------------------------------------------------------------------

function LinhaUsuario({
  pessoa,
  souEu,
  recarregar,
}: {
  pessoa: Usuario
  souEu: boolean
  recarregar: () => Promise<void>
}) {
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [acao, setAcao] = useState<'salvar' | 'ativo' | 'revincular' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [errosCampo, setErrosCampo] = useState<Record<string, string | undefined>>({})

  const [nome, setNome] = useState(pessoa.nome)
  const [email, setEmail] = useState(pessoa.email)
  const [papel, setPapel] = useState<Papel>(pessoa.papel)
  const [link, setLink] = useState(pessoa.link_agendamento ?? '')
  const [senha, setSenha] = useState('')

  /** Descarta o rascunho: reabrir tem que mostrar o que esta salvo. */
  const fechar = () => {
    setNome(pessoa.nome)
    setEmail(pessoa.email)
    setPapel(pessoa.papel)
    setLink(pessoa.link_agendamento ?? '')
    setSenha('')
    setErrosCampo({})
    setErro(null)
    setAviso(null)
    setAberto(false)
  }

  const executar = async (
    qual: 'salvar' | 'ativo' | 'revincular',
    tarefa: () => Promise<unknown>,
    sucesso: string,
  ) => {
    setSalvando(true)
    setAcao(qual)
    setErro(null)
    setAviso(null)
    try {
      await tarefa()
      await recarregar()
      setAviso(sucesso)
      setSenha('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
      setAcao(null)
    }
  }

  const salvar = (evento: FormEvent) => {
    evento.preventDefault()

    const novos: Record<string, string | undefined> = {}
    if (!nome.trim()) novos.nome = 'Informe o nome'
    if (!emailValido(email)) novos.email = 'E-mail inválido'
    if (senha && senha.length < 8) novos.senha = 'Mínimo de 8 caracteres'
    if (link.trim() && !/^https?:\/\//i.test(link.trim())) {
      novos.link = 'Cole a URL completa, começando com https://'
    }
    setErrosCampo(novos)
    if (Object.values(novos).some(Boolean)) return

    // Manda somente o que mudou: omitir e diferente de mandar vazio, e assim
    // um campo que ninguem tocou nunca e reescrito.
    const edicao: EdicaoUsuario = { id: pessoa.id }
    if (nome.trim() !== pessoa.nome) edicao.nome = nome.trim()
    if (email.trim().toLowerCase() !== pessoa.email) edicao.email = email.trim().toLowerCase()
    if (papel !== pessoa.papel) edicao.papel = papel
    if (link.trim() !== (pessoa.link_agendamento ?? '')) edicao.link_agendamento = link.trim()
    if (senha) edicao.senha = senha

    if (Object.keys(edicao).length === 1) {
      setAviso('Nada mudou.')
      return
    }

    void executar('salvar', () => atualizarUsuario(edicao), 'Dados atualizados.')
  }

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {pessoa.nome}
            {souEu && <span className="ml-2 text-xs text-white/35">você</span>}
            {!pessoa.ativo && <span className="ml-2 text-xs text-white/40">inativo</span>}
            {pessoa.link_agendamento && (
              <span className="ml-2 rounded-full border border-revi-400/40 px-2 py-0.5 text-[11px] font-semibold text-revi-200">
                agenda própria
              </span>
            )}
          </p>
          <p className="truncate text-xs text-white/45">
            {pessoa.email} · owner {pessoa.hubspot_owner_id} · {pessoa.papel}
          </p>
        </div>

        <Botao
          variante="secundario"
          className="!min-h-[40px] !py-1.5 !text-sm"
          aria-expanded={aberto}
          onClick={() => (aberto ? fechar() : setAberto(true))}
        >
          {aberto ? 'Fechar' : 'Editar'}
        </Botao>

        {/* Ninguem se tranca fora: o proprio acesso nao tem botao de desativar. */}
        {!souEu && (
          <Botao
            variante={pessoa.ativo ? 'fantasma' : 'secundario'}
            className="!min-h-[40px] !py-1.5 !text-sm"
            carregando={salvando && acao === 'ativo'}
            onClick={() =>
              void executar(
                'ativo',
                () => alternarUsuarioAtivo(pessoa.id, !pessoa.ativo),
                pessoa.ativo ? 'Acesso desativado.' : 'Acesso reativado.',
              )
            }
          >
            {pessoa.ativo ? 'Desativar' : 'Reativar'}
          </Botao>
        )}
      </div>

      {aberto && (
        <form onSubmit={salvar} className="mt-3 space-y-4 border-t border-white/10 pt-3" noValidate>
          <Campo
            id={`ed-${pessoa.id}-nome`}
            rotulo="Nome"
            obrigatorio
            value={nome}
            erro={errosCampo.nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <Campo
            id={`ed-${pessoa.id}-email`}
            rotulo="E-mail"
            obrigatorio
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            dica="Trocar o e-mail troca o login e revincula o owner do HubSpot."
            value={email}
            erro={errosCampo.email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <CampoSelect
            id={`ed-${pessoa.id}-papel`}
            rotulo="Papel"
            opcoes={PAPEIS}
            vazio={pessoa.papel}
            value={papel}
            onChange={(e) => setPapel((e.target.value || pessoa.papel) as Papel)}
            dica={
              souEu
                ? 'Você não pode tirar o próprio acesso de admin.'
                : 'Admin vê os leads de todos e acessa este painel.'
            }
          />
          <Campo
            id={`ed-${pessoa.id}-link`}
            rotulo="Link de reunião"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://meetings.hubspot.com/…"
            dica="Agenda desta pessoa. Vence o link do evento. Em branco, usa o link da feira."
            value={link}
            erro={errosCampo.link}
            onChange={(e) => setLink(e.target.value)}
          />
          <Campo
            id={`ed-${pessoa.id}-senha`}
            rotulo="Nova senha"
            type="text"
            autoComplete="off"
            spellCheck={false}
            dica="Em branco, mantém a senha atual."
            value={senha}
            erro={errosCampo.senha}
            onChange={(e) => setSenha(e.target.value)}
          />

          <div className="flex flex-wrap gap-3">
            <Botao
              type="submit"
              carregando={salvando && acao === 'salvar'}
              className="!min-h-[48px] flex-1"
            >
              Salvar
            </Botao>
            <Botao
              type="button"
              variante="secundario"
              className="!min-h-[48px]"
              carregando={salvando && acao === 'revincular'}
              onClick={() =>
                void executar(
                  'revincular',
                  () => atualizarUsuario({ id: pessoa.id, revincular: true }),
                  'Owner do HubSpot revinculado.',
                )
              }
            >
              Revincular ao HubSpot
            </Botao>
          </div>
        </form>
      )}

      {/* Fora do formulario de proposito: o botao de desativar/reativar vive no
          cabecalho, e o erro dele ficaria invisivel com a edicao fechada. */}
      {(erro || aviso) && (
        <div className="mt-3 space-y-3">
          <Erro mensagem={erro} />
          {aviso && <Sucesso>{aviso}</Sucesso>}
        </div>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

function SecaoEventos() {
  const { atualizar } = useApp()
  const [eventos, setEventos] = useState<Evento[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [detalhamento, setDetalhamento] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [link, setLink] = useState('')
  const [errosCampo, setErrosCampo] = useState<Record<string, string | undefined>>({})

  const recarregar = useCallback(async () => {
    try {
      setEventos(await listarTodosOsEventos())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    setErro(null)
    setAviso(null)

    const novos: Record<string, string | undefined> = {}
    if (!nome.trim()) novos.nome = 'Informe o nome'
    if (!inicio) novos.inicio = 'Informe a data de início'
    if (!fim) novos.fim = 'Informe a data de fim'
    if (inicio && fim && fim < inicio) novos.fim = 'O fim não pode ser antes do início'
    setErrosCampo(novos)
    if (Object.values(novos).some(Boolean)) return

    setSalvando(true)
    try {
      const criado = await criarEvento({
        nome: nome.trim(),
        // Em branco, espelha o nome: é a string que vai para o HubSpot.
        valor_detalhamento_origem: (detalhamento.trim() || nome.trim()),
        data_inicio: inicio,
        data_fim: fim,
        link_agendamento: link.trim() || null,
      })
      setAviso(`Evento "${criado.nome}" criado e ativo.`)
      setNome('')
      setDetalhamento('')
      setInicio('')
      setFim('')
      setLink('')
      await recarregar()
      await atualizar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const alternar = async (evento: Evento) => {
    setOcupado(evento.id)
    setErro(null)
    try {
      await alternarEventoAtivo(evento.id, !evento.ativo)
      await recarregar()
      await atualizar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Novo evento</h2>
          <p className="mt-1 text-sm text-white/50">
            Cadastrar uma feira não exige deploy. O detalhamento de origem é o que segmenta
            os negócios no HubSpot depois.
          </p>
        </div>

        <form onSubmit={enviar} className="space-y-4" noValidate>
          <Campo
            id="ev-nome"
            rotulo="Nome do evento"
            obrigatorio
            placeholder="Magazord Summit 2026"
            value={nome}
            erro={errosCampo.nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <Campo
            id="ev-detalhamento"
            rotulo="Detalhamento de origem"
            dica="Vai exatamente assim para o HubSpot. Em branco, usa o nome do evento."
            value={detalhamento}
            onChange={(e) => setDetalhamento(e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="ev-inicio"
              rotulo="Início"
              obrigatorio
              type="date"
              value={inicio}
              erro={errosCampo.inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
            <Campo
              id="ev-fim"
              rotulo="Fim"
              obrigatorio
              type="date"
              value={fim}
              erro={errosCampo.fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
          <Campo
            id="ev-link"
            rotulo="Link de agendamento"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            dica="Opcional. Em branco, usa o link padrão de revezamento."
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />

          <Erro mensagem={erro} />
          {aviso && <Sucesso>{aviso}</Sucesso>}

          <Botao type="submit" larguraTotal carregando={salvando} className="!min-h-[56px]">
            Criar evento
          </Botao>
        </form>
      </Card>

      {eventos === null ? (
        <Carregando />
      ) : (
        <Card className="space-y-3">
          <h2 className="text-base font-semibold">Eventos ({eventos.length})</h2>
          <ul className="space-y-2">
            {eventos.map((evento) => (
              <li
                key={evento.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {evento.nome}
                    {evento.ativo ? (
                      <span className="ml-2 rounded-full border border-emerald-400/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                        ativo
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-white/40">inativo</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-white/45">
                    {evento.data_inicio} a {evento.data_fim} ·{' '}
                    {evento.valor_detalhamento_origem}
                  </p>
                </div>
                <Botao
                  variante={evento.ativo ? 'fantasma' : 'secundario'}
                  className="!min-h-[40px] !py-1.5 !text-sm"
                  carregando={ocupado === evento.id}
                  onClick={() => void alternar(evento)}
                >
                  {evento.ativo ? 'Desativar' : 'Ativar'}
                </Botao>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Leads de todos
// ---------------------------------------------------------------------------

function SecaoLeads() {
  const [leads, setLeads] = useState<LeadAdmin[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [recarregando, setRecarregando] = useState(false)
  const [filtroEvento, setFiltroEvento] = useState('')
  const [filtroBdr, setFiltroBdr] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  const recarregar = useCallback(async () => {
    setRecarregando(true)
    setErro(null)
    try {
      setLeads(await listarTodosOsLeads())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setRecarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  const opcoes = useMemo(() => {
    const lista = leads ?? []
    return {
      eventos: [...new Set(lista.map((l) => l.evento_nome))].sort(),
      bdrs: [...new Set(lista.map((l) => l.capturado_por_nome))].sort(),
    }
  }, [leads])

  const visiveis = useMemo(() => {
    return (leads ?? []).filter(
      (l) =>
        (!filtroEvento || l.evento_nome === filtroEvento) &&
        (!filtroBdr || l.capturado_por_nome === filtroBdr) &&
        (!filtroStatus || l.status_sync === filtroStatus),
    )
  }, [leads, filtroEvento, filtroBdr, filtroStatus])

  if (leads === null && !erro) return <Carregando />

  return (
    <div className="space-y-4">
      <Erro mensagem={erro} />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            Leads de todos
            <span className="ml-2 text-sm font-normal text-white/45">
              {visiveis.length} de {leads?.length ?? 0}
            </span>
          </h2>
          <Botao
            variante="secundario"
            className="!min-h-[40px] !py-1.5 !text-sm"
            carregando={recarregando}
            onClick={() => void recarregar()}
          >
            Atualizar
          </Botao>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <CampoSelect
            id="f-evento"
            rotulo="Evento"
            opcoes={opcoes.eventos}
            vazio="Todos"
            value={filtroEvento}
            onChange={(e) => setFiltroEvento(e.target.value)}
          />
          <CampoSelect
            id="f-bdr"
            rotulo="Capturado por"
            opcoes={opcoes.bdrs}
            vazio="Todos"
            value={filtroBdr}
            onChange={(e) => setFiltroBdr(e.target.value)}
          />
          <CampoSelect
            id="f-status"
            rotulo="Status"
            opcoes={['pendente', 'enviado', 'erro', 'duplicado']}
            vazio="Todos"
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
          />
        </div>
      </Card>

      {visiveis.length === 0 ? (
        <Card>
          <p className="text-sm text-white/50">
            {(leads?.length ?? 0) === 0
              ? 'Nenhum lead sincronizado ainda. Leads só aparecem aqui depois de subir — o que está pendente vive no aparelho de quem captou.'
              : 'Nenhum lead com esses filtros.'}
          </p>
        </Card>
      ) : (
        /* Tabela larga rola dentro do próprio container: a página nunca rola de lado. */
        <div className="glass overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Capturado por</th>
                <th className="px-4 py-3 font-medium">Evento</th>
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((lead) => (
                <tr key={lead.id} className="border-b border-white/[0.06] last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{lead.nome}</p>
                    <p className="text-xs text-white/45">
                      {lead.empresa} · {lead.email}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-white/70">
                    {lead.capturado_por_nome}
                  </td>
                  <td className="px-4 py-3 text-white/70">{lead.evento_nome}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-white/50">
                    {formatarDataHora(lead.criado_em)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <StatusPill status={lead.status_sync} />
                      {lead.agendou_reuniao && (
                        <span className="text-[11px] text-emerald-200">reunião agendada</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
