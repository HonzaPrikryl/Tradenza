import { describe, it, expect } from 'vitest'
import { FOREX_STANDARD_LOT, isForexPair, forexPipSize, forexContractSize, forexPipValue } from './forex'

describe('isForexPair', () => {
  it('recognises standard 6-letter pairs', () => {
    expect(isForexPair('EURUSD')).toBe(true)
    expect(isForexPair('USDJPY')).toBe(true)
    expect(isForexPair('GBPCHF')).toBe(true)
  })

  it('normalises separators and suffixes', () => {
    expect(isForexPair('EUR/USD')).toBe(true)
    expect(isForexPair('eur-usd')).toBe(true)
    expect(isForexPair('EURUSD.r')).toBe(true)
  })

  it('rejects non-currency symbols', () => {
    expect(isForexPair('ES')).toBe(false)
    expect(isForexPair('AAPL')).toBe(false)
    expect(isForexPair('BTCUSD')).toBe(false) // BTC is not an ISO currency
  })
})

describe('forexPipSize', () => {
  it('is 0.01 for JPY-quoted pairs', () => {
    expect(forexPipSize('USDJPY')).toBe(0.01)
    expect(forexPipSize('EURJPY')).toBe(0.01)
  })

  it('is 0.0001 otherwise (incl. unknown)', () => {
    expect(forexPipSize('EURUSD')).toBe(0.0001)
    expect(forexPipSize('WHATEVER')).toBe(0.0001)
  })
})

describe('forexContractSize', () => {
  it('is the standard lot for any forex symbol', () => {
    expect(forexContractSize('EURUSD')).toBe(FOREX_STANDARD_LOT)
    expect(forexContractSize('USDJPY')).toBe(100_000)
  })
})

describe('forexPipValue (quote currency, per standard lot)', () => {
  it('is 10 for USD-quoted majors', () => {
    expect(forexPipValue('EURUSD')).toBeCloseTo(10)
    expect(forexPipValue('GBPUSD')).toBeCloseTo(10)
  })

  it('is 1000 for JPY pairs (in JPY)', () => {
    expect(forexPipValue('USDJPY')).toBeCloseTo(1000)
  })

  it('scales with lot size', () => {
    expect(forexPipValue('EURUSD', 0.1)).toBeCloseTo(1)
    expect(forexPipValue('EURUSD', 5)).toBeCloseTo(50)
  })
})

describe('P&L consistency with the (exit−entry)×qty×multiplier model', () => {
  it('1 lot EURUSD moving 20 pips = $200', () => {
    const entry = 1.105
    const exit = 1.107 // +20 pips
    const lots = 1
    const pnl = (exit - entry) * lots * forexContractSize('EURUSD')
    expect(pnl).toBeCloseTo(200)
  })

  it('0.1 lot USDJPY moving 50 pips = ¥5,000', () => {
    const entry = 157.0
    const exit = 157.5 // +50 pips
    const lots = 0.1
    const pnl = (exit - entry) * lots * forexContractSize('USDJPY')
    expect(pnl).toBeCloseTo(5000)
  })
})
