import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { usuarioCache } from '@/lib/db'
import type { Usuario } from '@/types'

interface AuthContexto {
  usuario: Usuario | null
  carregando: boolean
  /**
   * Ha usuario em cache mas nao ha sessao valida. O app continua capturando
   * normalmente — o login so e exigido na hora de sincronizar.
   */
  sessaoExpirada: boolean
  entrar: (email: string, senha: string) => Promise<void>
  sair: () => Promise<void>
}

const Contexto = createContext<AuthContexto | null>(null)

async function carregarPerfil(userId: string): Promise<Usuario | null> {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, nome, email, hubspot_owner_id, papel, ativo')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return (data as Usuario) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [sessaoExpirada, setSessaoExpirada] = useState(false)

  useEffect(() => {
    let ativo = true

    const iniciar = async () => {
      // 1. Cache primeiro: em cold start offline e a unica fonte de verdade,
      //    e e o que garante que o BDR consiga capturar sem rede.
      const emCache = await usuarioCache.ler()
      if (ativo && emCache) setUsuario(emCache)

      // 2. Sessao real, quando houver.
      const { data } = await supabase.auth.getSession()
      const sessao = data.session

      if (!sessao) {
        if (ativo) {
          setSessaoExpirada(Boolean(emCache))
          setCarregando(false)
        }
        return
      }

      try {
        const perfil = await carregarPerfil(sessao.user.id)
        if (perfil?.ativo) {
          await usuarioCache.gravar(perfil)
          if (ativo) {
            setUsuario(perfil)
            setSessaoExpirada(false)
          }
        } else if (ativo && !emCache) {
          setUsuario(null)
        }
      } catch {
        // Offline ou Supabase indisponivel: seguimos com o cache.
        if (ativo) setSessaoExpirada(!emCache)
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    void iniciar()

    const { data: assinatura } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'SIGNED_OUT') {
        setUsuario(null)
        setSessaoExpirada(false)
        void usuarioCache.limpar()
        return
      }
      if (sessao) {
        setSessaoExpirada(false)
        void carregarPerfil(sessao.user.id)
          .then(async (perfil) => {
            if (perfil?.ativo) {
              await usuarioCache.gravar(perfil)
              setUsuario(perfil)
            }
          })
          .catch(() => {
            /* offline: o cache resolve */
          })
      }
    })

    return () => {
      ativo = false
      assinatura.subscription.unsubscribe()
    }
  }, [])

  const entrar = useCallback(async (email: string, senha: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    })
    if (error) throw new Error(traduzirErroLogin(error.message))
    if (!data.user) throw new Error('Não foi possível entrar')

    const perfil = await carregarPerfil(data.user.id)
    if (!perfil) {
      await supabase.auth.signOut()
      throw new Error('Usuário sem cadastro em app_users. Fale com o admin.')
    }
    if (!perfil.ativo) {
      await supabase.auth.signOut()
      throw new Error('Usuário inativo.')
    }

    await usuarioCache.gravar(perfil)
    setUsuario(perfil)
    setSessaoExpirada(false)
  }, [])

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
    await usuarioCache.limpar()
    setUsuario(null)
    setSessaoExpirada(false)
  }, [])

  const valor = useMemo<AuthContexto>(
    () => ({ usuario, carregando, sessaoExpirada, entrar, sair }),
    [usuario, carregando, sessaoExpirada, entrar, sair],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

function traduzirErroLogin(mensagem: string): string {
  if (/invalid login credentials/i.test(mensagem)) return 'E-mail ou senha incorretos'
  if (/email not confirmed/i.test(mensagem)) return 'E-mail ainda não confirmado'
  if (/failed to fetch|network/i.test(mensagem)) {
    return 'Sem conexão. Conecte-se para fazer o primeiro login.'
  }
  return mensagem
}

export function useAuth(): AuthContexto {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useAuth precisa estar dentro de AuthProvider')
  return contexto
}
