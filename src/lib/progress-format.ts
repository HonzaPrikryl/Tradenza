// Presentation helpers shared by every Discipline surface.
//
// These were four near-identical local copies across DaySummaryPanel, ProgressYearHeatmap,
// HabitsTab and ProgressStats — and they had already drifted (one of them formatted dates
// in the browser's locale instead of the app's). One home, one locale, one status
// vocabulary.

import { t } from '@/i18n'
import { getUiLocale } from '@/i18n/config'
import type { DayStatus } from '@/lib/progress-compute'

/**
 * Display currency for every money figure in the Discipline module.
 *
 * USD app-wide for now — account currency is normalised to USD on write (see accountSchema),
 * so every stored amount is already in one currency and these widgets span all accounts.
 * It lives here, threaded as a prop from the two pages, rather than being defaulted inside
 * `formatCurrency` at each call site: when multi-currency lands there is ONE value to
 * replace instead of a hunt through every widget.
 */
export const DISPLAY_CURRENCY = 'USD'

/** Parse a "yyyy-MM-dd" key as a LOCAL calendar date (never UTC — that shifts the day). */
function localDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "Monday, July 27" — the day panel header. */
export function prettyDate(key: string): string {
  return localDate(key).toLocaleDateString(getUiLocale(), { weekday: 'long', month: 'long', day: 'numeric' })
}

/** "Mon, Jul 27, 2026" — heatmap tooltips, where the year matters. */
export function prettyFullDate(key: string): string {
  return localDate(key).toLocaleDateString(getUiLocale(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** "27 Jul" — inline in a sentence (the streak-repair prompt). */
export function prettyDayMonth(key: string): string {
  return localDate(key).toLocaleDateString(getUiLocale(), { day: 'numeric', month: 'short' })
}

/** Text colour for a heatmap cell's status. */
export function heatStatusTextClass(key: string): string {
  switch (key) {
    case 'away':
      return 'text-sky-400'
    case 'green':
      return 'text-primary'
    case 'yellow':
      return 'text-amber-500'
    case 'red':
      return 'text-loss'
    case 'pending':
      return 'text-primary/80'
    default:
      return 'text-muted-foreground'
  }
}

// ─── Heatmap cell description — one source, two heatmaps ──────────────────────
//
// Both year heatmaps build their tooltip AND their screen-reader label from the single
// description below, so the two can't drift into describing the same day differently.
//
// Constraints are reported as a STATE ("All 3 constraints kept"), never as a ratio: a
// constraint is satisfied by default and never joins the `x/y` counter (see the model note
// in progress-compute), and the eye reads a ratio as a score — "3/3" beside "2/4 tasks"
// turns doing nothing into three points earned. The nouns stay domain-specific (tasks /
// constraints vs. building / avoidance habits); only the structure and statuses are shared.

/** Muted by default; `danger` is a breach, the one thing that must not read as an aside. */
export type HeatLineTone = 'muted' | 'danger'

/** One day, as the heatmap needs to describe it — the shape both domains map onto. */
export interface HeatDaySummary {
  status: DayStatus | undefined
  /** Marked away and actually excused → the day is not measured at all. */
  away?: boolean
  /** TASKS scheduled that day, and how many were done. */
  taskTotal: number
  taskDone: number
  /** CONSTRAINTS scheduled that day, and how many were breached. */
  constraintTotal: number
  constraintBreached: number
  /** Trading only: an explicit no-trade check-in, where tasks deliberately don't apply. */
  cleanNoTrade?: boolean
  /** i18n namespace holding this domain's nouns — see `progress.calendar.tally`. */
  tallyPath: string
}

export interface HeatCellDescription {
  /** Pretty date, for the tooltip heading. */
  date: string
  /** Status key for colouring, or null when the day carries no verdict (nothing scheduled). */
  statusKey: DayStatus | 'away' | null
  /** The coloured verdict line ("On plan", "Not logged", "Not counted — excused", "No record"). */
  statusLabel: string
  /** Lines under the verdict, in order. */
  lines: { text: string; tone: HeatLineTone }[]
}

/**
 * Everything a heatmap cell has to say about one day, in the order it should be said.
 *
 * Two deliberate silences:
 *   • an UNLOGGED day reports no tallies. "All 3 constraints kept" on a day nobody opened
 *     would let silence pass as evidence of a clean day — the exact claim that status exists
 *     to refuse. It gets the "you can still fill it in" line instead.
 *   • on TODAY, intact constraints are provisional ("clean so far"), not kept — the day isn't
 *     over, and the streak logic likewise refuses to bank an unfinished day.
 */
export function describeHeatCell(date: string, day: HeatDaySummary | undefined): HeatCellDescription {
  const pretty = prettyFullDate(date)
  const tally = (key: string, params?: Record<string, string | number>) => t(`${day!.tallyPath}.${key}`, params)

  if (day?.away) return { date: pretty, statusKey: 'away', statusLabel: t('progress.tip.away'), lines: [] }
  if (!day || !day.status || day.status === 'none') {
    return { date: pretty, statusKey: null, statusLabel: t('progress.tip.noRecord'), lines: [] }
  }

  const lines: { text: string; tone: HeatLineTone }[] = []
  if (day.status === 'unlogged') {
    // Two short lines, not one sentence — a tooltip is glanced at, and the consequence and
    // the way out are two different thoughts.
    lines.push({ text: t('progress.tip.unlogged'), tone: 'muted' })
    lines.push({ text: t('progress.tip.unloggedFix'), tone: 'muted' })
  } else {
    if (day.cleanNoTrade) lines.push({ text: t('progress.tip.noTrade'), tone: 'muted' })
    else if (day.taskTotal > 0) {
      lines.push({ text: tally('tasks', { done: day.taskDone, total: day.taskTotal }), tone: 'muted' })
    }
    if (day.constraintTotal > 0) {
      const { constraintTotal: total, constraintBreached: breached } = day
      if (breached > 0) {
        lines.push({
          text: total === 1 ? tally('breachedOne') : tally('breached', { count: breached, total }),
          tone: 'danger',
        })
      } else {
        // Today is unfinished, so an unbroken constraint has been kept only *so far*.
        const key = day.status === 'pending' ? 'keptPending' : total === 1 ? 'keptOne' : 'kept'
        lines.push({ text: tally(key, { total }), tone: 'muted' })
      }
    }
  }

  return { date: pretty, statusKey: day.status, statusLabel: t(`progress.status.${day.status}`), lines }
}

/** Screen-reader name for one cell — the tooltip's description, flattened. */
export function heatCellLabel(date: string, day: HeatDaySummary | undefined): string {
  const d = describeHeatCell(date, day)
  return [`${d.date}: ${d.statusLabel}`, ...d.lines.map((l) => l.text)].join(', ')
}
