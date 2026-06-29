import { describe, it, expect } from 'vitest'
import { computeBundle, type TradeRow } from './stats-compute'

// Dates use the local-time constructor so day-grouping (which formats in local
// time) is deterministic regardless of the machine timezone.
const rows: TradeRow[] = [
  {
    direction: 'long',
    netPnl: 100,
    grossPnl: 110,
    fees: 10,
    entryDatetime: new Date(2026, 0, 5, 9, 30),
    exitDatetime: new Date(2026, 0, 5, 10, 30),
    riskAmount: 50,
    riskRewardRatio: 2,
    hasNotes: true,
  },
  {
    direction: 'short',
    netPnl: -50,
    grossPnl: -45,
    fees: 5,
    entryDatetime: new Date(2026, 0, 5, 11, 0),
    exitDatetime: new Date(2026, 0, 5, 11, 30),
    riskAmount: 50,
    riskRewardRatio: null,
    hasNotes: false,
  },
  {
    direction: 'long',
    netPnl: 200,
    grossPnl: 210,
    fees: 10,
    entryDatetime: new Date(2026, 0, 6, 9, 30),
    exitDatetime: new Date(2026, 0, 6, 12, 30),
    riskAmount: 100,
    riskRewardRatio: 3,
    hasNotes: false,
  },
  {
    direction: 'long',
    netPnl: 0,
    grossPnl: 0,
    fees: 0,
    entryDatetime: new Date(2026, 0, 6, 13, 0),
    exitDatetime: null, // open / scratch
    riskAmount: null,
    riskRewardRatio: null,
    hasNotes: false,
  },
]

describe('computeBundle (net)', () => {
  const b = computeBundle(rows, 'net')

  it('counts trades by outcome', () => {
    expect(b.hasData).toBe(true)
    expect(b.totalTrades).toBe(4)
    expect(b.winningTrades).toBe(2)
    expect(b.losingTrades).toBe(1)
    expect(b.breakEvenTrades).toBe(1)
  })

  it('aggregates P&L', () => {
    expect(b.totalPnl).toBe(250)
    expect(b.avgTradePnl).toBe(62.5)
    expect(b.avgWin).toBe(150)
    expect(b.avgLoss).toBe(-50)
    expect(b.largestProfit).toBe(200)
    expect(b.largestLoss).toBe(-50)
    expect(b.totalFees).toBe(25)
  })

  it('computes win rates and ratios', () => {
    expect(b.winPct).toBeCloseTo(66.6667, 3)
    expect(b.longsWinPct).toBe(100)
    expect(b.shortsWinPct).toBe(0)
    expect(b.profitFactor).toBe(6)
    expect(b.tradeExpectancy).toBeCloseTo(83.3333, 3)
  })

  it('computes R-multiples', () => {
    expect(b.avgPlannedR).toBe(2.5) // (2 + 3) / 2
    expect(b.avgRealizedR).toBe(1) // (2 + -1 + 2) / 3
  })

  it('computes hold times and streaks', () => {
    expect(b.avgHoldAll).toBe(90) // (60 + 30 + 180) / 3
    expect(b.longestTradeDuration).toBe(180)
    expect(b.maxConsecutiveWins).toBe(1)
    expect(b.maxConsecutiveLosses).toBe(1)
  })

  it('aggregates by day', () => {
    expect(b.tradingDays).toBe(2)
    expect(b.winningDays).toBe(2)
    expect(b.losingDays).toBe(0)
    expect(b.loggedDays).toBe(1)
    expect(b.avgDailyPnl).toBe(125)
    expect(b.largestProfitableDay).toBe(200)
    expect(b.maxDrawdown).toBeCloseTo(0, 6) // no equity drawdown in this set
  })

  it('aggregates by month', () => {
    expect(b.bestMonth?.key).toBe('Jan 2026')
    expect(b.bestMonth?.value).toBe(250)
    expect(b.avgMonth).toBe(250)
  })
})

describe('computeBundle (gross)', () => {
  const b = computeBundle(rows, 'gross')

  it('uses gross P&L', () => {
    expect(b.totalPnl).toBe(275) // 110 - 45 + 210 + 0
    expect(b.profitFactor).toBeCloseTo(7.1111, 3) // 320 / 45
  })
})

describe('computeBundle (empty)', () => {
  it('returns an empty bundle', () => {
    const b = computeBundle([], 'net')
    expect(b.hasData).toBe(false)
    expect(b.totalTrades).toBe(0)
    expect(b.profitFactor).toBe(0)
  })
})

// One trade per day so the daily equity curve is unambiguous:
// +100, +50 (peak 150), -80, -40 (trough 30 -> drawdown 120), +200 (new high).
const drawdownRows: TradeRow[] = (
  [
    [2026, 0, 1, 100],
    [2026, 0, 2, 50],
    [2026, 0, 3, -80],
    [2026, 0, 4, -40],
    [2026, 0, 5, 200],
  ] as const
).map(([y, mo, d, pnl]) => ({
  direction: 'long',
  netPnl: pnl,
  grossPnl: pnl,
  fees: 0,
  entryDatetime: new Date(y, mo, d, 9, 30),
  exitDatetime: new Date(y, mo, d, 10, 0),
  riskAmount: null,
  riskRewardRatio: null,
  hasNotes: false,
}))

describe('computeBundle — equity drawdown & streaks', () => {
  const b = computeBundle(drawdownRows, 'net')

  it('measures peak-to-trough drawdown as a negative value', () => {
    expect(b.totalPnl).toBe(230)
    expect(b.maxDrawdown).toBe(-120) // 150 peak down to 30
    expect(b.maxDrawdownPct).toBe(-80) // 120 / 150 = 80%
  })

  it('counts the longest winning and losing runs', () => {
    expect(b.maxConsecutiveWins).toBe(2)
    expect(b.maxConsecutiveLosses).toBe(2)
    expect(b.maxConsecutiveWinningDays).toBe(2)
    expect(b.maxConsecutiveLosingDays).toBe(2)
  })

  it('aggregates the daily extremes', () => {
    expect(b.tradingDays).toBe(5)
    expect(b.winningDays).toBe(3)
    expect(b.losingDays).toBe(2)
    expect(b.largestProfitableDay).toBe(200)
    expect(b.largestLosingDay).toBe(-80)
    expect(b.avgDailyWinPct).toBe(60) // 3 of 5 decisive days
  })
})

describe('computeBundle — breakeven band reclassifies trades', () => {
  const trade = (pnl: number): TradeRow => ({
    direction: 'long',
    netPnl: pnl,
    grossPnl: pnl,
    fees: 0,
    entryDatetime: new Date(2026, 0, 5, 9, 30),
    exitDatetime: new Date(2026, 0, 5, 10, 0),
    riskAmount: null,
    riskRewardRatio: null,
    hasNotes: false,
  })
  const rows = [trade(100), trade(3), trade(-2), trade(-50)]

  it('counts small wins/losses normally without a band', () => {
    const b = computeBundle(rows, 'net', null)
    expect([b.winningTrades, b.losingTrades, b.breakEvenTrades]).toEqual([2, 2, 0])
  })

  it('folds values inside a dollar band into breakeven and excludes them from win/loss averages', () => {
    const b = computeBundle(rows, 'net', { mode: 'dollar', from: -5, to: 5 })
    expect([b.winningTrades, b.losingTrades, b.breakEvenTrades]).toEqual([1, 1, 2]) // +3 and -2 → breakeven
    expect(b.avgWin).toBe(100)
    expect(b.avgLoss).toBe(-50)
  })
})

describe('computeBundle — day-level breakeven (summed measures)', () => {
  const onDay = (day: number, pnl: number, notional: number): TradeRow => ({
    direction: 'long',
    netPnl: pnl,
    grossPnl: pnl,
    fees: 0,
    entryDatetime: new Date(2026, 0, day, 9, 30),
    exitDatetime: new Date(2026, 0, day, 10, 0),
    riskAmount: null,
    riskRewardRatio: null,
    hasNotes: false,
    notional,
  })
  const band = { mode: 'percent' as const, from: 0, to: 0.1 }

  it('marks a day whose trades offset (+0.5% / −0.5%) as breakeven', () => {
    const b = computeBundle([onDay(5, 500, 100_000), onDay(5, -500, 100_000)], 'net', band)
    expect([b.winningDays, b.losingDays, b.breakevenDays]).toEqual([0, 0, 1])
  })

  it('keeps a profitable day a win even when most of its trades were breakeven', () => {
    // 2 breakeven trades (0.05% / 0.03%) + 1 real winner (0.5%) → day sums to 0.58%.
    const b = computeBundle([onDay(6, 50, 100_000), onDay(6, 30, 100_000), onDay(6, 500, 100_000)], 'net', band)
    expect([b.winningDays, b.losingDays, b.breakevenDays]).toEqual([1, 0, 0])
    expect([b.winningTrades, b.breakEvenTrades]).toEqual([1, 2]) // trade-level band still applies
  })
})

describe('computeBundle — break-even resets streaks', () => {
  const day = (d: number, pnl: number): TradeRow => ({
    direction: 'long',
    netPnl: pnl,
    grossPnl: pnl,
    fees: 0,
    entryDatetime: new Date(2026, 1, d, 9, 30),
    exitDatetime: new Date(2026, 1, d, 10, 0),
    riskAmount: null,
    riskRewardRatio: null,
    hasNotes: false,
  })

  it('does not bridge a winning streak across a scratch trade', () => {
    const b = computeBundle([day(1, 10), day(2, 0), day(3, 10)], 'net')
    expect(b.breakEvenTrades).toBe(1)
    expect(b.maxConsecutiveWins).toBe(1)
    expect(b.maxConsecutiveLosses).toBe(0)
  })
})
