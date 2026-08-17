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
  criarAcesso,
  criarEvento,
  listarEquipe,
  listarTodosOsEventos,
  listarTodosOsLeads,
  type AcessoCriado,
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
  const [equipe, setEquipe] = useState<Usuario[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [criado, setCriado] = useState<AcessoCriado | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)

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

  const alternar = async (usuario: Usuario) => {
    setOcupado(usuario.id)
    setErro(null)
    try {
      await alternarUsuarioAtivo(usuario.id, !usuario.ativo)
      await recarregar()
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
              <li
                key={pessoa.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {pessoa.nome}
                    {!pessoa.ativo && <span className="ml-2 text-xs text-white/40">inativo</span>}
                  </p>
                  <p className="truncate text-xs text-white/45">
                    {pessoa.email} · owner {pessoa.hubspot_owner_id} · {pessoa.papel}
                  </p>
                </div>
                <Botao
                  variante={pessoa.ativo ? 'fantasma' : 'secundario'}
                  className="!min-h-[40px] !py-1.5 !text-sm"
                  carregando={ocupado === pessoa.id}
                  onClick={() => void alternar(pessoa)}
                >
                  {pessoa.ativo ? 'Desativar' : 'Reativar'}
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
