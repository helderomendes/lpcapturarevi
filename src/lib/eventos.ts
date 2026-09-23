import type { Evento } from '@/types'

/** "YYYY-MM-DD" de hoje no fuso do aparelho, mesmo formato de `data_inicio`. */
function hojeLocal(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * Entre os eventos que ainda nao terminaram, o de inicio mais perto de hoje —
 * seja o que comeca amanha, seja o que esta acontecendo. Empate favorece o que
 * ainda vai comecar. Se todos ja terminaram, fica o que terminou por ultimo.
 */
export function eventoMaisProximo(lista: Evento[], hoje = hojeLocal()): Evento | null {
  const agora = Date.parse(hoje)
  const naoTerminados = lista.filter((e) => e.data_fim >= hoje)

  if (naoTerminados.length === 0) {
    return [...lista].sort((a, b) => b.data_fim.localeCompare(a.data_fim))[0] ?? null
  }

  const distancia = (e: Evento) => Math.round((Date.parse(e.data_inicio) - agora) / DIA_MS)
  return naoTerminados.sort((a, b) => {
    const da = Math.abs(distancia(a))
    const db = Math.abs(distancia(b))
    if (da !== db) return da - db
    return distancia(b) - distancia(a)
  })[0]
}
