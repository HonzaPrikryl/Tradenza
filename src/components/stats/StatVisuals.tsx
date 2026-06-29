'use client'

import { cn, compactUnit, type DisplayUnit } from '@/lib/utils'

export function compactCurrency(n: number, currency = 'USD'): string {
  const sym = currency === 'EUR' ? '€' : '$'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1000) {
    const k = abs / 1000
    return `${sign}${sym}${k.toFixed(2).replace(/\.?0+$/, '')}K`
  }
  return `${sign}${sym}${abs.toFixed(0)}`
}

export function AreaSparkline({ points, className }: { points: number[]; className?: string }) {
  const W = 320
  const H = 72
  if (points.length < 2) return <div className={cn('h-[72px] w-full', className)} />
  const min = Math.min(...points, 0)
  const max = Math.max(...points, 0)
  const span = max - min || 1
  const x = (i: number) => (i / (points.length - 1)) * W
  const y = (v: number) => H - ((v - min) / span) * H
  const last = points[points.length - 1]
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const up = last >= 0
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('h-[72px] w-full', className)} preserveAspectRatio="none">
      <path d={area} className={up ? 'fill-profit/15' : 'fill-loss/15'} />
      <path
        d={line}
        className={up ? 'stroke-profit/70' : 'stroke-loss/70'}
        strokeWidth="1.5"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function ProfitFactorDonut({ fraction, className }: { fraction: number; className?: string }) {
  const r = 22
  const c = 2 * Math.PI * r
  const green = Math.max(0, Math.min(1, fraction)) * c
  // viewBox tightly bounds the circle (radius 22 + 3 half-stroke = 25) so the
  // circle sits flush to the top edge — lets it top-align with the WinGauge arc.
  return (
    <svg viewBox="0 0 50 50" className={cn('h-16 w-16 -rotate-90', className)}>
      <circle cx="25" cy="25" r={r} fill="none" className="stroke-loss" strokeWidth="6" />
      <circle
        cx="25"
        cy="25"
        r={r}
        fill="none"
        className="stroke-profit"
        strokeWidth="6"
        strokeDasharray={`${green} ${c - green}`}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function WinGauge({ win, be, loss, className }: { win: number; be: number; loss: number; className?: string }) {
  const total = win + be + loss || 1
  // Geometry of the background semicircle: radius 44, centred horizontally.
  // CY is offset so the top of the 9px-wide stroke sits flush to y=0, letting
  // the arc top-align with the ProfitFactorDonut circle.
  const R = 44
  const CX = 50
  const CY = 48.5
  // Map a fraction [0..1] of the gauge to a point on the top semicircle,
  // sweeping from the left endpoint (6,50) over the top to the right (94,50).
  const point = (frac: number): [number, number] => {
    const a = Math.PI * (1 + frac)
    return [CX + R * Math.cos(a), CY + R * Math.sin(a)]
  }
  const arc = (f0: number, f1: number): string => {
    const [x0, y0] = point(f0)
    const [x1, y1] = point(f1)
    return `M${x0.toFixed(3)},${y0.toFixed(3)} A${R} ${R} 0 0 1 ${x1.toFixed(3)},${y1.toFixed(3)}`
  }

  const segs = [
    { v: win, cls: 'stroke-profit' },
    { v: be, cls: 'stroke-breakeven' },
    { v: loss, cls: 'stroke-loss' },
  ].filter((s) => s.v > 0)

  // Tiny angular overlap so each segment (painted after the previous) fully
  // covers the seam — prevents sub-pixel gaps or color bleed between parts.
  const OVERLAP = 0.006

  let acc = 0
  return (
    <svg viewBox="0 0 100 53" className={cn('h-12 w-[92px]', className)}>
      <path d={arc(0, 1)} fill="none" className="stroke-muted/30" strokeWidth="9" strokeLinecap="round" />
      {segs.map((s, i) => {
        const f0 = acc / total
        acc += s.v
        const f1 = acc / total
        const last = i === segs.length - 1
        return (
          <path
            key={i}
            d={arc(f0, last ? f1 : Math.min(f1 + OVERLAP, 1))}
            fill="none"
            className={s.cls}
            strokeWidth="9"
            strokeLinecap="butt"
          />
        )
      })}
    </svg>
  )
}

export function CountPills({ win, be, loss }: { win: number; be: number; loss: number }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] tabular">
      <span className="rounded-full bg-profit/15 px-1.5 py-0.5 text-profit">{win}</span>
      <span className="rounded-full bg-breakeven/15 px-1.5 py-0.5 text-breakeven">{be}</span>
      <span className="rounded-full bg-loss/15 px-1.5 py-0.5 text-loss">{loss}</span>
    </div>
  )
}

// ── Diverging bar for avg win / avg loss ──
export function WinLossBar({
  win,
  loss,
  currency = 'USD',
  unit = 'dollar',
  className,
}: {
  win: number
  loss: number
  currency?: string
  unit?: DisplayUnit
  className?: string
}) {
  const total = Math.abs(win) + Math.abs(loss) || 1
  const winShare = (Math.abs(win) / total) * 100
  return (
    <div className={cn('w-full', className)}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-profit" style={{ width: `${winShare}%` }} />
        <div className="h-full bg-loss" style={{ width: `${100 - winShare}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs tabular">
        <span className="text-profit">{compactUnit(win, unit, currency)}</span>
        <span className="text-loss">{compactUnit(loss, unit, currency)}</span>
      </div>
    </div>
  )
}
