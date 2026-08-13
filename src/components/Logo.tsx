/**
 * Logo da Revi. Verde restrito ao ponto do logo — em nenhum outro lugar da UI.
 */
export function Logo({ className = 'h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 32"
      className={className}
      role="img"
      aria-label="Revi"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="24"
        fill="currentColor"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="26"
        fontWeight="600"
        letterSpacing="-1"
      >
        revi
      </text>
      <circle cx="53" cy="8" r="4" fill="#00E58A" />
    </svg>
  )
}
