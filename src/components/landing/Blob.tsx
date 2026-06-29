/* ─── Decorative blob ──────────────────────────────────────────────────────────── */
function lightBlobColor(color: string): string {
  return color.replace(/\/\s*([\d.]+)\)/, (_, alpha) => `/ ${Math.min(Number(alpha) * 1.65, 0.34).toFixed(3)})`)
}

export default function Blob({
  className,
  color = 'hsl(var(--primary) / 0.18)',
}: {
  className?: string
  color?: string
}) {
  return (
    <div aria-hidden className={`pointer-events-none absolute rounded-full ${className ?? ''}`}>
      <span
        className="absolute inset-0 rounded-full dark:hidden"
        style={{ background: `radial-gradient(circle, ${lightBlobColor(color)}, transparent 70%)` }}
      />
      <span
        className="absolute inset-0 hidden rounded-full dark:block"
        style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }}
      />
    </div>
  )
}
