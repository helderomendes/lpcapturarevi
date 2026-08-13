import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { IndicadorSync } from '@/components/IndicadorSync'
import { useAuth } from '@/contexts/AuthContext'
import { useApp } from '@/contexts/AppContext'

export function Header({ voltarPara, titulo }: { voltarPara?: string; titulo?: string }) {
  const { usuario } = useAuth()
  const { evento } = useApp()

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        {voltarPara ? (
          <Link
            to={voltarPara}
            aria-label="Voltar"
            className="-ml-2 flex min-h-touch min-w-touch items-center justify-center rounded-xl text-white/70 transition hover:bg-white/[0.06] hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
              <path
                d="M15 19l-7-7 7-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        ) : (
          <Link to="/" aria-label="Início" className="text-white">
            <Logo className="h-6 w-auto" />
          </Link>
        )}

        <div className="min-w-0 flex-1">
          {titulo ? (
            <p className="truncate text-base font-semibold">{titulo}</p>
          ) : (
            <>
              <p className="truncate text-sm font-medium text-white/90">
                {usuario?.nome ?? '—'}
              </p>
              <p className="truncate text-xs text-white/45">
                {evento?.nome ?? 'Nenhum evento selecionado'}
              </p>
            </>
          )}
        </div>

        <IndicadorSync />
      </div>
    </header>
  )
}
