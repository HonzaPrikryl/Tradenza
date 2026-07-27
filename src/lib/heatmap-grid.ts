// Calendar-year grid for the contribution-style heatmaps (trading discipline and
// per-habit). A grid is weeks (columns) × 7 weekdays (rows, Sun→Sat), padded to
// whole weeks so every column is full — out-of-year pad days are marked so callers
// can render them blank. All keys are "yyyy-MM-dd", computed in UTC so they never
// drift across DST. Pure + framework-free for reuse and testing.

export interface HeatmapDayCell {
  key: string
  /** False for the leading/trailing pad days that belong to an adjacent year. */
  inYear: boolean
  /** 0=Jan … 11=Dec (of `key`). */
  month: number
  /** Day of month (of `key`). */
  day: number
}

// ─── Cell colours ─────────────────────────────────────────────────────────────
//
// Shared red/yellow/green ramp for both contribution heatmaps (trading discipline
// and aggregated habits), so the two views read identically. Green days ramp by
// intensity with their soft ratio; yellow/red are flat; a no-trade check-in gets one
// flat shade (never the ramp). Keeps the palette in one place.

import type { CSSProperties } from 'react'
import type { DayStatus } from './progress-compute'

/** Green intensity by soft ratio (0.5 → l1, 0.7 → l3, 1.0 → perfect). */
export function greenShadeClass(ratio: number): string {
  if (ratio === 1) return 'heat-perfect'
  if (ratio >= 0.7) return 'heat-l3'
  if (ratio >= 0.5) return 'heat-l1'
  return 'border-muted-foreground/30 bg-muted/50'
}

/** Tailwind classes for a heat cell, or false when the day is out of scope ('none'). */
export function heatStatusClass(d: {
  status: DayStatus
  ratio: number
  cleanNoTrade?: boolean
  away?: boolean
}): string | false {
  // Away days are reported as status 'none' by the scorers so every average ignores them,
  // but they get their own flat shade here: an explicitly marked day off should look
  // different from a day the user simply never touched.
  if (d.away) return 'heat-away'
  // Settled with nothing recorded, on a day something WAS scheduled. Its own hatch: not a
  // score (there's no data to score), not grey out-of-scope (something was expected of
  // you). `pending` can no longer reach a past day — only today is open — so there is one
  // no-data state, not two.
  if (d.status === 'unlogged') return 'heat-unlogged'
  switch (d.status) {
    case 'green':
      // No-trade check-in days get ONE flat shade, never the ratio ramp.
      return d.cleanNoTrade ? 'heat-notrade' : greenShadeClass(d.ratio)
    case 'yellow':
      return 'day-yellow'
    case 'red':
      return 'day-red'
    case 'pending':
      // Today, in progress — a faint fill with a lightly emphasised solid border that
      // reads "not done yet", distinct from grey out-of-scope and from a failed (red)
      // day. No dashed line (it doesn't render on a 12px cell).
      return 'border-primary/70 bg-primary/10'
    default:
      return false
  }
}

/** Perfect (100%) days get a soft glow; everything else none. */
export function heatCellGlow(d: { ratio: number; cleanNoTrade?: boolean }): CSSProperties {
  if (d.ratio === 1 && !d.cleanNoTrade) return { boxShadow: '0 0 7px hsl(var(--primary) / 0.6)' }
  return {}
}

/** Build the weeks×7 grid covering `year`, padded to whole weeks (Sun→Sat). */
export function buildYearGrid(year: number): HeatmapDayCell[][] {
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const start = new Date(jan1)
  start.setUTCDate(jan1.getUTCDate() - jan1.getUTCDay())
  const dec31 = new Date(Date.UTC(year, 11, 31))
  const end = new Date(dec31)
  end.setUTCDate(dec31.getUTCDate() + (6 - dec31.getUTCDay()))

  const weeks: HeatmapDayCell[][] = []
  const cur = new Date(start)
  while (cur <= end) {
    const week: HeatmapDayCell[] = []
    for (let i = 0; i < 7; i++) {
      week.push({
        key: cur.toISOString().slice(0, 10),
        inYear: cur.getUTCFullYear() === year,
        month: cur.getUTCMonth(),
        day: cur.getUTCDate(),
      })
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}
