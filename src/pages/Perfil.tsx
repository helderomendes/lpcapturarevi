import { useEffect, useState, type FormEvent } from 'react'
import { Header } from '@/components/Header'
import { Botao, Campo, Card } from '@/components/ui'
import { useApp } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { lerMeuPerfil, salvarMeuLinkAgendamento } from '@/lib/admin'
import { LINK_AGENDAMENTO_PADRAO } from '@/config/app'

/**
 * "Minha agenda" — cada um cuida do proprio link de reuniao, sem depender de
 * admin. O link muda de feira para feira e quem sabe qual e o certo e a propria
 * pessoa; passar por outra pessoa para trocar uma URL era garantia de link
 * velho no ar no dia do evento.
 */
export function Perfil() {
  const { usuario, atualizarPerfil } = useAuth()
  const { evento } = useApp()

  const [link, setLink] = useState(usuario?.link_agendamento ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Confere no servidor antes de deixar editar: salvar em cima de um cache
  // velho apagaria um link que esta gravado no banco. Offline, segue com o
  // cache — salvar exige rede de qualquer forma.
  useEffect(() => {
    if (!usuario) return
    let ativo = true
    void lerMeuPerfil(usuario.id)
      .then(async (perfil) => {
        if (!ativo) return
        setLink(perfil.link_agendamento ?? '')
        await atualizarPerfil(perfil)
      })
      .catch(() => {
        /* offline: o cache resolve */
      })
    return () => {
      ativo = false
    }
    // Roda uma vez por pessoa: `atualizarPerfil` muda `usuario` e reentraria.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id])

  if (!usuario) return null

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setErro(null)
    setAviso(null)

    const valor = link.trim()
    if (valor && !/^https?:\/\//i.test(valor)) {
      setErro('Cole a URL completa, começando com https://')
      return
    }

    setSalvando(true)
    try {
      const perfil = await salvarMeuLinkAgendamento(valor)
      await atualizarPerfil(perfil)
      setLink(perfil.link_agendamento ?? '')
      setAviso(
        perfil.link_agendamento
          ? 'Agenda salva. Suas próximas capturas usam este link.'
          : 'Link removido. Suas capturas voltam a usar o link do evento.',
      )
    } catch (erroSalvar) {
      setErro(erroSalvar instanceof Error ? erroSalvar.message : String(erroSalvar))
    } finally {
      setSalvando(false)
    }
  }

  // Qual link o app usaria agora, na mesma ordem de precedencia da captura.
  // Mostrar isso aqui responde sozinho a pergunta "em qual agenda vai cair a
  // reuniao?", que e a duvida real de quem abre esta tela.
  const emUso = usuario.link_agendamento?.trim()
    ? { onde: 'a sua agenda', url: usuario.link_agendamento.trim() }
    : evento?.link_agendamento?.trim()
      ? { onde: `o link do evento ${evento.nome}`, url: evento.link_agendamento.trim() }
      : LINK_AGENDAMENTO_PADRAO
        ? { onde: 'o revezamento padrão da Revi', url: LINK_AGENDAMENTO_PADRAO }
        : null

  return (
    <div className="min-h-full pb-16">
      <Header voltarPara="/" titulo="Minha agenda" />

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        <Card className="space-y-1">
          <p className="text-base font-semibold">{usuario.nome}</p>
          <p className="text-sm text-white/45">
            {usuario.email} · {usuario.papel}
          </p>
        </Card>

        <Card className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Link de reunião</h2>
            <p className="mt-1 text-sm text-white/50">
              É para cá que o visitante vai quando você tocar em “Agendar reunião”. Cole o
              link do seu calendário no HubSpot (ou Calendly). Em branco, suas capturas
              usam o link do evento.
            </p>
          </div>

          <form onSubmit={salvar} className="space-y-4" noValidate>
            <Campo
              id="meu-link"
              rotulo="Meu link"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://meetings.hubspot.com/…"
              value={link}
              erro={erro ?? undefined}
              onChange={(e) => setLink(e.target.value)}
            />

            {aviso && (
              <div
                role="status"
                className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] p-3"
              >
                <p className="text-sm text-emerald-100">{aviso}</p>
              </div>
            )}

            <Botao type="submit" larguraTotal carregando={salvando} className="!min-h-[56px]">
              Salvar
            </Botao>
          </form>
        </Card>

        {emUso && (
          <Card className="space-y-1">
            <p className="text-sm text-white/50">
              Agora, neste aparelho, o agendamento usa <b className="text-white/80">{emUso.onde}</b>:
            </p>
            <p className="break-all text-xs text-white/45">{emUso.url}</p>
          </Card>
        )}

        <Card>
          <p className="text-sm text-white/50">
            A ordem é sempre: <b className="text-white/75">sua agenda</b> → link do evento →
            revezamento padrão. Quem tem link próprio recebe as reuniões das próprias
            capturas; quem não tem cai na escala da feira.
          </p>
        </Card>
      </main>
    </div>
  )
}
