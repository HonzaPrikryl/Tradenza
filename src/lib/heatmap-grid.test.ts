import { describe, it, expect } from 'vitest'
import { buildYearGrid, greenShadeClass, heatStatusClass } from './heatmap-grid'
import type { DayStatus } from './progress-compute'

describe('buildYearGrid', () => {
  it('pads to whole weeks (every column has 7 days, Sun→Sat)', () => {
    const weeks = buildYearGrid(2026)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    // First cell is a Sunday, last cell a Saturday (UTC).
    const first = weeks[0][0].key
    const last = weeks[weeks.length - 1][6].key
    expect(new Date(`${first}T00:00:00Z`).getUTCDay()).toBe(0)
    expect(new Date(`${last}T00:00:00Z`).getUTCDay()).toBe(6)
  })

  it('marks leading/trailing pad days as out-of-year', () => {
    const weeks = buildYearGrid(2026)
    const all = weeks.flat()
    const inYear = all.filter((c) => c.inYear)
    // 2026 is not a leap year → 365 in-year days.
    expect(inYear).toHaveLength(365)
    expect(inYear[0].key).toBe('2026-01-01')
    expect(inYear[inYear.length - 1].key).toBe('2026-12-31')
    // Pad days belong to adjacent years.
    expect(all.some((c) => !c.inYear && c.key < '2026-01-01')).toBe(true)
  })

  it('counts 366 in-year days for a leap year', () => {
    const inYear = buildYearGrid(2024)
      .flat()
      .filter((c) => c.inYear)
    expect(inYear).toHaveLength(366)
  })

  it('exposes month/day matching the key', () => {
    const jan1 = buildYearGrid(2026)
      .flat()
      .find((c) => c.key === '2026-03-15')!
    expect(jan1.month).toBe(2) // 0-based March
    expect(jan1.day).toBe(15)
  })
})

describe('greenShadeClass', () => {
  it('ramps green intensity by ratio', () => {
    expect(greenShadeClass(1)).toBe('heat-perfect')
    expect(greenShadeClass(0.8)).toBe('heat-l3')
    expect(greenShadeClass(0.7)).toBe('heat-l3')
    expect(greenShadeClass(0.5)).toBe('heat-l1')
    expect(greenShadeClass(0.4)).toBe('border-muted-foreground/30 bg-muted/50')
  })
})

describe('heatStatusClass', () => {
  it('maps status to the shared palette; green ramps by ratio', () => {
    expect(heatStatusClass({ status: 'green', ratio: 1 })).toBe('heat-perfect')
    expect(heatStatusClass({ status: 'green', ratio: 0.6 })).toBe('heat-l1')
    expect(heatStatusClass({ status: 'yellow', ratio: 0.4 })).toBe('day-yellow')
    expect(heatStatusClass({ status: 'red', ratio: 0.1 })).toBe('day-red')
    expect(heatStatusClass({ status: 'none', ratio: 0 })).toBe(false)
  })

  it('a no-trade check-in green day gets one flat shade, never the ramp', () => {
    expect(heatStatusClass({ status: 'green', ratio: 1, cleanNoTrade: true })).toBe('heat-notrade')
  })
})

// ─── One no-data state, not two ──────────────────────────────────────────────
//
// This briefly had a second "still fillable" shade for days inside a backfill window.
// It was removed with the window itself: EVERY past day can be filled in (back-filling has
// no deadline), so a state claiming otherwise described a rule that doesn't exist.
describe('heatStatusClass — no data', () => {
  const cell = (status: DayStatus) => ({ status, ratio: 0 })

  it('a settled day with nothing recorded gets the hatch', () => {
    expect(heatStatusClass(cell('unlogged'))).toBe('heat-unlogged')
  })

  it('today in progress keeps the live look — it is not a hatch', () => {
    expect(heatStatusClass(cell('pending'))).toBe('border-primary/70 bg-primary/10')
  })

  it('an away day still wins over everything else', () => {
    expect(heatStatusClass({ status: 'unlogged', ratio: 0, away: true })).toBe('heat-away')
  })

  it('a day with nothing scheduled stays uncoloured', () => {
    expect(heatStatusClass(cell('none'))).toBe(false)
  })
})
