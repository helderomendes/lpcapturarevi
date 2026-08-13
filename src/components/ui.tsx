import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

// ---------------------------------------------------------------------------
// Botao
// ---------------------------------------------------------------------------

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo'

const VARIANTES: Record<Variante, string> = {
  primario:
    'bg-revi-500 text-white hover:bg-revi-400 active:bg-revi-600 shadow-lg shadow-revi-500/20',
  secundario: 'border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.11]',
  fantasma: 'text-white/70 hover:text-white hover:bg-white/[0.06]',
  perigo: 'border border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20',
}

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  larguraTotal?: boolean
  carregando?: boolean
}

export function Botao({
  variante = 'primario',
  larguraTotal,
  carregando,
  className = '',
  children,
  disabled,
  ...props
}: BotaoProps) {
  return (
    <button
      {...props}
      disabled={disabled || carregando}
      className={[
        'inline-flex min-h-touch items-center justify-center gap-2 rounded-xl px-5 py-3',
        'text-base font-semibold transition',
        'disabled:cursor-not-allowed disabled:opacity-45',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-revi-400',
        VARIANTES[variante],
        larguraTotal ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {carregando && <Spinner />}
      {children}
    </button>
  )
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

interface BaseCampo {
  rotulo: string
  erro?: string
  dica?: string
  obrigatorio?: boolean
}

function Envolucro({
  rotulo,
  erro,
  dica,
  obrigatorio,
  id,
  children,
}: BaseCampo & { id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="rotulo">
        {rotulo}
        {obrigatorio && <span className="ml-1 text-revi-300">*</span>}
      </label>
      {children}
      {/* Erros inline, nunca alert(). */}
      {erro ? (
        <p id={`${id}-erro`} role="alert" className="mt-1.5 text-sm text-red-300">
          {erro}
        </p>
      ) : dica ? (
        <p className="mt-1.5 text-sm text-white/40">{dica}</p>
      ) : null}
    </div>
  )
}

interface CampoProps extends InputHTMLAttributes<HTMLInputElement>, BaseCampo {
  id: string
}

export function Campo({ rotulo, erro, dica, obrigatorio, id, className = '', ...props }: CampoProps) {
  return (
    <Envolucro rotulo={rotulo} erro={erro} dica={dica} obrigatorio={obrigatorio} id={id}>
      <input
        {...props}
        id={id}
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={`campo ${erro ? 'campo-erro' : ''} ${className}`}
      />
    </Envolucro>
  )
}

interface CampoSelectProps extends SelectHTMLAttributes<HTMLSelectElement>, BaseCampo {
  id: string
  opcoes: readonly string[]
  vazio?: string
}

export function CampoSelect({
  rotulo,
  erro,
  dica,
  obrigatorio,
  id,
  opcoes,
  vazio = 'Selecione…',
  className = '',
  ...props
}: CampoSelectProps) {
  return (
    <Envolucro rotulo={rotulo} erro={erro} dica={dica} obrigatorio={obrigatorio} id={id}>
      <select {...props} id={id} className={`campo appearance-none ${className}`}>
        <option value="" className="bg-canvas">
          {vazio}
        </option>
        {opcoes.map((opcao) => (
          <option key={opcao} value={opcao} className="bg-canvas">
            {opcao}
          </option>
        ))}
      </select>
    </Envolucro>
  )
}

interface CampoTextoProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, BaseCampo {
  id: string
}

export function CampoTexto({
  rotulo,
  erro,
  dica,
  obrigatorio,
  id,
  className = '',
  ...props
}: CampoTextoProps) {
  return (
    <Envolucro rotulo={rotulo} erro={erro} dica={dica} obrigatorio={obrigatorio} id={id}>
      <textarea {...props} id={id} className={`campo resize-y ${className}`} />
    </Envolucro>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({
  children,
  className = '',
  forte,
}: {
  children: ReactNode
  className?: string
  forte?: boolean
}) {
  return <div className={`${forte ? 'glass-forte' : 'glass'} p-5 ${className}`}>{children}</div>
}
