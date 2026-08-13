// =============================================================================
// Validacao e formatacao. Erros sempre inline na UI — nunca alert().
// =============================================================================

/** UUID v4 gerado no dispositivo. Serve de chave de idempotencia no backend. */
export function novoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback para WebViews antigas sem crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/**
 * Mascara BR aceitando fixo (10 digitos) e celular (11).
 * Formata progressivamente enquanto o usuario digita.
 */
export function mascararTelefone(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function telefoneValido(valor: string): boolean {
  const d = apenasDigitos(valor)
  if (d.length !== 10 && d.length !== 11) return false
  const ddd = Number(d.slice(0, 2))
  if (ddd < 11 || ddd > 99) return false
  // Celular no Brasil sempre comeca com 9 apos o DDD.
  if (d.length === 11 && d[2] !== '9') return false
  return true
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function emailValido(valor: string): boolean {
  return RE_EMAIL.test(valor.trim())
}

export interface ErrosCampo {
  [campo: string]: string | undefined
}

interface CamposObrigatorios {
  nome: string
  telefone: string
  email: string
  empresa: string
}

/** Nome, telefone, e-mail e empresa sao obrigatorios. O resto e complemento. */
export function validarObrigatorios(valores: CamposObrigatorios): ErrosCampo {
  const erros: ErrosCampo = {}

  if (!valores.nome.trim()) erros.nome = 'Informe o nome'
  else if (valores.nome.trim().length < 2) erros.nome = 'Nome muito curto'

  if (!valores.telefone.trim()) erros.telefone = 'Informe o telefone'
  else if (!telefoneValido(valores.telefone)) erros.telefone = 'Telefone inválido'

  if (!valores.email.trim()) erros.email = 'Informe o e-mail'
  else if (!emailValido(valores.email)) erros.email = 'E-mail inválido'

  if (!valores.empresa.trim()) erros.empresa = 'Informe a empresa'

  return erros
}

export function temErro(erros: ErrosCampo): boolean {
  return Object.values(erros).some(Boolean)
}

export function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
