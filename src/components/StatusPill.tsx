import type { StatusSync } from '@/types'

const ESTILOS: Record<StatusSync, { texto: string; classe: string }> = {
  pendente: { texto: 'Pendente', classe: 'border-amber-400/40 bg-amber-400/10 text-amber-200' },
  enviado: {
    texto: 'Enviado',
    classe: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  },
  erro: { texto: 'Erro', classe: 'border-red-400/40 bg-red-500/10 text-red-200' },
  duplicado: {
    texto: 'Duplicado',
    classe: 'border-orange-400/40 bg-orange-400/10 text-orange-200',
  },
}

export function StatusPill({ status }: { status: StatusSync }) {
  const { texto, classe } = ESTILOS[status]
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${classe}`}>
      {texto}
    </span>
  )
}
