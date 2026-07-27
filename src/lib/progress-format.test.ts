import { describe, it, expect } from 'vitest'
import { describeHeatCell, heatCellLabel, type HeatDaySummary } from './progress-format'

// Both heatmaps render describeHeatCell, so a case verified here holds for both.
const TRADING = 'progress.calendar.tally'
const DAILY = 'progress.habits.year.tally'
const DAY = '2026-07-27'

const day = (over: Partial<HeatDaySummary> = {}): HeatDaySummary => ({
  status: 'green',
  taskTotal: 4,
  taskDone: 4,
  constraintTotal: 3,
  constraintBreached: 0,
  tallyPath: TRADING,
  ...over,
})

const lines = (d: HeatDaySummary | undefined) => describeHeatCell(DAY, d).lines.map((l) => l.text)

describe('describeHeatCell — structure shared by both heatmaps', () => {
  it('reports tasks as a ratio and constraints as a state', () => {
    expect(lines(day())).toEqual(['4/4 tasks', 'All 3 constraints kept'])
    // Same day, same shape, the other tab's nouns.
    expect(lines(day({ tallyPath: DAILY }))).toEqual(['4/4 building habits done', 'All 3 avoidance habits clean'])
  })

  it('names the breach instead of burying it in a ratio', () => {
    const d = day({ status: 'red', taskDone: 2, constraintBreached: 1 })
    expect(lines(d)).toEqual(['2/4 tasks', '1 of 3 constraints breached'])
    expect(describeHeatCell(DAY, d).lines[1].tone).toBe('danger')
    expect(lines({ ...d, tallyPath: DAILY })).toEqual(['2/4 building habits done', '1 of 3 avoidance habits slipped'])
  })

  it('drops the count when only one constraint ran', () => {
    expect(lines(day({ constraintTotal: 1 }))).toEqual(['4/4 tasks', 'Constraint kept'])
    expect(lines(day({ constraintTotal: 1, constraintBreached: 1, status: 'red' }))).toEqual([
      '4/4 tasks',
      'Constraint breached',
    ])
  })

  it('a day of constraints alone still says something', () => {
    expect(lines(day({ taskTotal: 0, taskDone: 0 }))).toEqual(['All 3 constraints kept'])
  })

  it('today keeps its constraints provisional', () => {
    expect(lines(day({ status: 'pending', taskDone: 2 }))).toEqual(['2/4 tasks', '3 constraints clean so far'])
  })

  it('says nothing about tallies on an unlogged day', () => {
    // No tally: "All 3 constraints kept" on a day nobody opened would let silence pass as
    // evidence. Two short lines instead.
    const d = describeHeatCell(DAY, day({ status: 'unlogged' }))
    expect(d.statusLabel).toBe('Not logged')
    expect(d.lines.map((l) => l.text)).toEqual(['Breaks your streak', 'You can still fill it in'])
    expect(describeHeatCell(DAY, day({ status: 'unlogged', tallyPath: DAILY })).statusLabel).toBe('Not logged')
  })

  it('a no-trade check-in replaces the task line, not the constraints', () => {
    const d = day({ cleanNoTrade: true, taskDone: 0 })
    expect(lines(d)).toEqual(['No-trade day', 'All 3 constraints kept'])
  })

  it('an excused day is not measured, so it reports nothing else', () => {
    const d = describeHeatCell(DAY, day({ away: true, status: 'none' }))
    expect(d.statusKey).toBe('away')
    expect(d.statusLabel).toBe('Not counted — excused')
    expect(d.lines).toEqual([])
  })

  it('a day with nothing scheduled reads as no record, in both domains', () => {
    for (const d of [describeHeatCell(DAY, undefined), describeHeatCell(DAY, day({ status: 'none' }))]) {
      expect(d.statusKey).toBeNull()
      expect(d.statusLabel).toBe('No record')
      expect(d.lines).toEqual([])
    }
  })

  it('uses one status vocabulary for both heatmaps', () => {
    for (const path of [TRADING, DAILY]) {
      expect(describeHeatCell(DAY, day({ tallyPath: path })).statusLabel).toBe('On plan')
      expect(describeHeatCell(DAY, day({ tallyPath: path, status: 'yellow' })).statusLabel).toBe('Warning')
      expect(describeHeatCell(DAY, day({ tallyPath: path, status: 'red' })).statusLabel).toBe('Off plan')
    }
  })

  it('never leaks a raw i18n key into the UI', () => {
    const statuses = ['green', 'yellow', 'red', 'pending', 'unlogged', 'none'] as const
    for (const status of statuses) {
      for (const tallyPath of [TRADING, DAILY]) {
        const d = describeHeatCell(DAY, day({ status, tallyPath }))
        for (const text of [d.statusLabel, ...d.lines.map((l) => l.text)]) {
          expect(text).not.toMatch(/^progress\./)
          expect(text).not.toMatch(/\{\w+\}/) // an unfilled placeholder is the same bug
        }
      }
    }
  })
})

describe('heatCellLabel', () => {
  it('is the tooltip, flattened — a keyboard user hears what a mouse user sees', () => {
    const d = day({ status: 'red', taskDone: 2, constraintBreached: 1 })
    expect(heatCellLabel(DAY, d)).toBe('Mon, Jul 27, 2026: Off plan, 2/4 tasks, 1 of 3 constraints breached')
  })

  it('covers the cases the grid renders as bare squares', () => {
    expect(heatCellLabel(DAY, undefined)).toBe('Mon, Jul 27, 2026: No record')
    expect(heatCellLabel(DAY, day({ away: true }))).toBe('Mon, Jul 27, 2026: Not counted — excused')
  })
})
