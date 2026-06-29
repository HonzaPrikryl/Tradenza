'use client'

export default function RunningPnlChart({
  points,
  target,
  risk,
}: {
  points: number[]
  target: number | null
  risk: number | null
}) {
  const W = 300
  const H = 76
  const min = Math.min(...points, 0, risk ?? 0)
  const max = Math.max(...points, 0, target ?? 0)
  const span = max - min || 1
  const x = (i: number) => (i / (points.length - 1)) * W
  const y = (v: number) => H - ((v - min) / span) * H
  const zeroY = y(0)
  const last = points[points.length - 1]
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${W},${zeroY.toFixed(1)} L0,${zeroY.toFixed(1)} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[76px] w-full" preserveAspectRatio="none">
      <defs>
        <clipPath id="rpnl-profit">
          <rect x="0" y="0" width={W} height={Math.max(0, zeroY)} />
        </clipPath>
        <clipPath id="rpnl-loss">
          <rect x="0" y={Math.max(0, zeroY)} width={W} height={Math.max(0, H - zeroY)} />
        </clipPath>
      </defs>

      {target !== null && target > 0 && (
        <line
          x1="0"
          y1={y(target)}
          x2={W}
          y2={y(target)}
          className="stroke-profit/50"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
      )}
      {risk !== null && risk < 0 && (
        <line
          x1="0"
          y1={y(risk)}
          x2={W}
          y2={y(risk)}
          className="stroke-loss/50"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
      )}
      <line x1="0" y1={zeroY} x2={W} y2={zeroY} className="stroke-border" strokeWidth="1" strokeDasharray="3 3" />

      {/* profit (above zero) / drawdown (below zero) */}
      <path d={area} className="fill-profit/10" clipPath="url(#rpnl-profit)" />
      <path d={area} className="fill-loss/15" clipPath="url(#rpnl-loss)" />

      <path d={line} className={last >= 0 ? 'stroke-profit/60' : 'stroke-loss/60'} strokeWidth="1.5" fill="none" />
    </svg>
  )
}
