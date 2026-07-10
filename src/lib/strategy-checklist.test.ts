import { describe, it, expect } from 'vitest'
import { adherenceOf, computeChecklistAnalytics, type ChecklistTrade } from './strategy-checklist'
import type { TradeRow } from './stats-compute'

function row(netPnl: number): TradeRow {
  return {
    netPnl,
    grossPnl: netPnl,
    fees: 0,
    direction: 'long',
    entryDatetime: new Date('2026-01-01T10:00:00Z'),
    exitDatetime: new Date('2026-01-01T11:00:00Z'),
    riskAmount: null,
    riskRewardRatio: null,
    hasNotes: false,
    notional: null,
  }
}

const ENTRY = ['Above VWAP', 'Volume spike']
const EXIT = ['Target hit']

describe('adherenceOf', () => {
  it('returns null with no criteria or no trades', () => {
    expect(adherenceOf([], ENTRY, EXIT)).toBeNull()
    expect(adherenceOf([{ row: row(1), progress: { entry: [], exit: [] } }], [], [])).toBeNull()
  })

  it('averages the share of ticked criteria across trades', () => {
    const trades: ChecklistTrade[] = [
      // 3/3 ticked
      { row: row(1), progress: { entry: ['Above VWAP', 'Volume spike'], exit: ['Target hit'] } },
      // 0/3 ticked
      { row: row(-1), progress: null },
    ]
    // (1 + 0) / 2 = 0.5 → 50%
    expect(adherenceOf(trades, ENTRY, EXIT)).toBeCloseTo(50)
  })

  it('ignores stale ticks for criteria no longer on the strategy', () => {
    const trades: ChecklistTrade[] = [{ row: row(1), progress: { entry: ['Deleted criterion'], exit: [] } }]
    expect(adherenceOf(trades, ENTRY, EXIT)).toBeCloseTo(0)
  })
})

describe('computeChecklistAnalytics', () => {
  const trades: ChecklistTrade[] = [
    { row: row(100), progress: { entry: ['Above VWAP', 'Volume spike'], exit: ['Target hit'] } }, // full, win
    { row: row(50), progress: { entry: ['Above VWAP'], exit: [] } }, // partial, win
    { row: row(-80), progress: { entry: [], exit: [] } }, // partial, loss
  ]

  it('computes per-criterion followed counts and split win rates', () => {
    const a = computeChecklistAnalytics(trades, ENTRY, EXIT, 'net', null)
    const vwap = a.criteria.find((c) => c.text === 'Above VWAP')!
    expect(vwap.followed).toBe(2)
    expect(vwap.total).toBe(3)
    expect(vwap.followedPct).toBeCloseTo((2 / 3) * 100)
    // followed trades: +100, +50 → 100% win; missed: -80 → 0% win
    expect(vwap.winRateFollowed).toBeCloseTo(100)
    expect(vwap.winRateMissed).toBeCloseTo(0)
    expect(vwap.avgPnlFollowed).toBeCloseTo(75)
    expect(vwap.avgPnlMissed).toBeCloseTo(-80)
  })

  it('splits full vs partial compliance', () => {
    const a = computeChecklistAnalytics(trades, ENTRY, EXIT, 'net', null)
    expect(a.totalCriteria).toBe(3)
    expect(a.full.count).toBe(1)
    expect(a.partial.count).toBe(2)
    expect(a.full.avgPnl).toBeCloseTo(100)
  })
})
