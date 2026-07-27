import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { DayStatus } from '@/lib/progress-compute'

// Shared discipline/completion trend tooltip for the trading overview and the habits tab,
// so both read identically: a date header, a status-coloured "{label} {pct}%" line, and a
// caller-supplied third line (constraint breach / kept count).
//
// Days with nothing scheduled are no longer IN the series (see where the trend is built),
// so there is no "day off" case left to render. A scheduled day you never filled in is in
// the series and plots 0 — but the tooltip names it rather than printing "0%", because
// "you didn't record this" and "you scored nothing" are different facts even when they
// carry the same number.

export interface TrendPoint {
  date: string
  ratio: number
  status: DayStatus
}

const STATUS_TEXT: Record<DayStatus, string> = {
  green: 'text-primary',
  yellow: 'text-amber-500',
  red: 'text-loss',
  pending: 'text-primary/80',
  unlogged: 'text-muted-foreground',
  none: 'text-muted-foreground',
}

function Card({ date, children }: { date: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-2xl">
      <div className="font-medium text-foreground">{date}</div>
      {children}
    </div>
  )
}

export default function TrendTooltip<T extends TrendPoint>({
  active,
  payload,
  disciplineLabel,
  missedLabel,
  renderExtra,
}: {
  active?: boolean
  // recharts injects the payload; each entry's `.payload` is the trend datum.
  payload?: { payload: T }[]
  /** Colored headline, e.g. "Discipline" / "Completion". */
  disciplineLabel: string
  /** Shown for a scheduled day that carries no data ('unlogged' / 'none'). */
  missedLabel: string
  /** Optional third line built from the datum (hard-break, kept count, …). */
  renderExtra?: (d: T) => ReactNode
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  // No data → name it instead of printing the 0 it plots.
  if (d.status === 'none' || d.status === 'unlogged') {
    return (
      <Card date={d.date}>
        <div className="mt-0.5 text-muted-foreground">{missedLabel}</div>
      </Card>
    )
  }
  return (
    <Card date={d.date}>
      <div className={cn('mt-0.5 font-semibold', STATUS_TEXT[d.status])}>
        {disciplineLabel} {Math.round(d.ratio * 100)}%
      </div>
      {renderExtra?.(d)}
    </Card>
  )
}
