import { describe, it, expect } from 'vitest'
import { buildWidgetData, type Row } from './compute'

function row(o: Partial<Row>): Row {
  return {
    netPnl: '0',
    grossPnl: null,
    fees: null,
    symbol: 'AAPL',
    entryDatetime: new Date('2024-01-01T10:00:00Z'),
    exitDatetime: new Date('2024-01-01T10:30:00Z'),
    entryPrice: '100',
    entryQuantity: '1',
    riskRewardRatio: null,
    riskAmount: null,
    extra: null,
    ...o,
  }
}

describe('buildWidgetData', () => {
  it('returns empty structures for no rows', () => {
    const d = buildWidgetData([], 'UTC', 'dollar')
    expect(d.kpi.totalTrades).toBe(0)
    expect(d.kpi.netPnl).toBe(0)
    expect(d.daily).toEqual([])
    expect(d.topSymbols).toEqual([])
    expect(d.zella.score).toBe(0)
    expect(d.zella.axes).toEqual([])
  })

  it('computes core KPIs over a small book', () => {
    const rows = [
      row({ netPnl: '100', symbol: 'AAPL', entryDatetime: new Date('2024-01-01T10:00:00Z') }),
      row({ netPnl: '-50', symbol: 'AAPL', entryDatetime: new Date('2024-01-01T11:00:00Z') }),
      row({ netPnl: '200', symbol: 'TSLA', entryDatetime: new Date('2024-01-02T10:00:00Z') }),
    ]
    const d = buildWidgetData(rows, 'UTC', 'dollar')

    expect(d.kpi.totalTrades).toBe(3)
    expect(d.kpi.netPnl).toBe(250)
    expect(d.kpi.winningTrades).toBe(2)
    expect(d.kpi.losingTrades).toBe(1)
    expect(d.kpi.tradeWinRate).toBeCloseTo((2 / 3) * 100, 6)
    expect(d.kpi.grossProfit).toBe(300)
    expect(d.kpi.grossLoss).toBe(50)
    expect(d.kpi.profitFactor).toBe(6)
    expect(d.kpi.maxDrawdown).toBe(50)
    expect(d.kpi.expectancy).toBeCloseTo(250 / 3, 6)
    // Last trade is a win with the prior trade a loss → streak of +1.
    expect(d.kpi.currentStreak).toBe(1)
  })

  it('aggregates per-day P&L with a running cumulative', () => {
    const rows = [
      row({ netPnl: '100', entryDatetime: new Date('2024-01-01T10:00:00Z') }),
      row({ netPnl: '-50', entryDatetime: new Date('2024-01-01T11:00:00Z') }),
      row({ netPnl: '200', entryDatetime: new Date('2024-01-02T10:00:00Z') }),
    ]
    const d = buildWidgetData(rows, 'UTC', 'dollar')
    expect(d.daily.map((p) => p.date)).toEqual(['2024-01-01', '2024-01-02'])
    expect(d.daily.map((p) => p.pnl)).toEqual([50, 200])
    expect(d.daily.map((p) => p.cumulative)).toEqual([50, 250])
    expect(d.kpi.tradingDays).toBe(2)
    expect(d.kpi.winningDays).toBe(2)
    expect(d.kpi.dayWinRate).toBe(100)
  })

  it('ranks top symbols by net P&L descending', () => {
    const rows = [
      row({ netPnl: '100', symbol: 'AAPL' }),
      row({ netPnl: '-50', symbol: 'AAPL' }),
      row({ netPnl: '200', symbol: 'TSLA' }),
    ]
    const d = buildWidgetData(rows, 'UTC', 'dollar')
    expect(d.topSymbols.map((s) => s.symbol)).toEqual(['TSLA', 'AAPL'])
    expect(d.topSymbols[0].netPnl).toBe(200)
    expect(d.topSymbols[1].netPnl).toBe(50) // 100 − 50
  })

  it('produces a full 6-axis Zella score', () => {
    const rows = [row({ netPnl: '100' }), row({ netPnl: '200' })]
    const d = buildWidgetData(rows, 'UTC', 'dollar')
    expect(d.zella.axes).toHaveLength(6)
    expect(d.zella.axes.map((a) => a.key)).toEqual([
      'winRate',
      'profitFactor',
      'avgWinLoss',
      'recoveryFactor',
      'maxDrawdown',
      'consistency',
    ])
    expect(d.zella.score).toBeGreaterThanOrEqual(0)
    expect(d.zella.score).toBeLessThanOrEqual(100)
  })

  describe("in 'r' unit", () => {
    it('drops trades without a positive risk amount', () => {
      const rows = [
        row({ netPnl: '100', riskAmount: '50' }), // +2R
        row({ netPnl: '90', riskAmount: null }), // excluded
        row({ netPnl: '-30', riskAmount: '30' }), // −1R
      ]
      const d = buildWidgetData(rows, 'UTC', 'r')
      expect(d.kpi.totalTrades).toBe(2)
      // netPnl is now expressed in R: 2 + (−1) = 1
      expect(d.kpi.netPnl).toBeCloseTo(1, 6)
    })
  })
})
