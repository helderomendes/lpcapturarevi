import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { SYNC } from '@/config/app'
import {
  contarCapturadosHoje,
  eventoCache,
  listarEventos,
  resumoFila,
  salvarEventos,
} from '@/lib/db'
import { assinarSync, limparAviso, sincronizar, type EstadoSync } from '@/lib/sync'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Evento, ResumoFila } from '@/types'

interface AppContexto {
  eventos: Evento[]
  evento: Evento | null
  selecionarEvento: (id: string) => Promise<void>
  resumo: ResumoFila
  capturadosHoje: number
  online: boolean
  sync: EstadoSync
  /** Recarrega contadores e fila. Chame depois de mexer em qualquer lead. */
  atualizar: () => Promise<void>
  sincronizarAgora: () => Promise<void>
  limparAviso: () => void
}

const RESUMO_VAZIO: ResumoFila = { pendentes: 0, erros: 0, duplicados: 0, enviados: 0 }

const Contexto = createContext<AppContexto | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()
  const [eventos, setEventos] = useState<Evento[]>([])
  const [evento, setEvento] = useState<Evento | null>(null)
  const [resumo, setResumo] = useState<ResumoFila>(RESUMO_VAZIO)
  const [capturadosHoje, setCapturadosHoje] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const [sync, setSync] = useState<EstadoSync>({
    rodando: false,
    aviso: null,
    precisaLogin: false,
  })

  useEffect(() => assinarSync(setSync), [])

  const atualizar = useCallback(async () => {
    if (!usuario) {
      setResumo(RESUMO_VAZIO)
      setCapturadosHoje(0)
      return
    }
    const [novoResumo, hoje] = await Promise.all([
      resumoFila(usuario.id),
      contarCapturadosHoje(usuario.id),
    ])
    setResumo(novoResumo)
    setCapturadosHoje(hoje)
  }, [usuario])

  // Eventos: cache local primeiro (funciona offline), rede depois.
  useEffect(() => {
    if (!usuario) {
      setEventos([])
      setEvento(null)
      return
    }
    let ativo = true

    /** O ultimo evento usado ja vem selecionado. O BDR nao escolhe 40x por dia. */
    const escolher = async (lista: Evento[]) => {
      const salvo = await eventoCache.ler(usuario.id)
      const escolhido = lista.find((e) => e.id === salvo) ?? lista[0] ?? null
      if (ativo) setEvento(escolhido)
      if (escolhido && escolhido.id !== salvo) {
        await eventoCache.gravar(usuario.id, escolhido.id)
      }
    }

    const carregar = async () => {
      // 1. Cache primeiro, e ja seleciona. Offline o app precisa estar pronto
      //    para capturar imediatamente — sem depender de nenhuma resposta de
      //    rede, nem mesmo de uma que vai falhar.
      const locais = await listarEventos()
      if (locais.length > 0) {
        if (ativo) setEventos(locais)
        await escolher(locais)
      }

      // 2. Rede depois, como refinamento. Com timeout: uma requisicao pendurada
      //    no Wi-Fi da feira nao pode travar nada.
      try {
        const { data, error } = await supabase
          .from('eventos')
          .select(
            'id, nome, valor_detalhamento_origem, valor_canal, link_agendamento, data_inicio, data_fim, ativo',
          )
          .eq('ativo', true)
          .order('data_inicio', { ascending: false })
          .abortSignal(AbortSignal.timeout(10_000))

        if (error) throw error
        if (data) {
          const remotos = data as Evento[]
          await salvarEventos(remotos)
          if (ativo) setEventos(remotos)
          await escolher(remotos)
        }
      } catch {
        // Offline ou Supabase indisponivel: o cache ja resolveu acima.
        if (locais.length === 0) await escolher([])
      }
    }

    void carregar()
    void atualizar()
    return () => {
      ativo = false
    }
  }, [usuario, atualizar])

  const selecionarEvento = useCallback(
    async (id: string) => {
      if (!usuario) return
      const escolhido = eventos.find((e) => e.id === id) ?? null
      setEvento(escolhido)
      if (escolhido) await eventoCache.gravar(usuario.id, escolhido.id)
    },
    [eventos, usuario],
  )

  const sincronizarAgora = useCallback(async () => {
    if (!usuario) return
    await sincronizar(usuario.id, { manual: true })
    await atualizar()
  }, [usuario, atualizar])

  // Gatilhos de sincronizacao: abertura do app, retorno de conectividade,
  // timer de 60s e volta do app para o primeiro plano.
  useEffect(() => {
    if (!usuario) return

    const rodar = async () => {
      await sincronizar(usuario.id)
      await atualizar()
    }

    void rodar()

    const aoVoltarRede = () => {
      setOnline(true)
      void rodar()
    }
    const aoCairRede = () => setOnline(false)
    const aoFocar = () => {
      if (document.visibilityState === 'visible') void rodar()
    }

    window.addEventListener('online', aoVoltarRede)
    window.addEventListener('offline', aoCairRede)
    document.addEventListener('visibilitychange', aoFocar)
    const timer = window.setInterval(rodar, SYNC.intervaloMs)

    return () => {
      window.removeEventListener('online', aoVoltarRede)
      window.removeEventListener('offline', aoCairRede)
      document.removeEventListener('visibilitychange', aoFocar)
      window.clearInterval(timer)
    }
  }, [usuario, atualizar])

  // O aviso "3 leads enviados" some sozinho.
  useEffect(() => {
    if (!sync.aviso) return
    const timer = window.setTimeout(limparAviso, 4000)
    return () => window.clearTimeout(timer)
  }, [sync.aviso])

  const valor = useMemo<AppContexto>(
    () => ({
      eventos,
      evento,
      selecionarEvento,
      resumo,
      capturadosHoje,
      online,
      sync,
      atualizar,
      sincronizarAgora,
      limparAviso,
    }),
    [
      eventos,
      evento,
      selecionarEvento,
      resumo,
      capturadosHoje,
      online,
      sync,
      atualizar,
      sincronizarAgora,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useApp(): AppContexto {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useApp precisa estar dentro de AppProvider')
  return contexto
}
