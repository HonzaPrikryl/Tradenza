import { describe, it, expect } from 'vitest'
import { buildImportMapping } from './csv-columns'
import { resolveSideAndQuantity, parseNumber, parseDateInTz } from './actions/wizard-helpers'

// Regression coverage for the DeepCharts "Signal Performance → Export CSV" format:
//   Symbol;Quantity;Entry DT;Entry Price;Exit DT;Exit Price;ProfitLoss
// It ships no side column (direction = sign of Quantity), uses combined
// date+time columns, millisecond exit timestamps, and a ";" delimiter.
const HEADERS = ['Symbol', 'Quantity', 'Entry DT', 'Entry Price', 'Exit DT', 'Exit Price', 'ProfitLoss']

// A representative slice of a real export: one long, two shorts, a ms exit stamp.
const SAMPLE = [
  {
    Symbol: 'MNQ',
    Quantity: '6',
    'Entry DT': '2026-07-06 16:23:15',
    'Entry Price': '30026.5',
    'Exit DT': '2026-07-06 16:27:37.915',
    'Exit Price': '30024.75',
    ProfitLoss: '-21',
  },
  {
    Symbol: 'MNQ',
    Quantity: '-4',
    'Entry DT': '2026-07-09 16:29:34',
    'Entry Price': '29753',
    'Exit DT': '2026-07-09 16:31:29.592',
    'Exit Price': '29700.25',
    ProfitLoss: '211',
  },
  {
    Symbol: 'MNQ',
    Quantity: '-2',
    'Entry DT': '2026-07-10 15:55:45',
    'Entry Price': '29908.75',
    'Exit DT': '2026-07-10 15:57:33.627',
    'Exit Price': '29915',
    ProfitLoss: '-25',
  },
]

describe('DeepCharts CSV import', () => {
  it('auto-maps all 7 columns with no manual mapping', () => {
    expect(buildImportMapping(HEADERS)).toEqual({
      symbol: 'Symbol',
      quantity: 'Quantity',
      entryPrice: 'Entry Price',
      exitPrice: 'Exit Price',
      entryDate: 'Entry DT',
      exitDate: 'Exit DT',
      netPnl: 'ProfitLoss',
    })
  })

  it('derives direction from the quantity sign and stores a positive size', () => {
    const results = SAMPLE.map((r) => resolveSideAndQuantity(undefined, parseNumber(r.Quantity)))
    expect(results).toEqual([
      { direction: 'long', quantity: 6 },
      { direction: 'short', quantity: 4 },
      { direction: 'short', quantity: 2 },
    ])
  })

  it('parses plain and millisecond datetimes in the chosen timezone, exit >= entry', () => {
    for (const r of SAMPLE) {
      const entry = parseDateInTz(r['Entry DT'], 'America/New_York')
      const exit = parseDateInTz(r['Exit DT'], 'America/New_York')
      expect(entry).not.toBeNull()
      expect(exit).not.toBeNull()
      expect(exit!.getTime()).toBeGreaterThanOrEqual(entry!.getTime())
    }
  })

  it('preserves the sign of the provided ProfitLoss', () => {
    expect(SAMPLE.map((r) => parseNumber(r.ProfitLoss))).toEqual([-21, 211, -25])
  })
})
