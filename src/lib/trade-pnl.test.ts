import { describe, it, expect } from 'vitest'
import { roundMoney, derivePnl } from './trade-pnl'

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
