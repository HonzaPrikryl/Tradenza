import { describe, it, expect } from 'vitest'
import {
  contractMultiplier,
  tickSize,
  tickValue,
  assetMultiplier,
  editorDefaultMultiplier,
  instrumentTickSize,
  instrumentTickValue,
} from './futures'

describe('contractMultiplier', () => {
  it('looks up a known root symbol', () => {
    expect(contractMultiplier('ES')).toBe(50)
    expect(contractMultiplier('MES')).toBe(5)
  })
  it('is case-insensitive and strips the month/year code', () => {
    expect(contractMultiplier('esz4')).toBe(50)
    expect(contractMultiplier('NQH25')).toBe(20)
  })
  it('returns 0 for unknown or empty symbols', () => {
    expect(contractMultiplier('ZZZ')).toBe(0)
    expect(contractMultiplier('')).toBe(0)
  })
})

describe('assetMultiplier', () => {
  it('uses the contract size for futures', () => {
    expect(assetMultiplier('futures', 'ES')).toBe(50)
    expect(assetMultiplier('futures', 'MNQ')).toBe(2)
  })
  it('falls back to 1 for an unknown futures symbol', () => {
    expect(assetMultiplier('futures', 'ZZZ')).toBe(1)
  })
  it('is 100 for options (one contract = 100 shares)', () => {
    expect(assetMultiplier('options', 'AAPL')).toBe(100)
  })
  it('is 1 for stocks, crypto, forex and other', () => {
    expect(assetMultiplier('stocks', 'AAPL')).toBe(1)
    expect(assetMultiplier('crypto', 'BTC')).toBe(1)
    expect(assetMultiplier('forex', 'EURUSD')).toBe(1)
    expect(assetMultiplier('other', 'XYZ')).toBe(1)
  })
})

describe('editorDefaultMultiplier', () => {
  it('uses the contract size for a known futures symbol', () => {
    expect(editorDefaultMultiplier('futures', 'ES')).toBe(50)
  })
  it('returns 0 for an unknown futures symbol (prompts the user)', () => {
    expect(editorDefaultMultiplier('futures', 'ZZZ')).toBe(0)
  })
  it('is 100 for options', () => {
    expect(editorDefaultMultiplier('options', 'AAPL')).toBe(100)
  })
  it('is 1 for stocks / forex / crypto', () => {
    expect(editorDefaultMultiplier('stocks', 'AAPL')).toBe(1)
    expect(editorDefaultMultiplier('forex', 'EURUSD')).toBe(1)
  })
})

describe('instrumentTickSize', () => {
  it('uses the futures tick for a known futures symbol', () => {
    expect(instrumentTickSize('futures', 'ES')).toBe(0.25)
  })
  it('is 0 for an unknown futures symbol (prompts the user)', () => {
    expect(instrumentTickSize('futures', 'ZZZ')).toBe(0)
  })
  it('uses the pip for forex (0.0001, or 0.01 for JPY)', () => {
    expect(instrumentTickSize('forex', 'EURUSD')).toBe(0.0001)
    expect(instrumentTickSize('forex', 'USDJPY')).toBe(0.01)
  })
  it('is a penny for stocks / options / crypto / cfd', () => {
    expect(instrumentTickSize('stocks', 'AAPL')).toBe(0.01)
    expect(instrumentTickSize('options', 'AAPL')).toBe(0.01)
    expect(instrumentTickSize('crypto', 'BTCUSD')).toBe(0.01)
    expect(instrumentTickSize('cfd', 'US30')).toBe(0.01)
  })
})

describe('instrumentTickValue', () => {
  it('is tick size × multiplier', () => {
    expect(instrumentTickValue('futures', 'ES', 50)).toBeCloseTo(12.5)
    expect(instrumentTickValue('options', 'AAPL', 100)).toBeCloseTo(1)
    expect(instrumentTickValue('stocks', 'AAPL', 1)).toBeCloseTo(0.01)
  })
  it('is 0 when tick size or multiplier is unavailable', () => {
    expect(instrumentTickValue('futures', 'ZZZ', 1)).toBe(0)
    expect(instrumentTickValue('stocks', 'AAPL', 0)).toBe(0)
  })
})

describe('tickSize', () => {
  it('returns the tick size for a known symbol', () => {
    expect(tickSize('ES')).toBe(0.25)
    expect(tickSize('CL')).toBe(0.01)
  })
  it('returns 0 for unknown symbols', () => {
    expect(tickSize('ZZZ')).toBe(0)
  })
})

describe('tickValue', () => {
  it('multiplies contract multiplier by tick size', () => {
    expect(tickValue('ES')).toBe(12.5) // 50 * 0.25
  })
  it('respects an explicit multiplier override', () => {
    expect(tickValue('MES', 5)).toBe(1.25) // 5 * 0.25
  })
  it('returns 0 when multiplier or tick size is unknown', () => {
    expect(tickValue('ZZZ')).toBe(0)
  })
})
