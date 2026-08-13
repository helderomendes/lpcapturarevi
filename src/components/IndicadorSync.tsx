import { Link } from 'react-router-dom'
import { useApp } from '@/contexts/AppContext'
import { Spinner } from '@/components/ui'

/**
 * Indicador de sincronizacao. Sempre visivel — e o que dá ao BDR a confiança de
 * que nenhum lead foi perdido. Cor e texto refletem o estado real da fila.
 */
export function IndicadorSync({ comoLink = true }: { comoLink?: boolean }) {
  const { resumo, sync, online } = useApp()

  const pendentesTotal = resumo.pendentes
  const problemas = resumo.erros + resumo.duplicados

  let cor = 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
  let texto = 'Tudo sincronizado'

  if (problemas > 0) {
    cor = 'border-red-400/40 bg-red-500/10 text-red-200'
    texto = problemas === 1 ? '1 com erro' : `${problemas} com erro`
  } else if (pendentesTotal > 0) {
    cor = 'border-amber-400/40 bg-amber-400/10 text-amber-200'
    texto = pendentesTotal === 1 ? '1 pendente' : `${pendentesTotal} pendentes`
  }

  const conteudo = (
    <span
      className={`inline-flex min-h-[40px] items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${cor}`}
    >
      {sync.rodando ? (
        <Spinner className="h-3.5 w-3.5" />
      ) : (
        <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
      )}
      {texto}
      {!online && <span className="text-white/50">· offline</span>}
    </span>
  )

  if (!comoLink) return conteudo

  return (
    <Link to="/fila" aria-label={`Fila de sincronização: ${texto}`}>
      {conteudo}
    </Link>
  )
}

/** Aviso efemero de sucesso: "3 leads enviados". */
export function AvisoSync() {
  const { sync } = useApp()
  if (!sync.aviso) return null

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <div className="glass-forte rounded-full px-5 py-3 text-sm font-semibold text-emerald-200 shadow-2xl">
        {sync.aviso}
      </div>
    </div>
  )
}
