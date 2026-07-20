import { describe, it, expect } from 'vitest'
import { realizedR, formatR } from './r-multiple'

describe('realizedR', () => {
  it('divides net P&L by the initial risk', () => {
    expect(realizedR(300, 150)).toBe(2)
    expect(realizedR(-150, 150)).toBe(-1)
  })

  it('accepts numeric strings (the DB numeric representation)', () => {
    expect(realizedR('300.00', '150.0000')).toBe(2)
  })

  it('returns null when there is no usable risk', () => {
    expect(realizedR(300, null)).toBeNull()
    expect(realizedR(300, 0)).toBeNull()
    expect(realizedR(300, '')).toBeNull()
    expect(realizedR(300, -50)).toBeNull()
  })

  it('returns null when the trade has no net P&L', () => {
    expect(realizedR(null, 150)).toBeNull()
    expect(realizedR(undefined, 150)).toBeNull()
  })
})

describe('formatR', () => {
  it('formats to two decimals with an R suffix', () => {
    expect(formatR(2)).toBe('2.00R')
    expect(formatR(-1.234)).toBe('-1.23R')
  })

  it('renders an em dash for trades without an R', () => {
    expect(formatR(null)).toBe('—')
  })
})
