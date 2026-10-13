import { describe, it, expect } from 'vitest'
import { roundMoney, derivePnl, deriveTradeFromExecutions, type PersistedExecution } from './trade-pnl'

describe('roundMoney', () => {
  it('strips binary-float dust', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    expect(roundMoney(-(0.1 + 0.2))).toBe(-0.3)
  })
  it('rounds to the requested scale', () => {
    expect(roundMoney(1.23456789, 2)).toBe(1.23)
  })
  it('coerces non-finite values to 0', () => {
    expect(roundMoney(NaN)).toBe(0)
    expect(roundMoney(Infinity)).toBe(0)
  })
})

describe('derivePnl', () => {
  it('applies the contract multiplier for futures (long)', () => {
    // (5010 - 5000) * 2 contracts * 50 = 1000 gross, minus 4 fees = 996 net
    expect(
      derivePnl({ direction: 'long', entryPrice: 5000, exitPrice: 5010, quantity: 2, fees: 4, multiplier: 50 }),
    ).toEqual({ grossPnl: 1000, netPnl: 996 })
  })

  it('handles short direction', () => {
    expect(
      derivePnl({ direction: 'short', entryPrice: 5000, exitPrice: 4990, quantity: 1, fees: 2, multiplier: 50 }),
    ).toEqual({ grossPnl: 500, netPnl: 498 })
  })

  it('defaults the multiplier to 1 for non-futures', () => {
    expect(derivePnl({ direction: 'long', entryPrice: 100, exitPrice: 110, quantity: 10, fees: 1 })).toEqual({
      grossPnl: 100,
      netPnl: 99,
    })
  })

  it('treats a non-positive multiplier as 1', () => {
    expect(derivePnl({ direction: 'long', entryPrice: 100, exitPrice: 110, quantity: 1, multiplier: 0 })).toEqual({
      grossPnl: 10,
      netPnl: 10,
    })
  })

  it('returns a negative P&L for a losing trade', () => {
    expect(derivePnl({ direction: 'long', entryPrice: 100, exitPrice: 90, quantity: 5 })).toEqual({
      grossPnl: -50,
      netPnl: -50,
    })
  })

  it('subtracts fees only from net, rounding both from the raw figure', () => {
    const { grossPnl, netPnl } = derivePnl({
      direction: 'long',
      entryPrice: 1.1,
      exitPrice: 1.3,
      quantity: 3,
      fees: 0.1,
    })
    expect(grossPnl).toBe(0.6) // (1.3 - 1.1) * 3 = 0.6 (not 0.6000000000000001)
    expect(netPnl).toBe(0.5)
  })
})

describe('deriveTradeFromExecutions', () => {
  const ex = (datetime: string, side: PersistedExecution['side'], quantity: number, price: number, fee = 0) => ({
    datetime,
    side,
    quantity,
    price,
    commission: 0,
    fee,
  })

  it('adds a dividend to P&L without touching position or averages', () => {
    const d = deriveTradeFromExecutions(
      [
        ex('2026-01-02T10:00:00Z', 'buy', 100, 50),
        ex('2026-03-15T10:00:00Z', 'dividend', 1, 42, 6.3),
        ex('2026-06-01T10:00:00Z', 'sell', 100, 55),
      ],
      1,
    )!
    expect(d.direction).toBe('long')
    expect(d.status).toBe('closed')
    expect(d.entryQuantity).toBe(100)
    expect(d.exitQuantity).toBe(100)
    expect(d.entryPrice).toBe(50)
    expect(d.exitPrice).toBe(55)
    expect(d.dividends).toBe(42)
    // 500 price gain + 42 dividend; withholding tax counts as a fee
    expect(d.grossPnl).toBe(542)
    expect(d.netPnl).toBe(535.7)
  })

  it('does not apply the contract multiplier to dividends', () => {
    const d = deriveTradeFromExecutions(
      [
        ex('2026-01-02T10:00:00Z', 'buy', 1, 10),
        ex('2026-01-03T10:00:00Z', 'dividend', 1, 5),
        ex('2026-01-04T10:00:00Z', 'sell', 1, 11),
      ],
      100,
    )!
    expect(d.grossPnl).toBe(105)
  })

  it('ignores a dividend dated before the opening fill when picking the side', () => {
    const d = deriveTradeFromExecutions(
      [ex('2026-01-01T10:00:00Z', 'dividend', 1, 5), ex('2026-01-02T10:00:00Z', 'sell', 3, 20)],
      1,
    )!
    expect(d.direction).toBe('short')
    expect(d.status).toBe('open')
    expect(d.entryDatetime.toISOString()).toBe('2026-01-02T10:00:00.000Z')
    expect(d.netPnl).toBeNull()
  })

  it('returns null when there is no buy/sell execution', () => {
    expect(deriveTradeFromExecutions([ex('2026-01-01T10:00:00Z', 'dividend', 1, 5)], 1)).toBeNull()
  })
})
