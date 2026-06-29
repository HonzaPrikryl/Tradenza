import { describe, it, expect } from 'vitest'
import { contractMultiplier, tickSize, tickValue } from './futures'

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
