// UI helpers for per-rule schedules (ISO weekdays 1=Mon … 7=Sun).
// Compute-side logic lives in progress-compute.ts; this is presentation only.

import { t, tList } from '@/i18n'

export const WEEKDAYS_PRESET: readonly number[] = [1, 2, 3, 4, 5]

/** Short label of an ISO weekday from the datepicker locale list (Sun-first). */
export function isoWeekdayShort(iso: number): string {
  return tList('datepicker.weekdaysShort')[iso % 7]
}

/** Minimal (2-letter) label of an ISO weekday. */
export function isoWeekdayMin(iso: number): string {
  return tList('datepicker.weekdaysMin')[iso % 7]
}

/**
 * Compact schedule label: "Daily", "Mon–Fri", "Sat, Sun", "Mon, Wed, Fri", …
 * Contiguous runs of ≥3 days collapse into ranges.
 */
export function scheduleLabel(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  if (sorted.length === 7) return t('progress.rules.schedule.daily')

  const parts: string[] = []
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    if (j - i >= 2) parts.push(`${isoWeekdayShort(sorted[i])}–${isoWeekdayShort(sorted[j])}`)
    else for (let k = i; k <= j; k++) parts.push(isoWeekdayShort(sorted[k]))
    i = j + 1
  }
  return parts.join(', ')
}
