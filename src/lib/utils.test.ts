import { describe, it, expect } from 'vitest'
import {
  calculatePnl,
  calculateRR,
  calcWinRate,
  calcProfitFactor,
  calcMaxDrawdown,
  formatUnit,
  compactUnit,
  axisUnit,
  formatPctSmart,
  formatPercent,
  formatCurrency,
  formatNumber,
  formatDate,
} from './utils'

describe('calculatePnl', () => {
  it('computes long P&L (exit - entry) * qty', () => {
    expect(calculatePnl('long', 100, 110, 10)).toEqual({ grossPnl: 100, netPnl: 100 })
  })

  it('computes short P&L (entry - exit) * qty', () => {
    expect(calculatePnl('short', 100, 90, 10)).toEqual({ grossPnl: 100, netPnl: 100 })
  })

  it('subtracts fees from net only', () => {
    expect(calculatePnl('long', 100, 110, 10, 25)).toEqual({ grossPnl: 100, netPnl: 75 })
  })

  it('handles a losing long', () => {
    expect(calculatePnl('long', 100, 90, 5, 0)).toEqual({ grossPnl: -50, netPnl: -50 })
  })
})

describe('calculateRR', () => {
  it('returns reward/risk', () => {
    expect(calculateRR('long', 100, 95, 110)).toBe(2)
  })

  it('is direction-agnostic (absolute distances)', () => {
    expect(calculateRR('short', 100, 105, 90)).toBe(2)
  })

  it('returns null when risk is zero', () => {
    expect(calculateRR('long', 100, 100, 110)).toBeNull()
  })
})

describe('calcWinRate', () => {
  it('returns a percentage', () => {
    expect(calcWinRate(3, 4)).toBe(75)
  })
  it('returns 0 for no trades', () => {
    expect(calcWinRate(0, 0)).toBe(0)
  })
})

describe('calcProfitFactor', () => {
  it('returns gross profit / gross loss', () => {
    expect(calcProfitFactor(300, 100)).toBe(3)
  })
  it('returns Infinity when there is profit but no loss', () => {
    expect(calcProfitFactor(300, 0)).toBe(Infinity)
  })
  it('returns 0 when there is neither profit nor loss', () => {
    expect(calcProfitFactor(0, 0)).toBe(0)
  })
})

describe('calcMaxDrawdown', () => {
  it('measures peak-to-trough on the cumulative curve', () => {
    expect(calcMaxDrawdown([100, -50, -100, 200])).toBe(150)
  })
  it('is 0 for a monotonically rising curve', () => {
    expect(calcMaxDrawdown([10, 20, 30])).toBe(0)
  })
  it('is 0 for an empty series', () => {
    expect(calcMaxDrawdown([])).toBe(0)
  })
})

describe('formatUnit', () => {
  it('formats R-multiples with two decimals and sign', () => {
    expect(formatUnit(2, 'r')).toBe('2.00R')
    expect(formatUnit(-1.5, 'r')).toBe('-1.50R')
  })
  it('delegates dollars to currency formatting', () => {
    expect(formatUnit(100, 'dollar')).toBe('$100.00')
  })
})

describe('compactUnit', () => {
  it('compacts R-multiples', () => {
    expect(compactUnit(5, 'r')).toBe('5.0R')
    expect(compactUnit(150, 'r')).toBe('150R')
  })
  it('compacts dollars with K suffix above 1000', () => {
    expect(compactUnit(1500, 'dollar')).toBe('$1.5K')
    expect(compactUnit(-500, 'dollar')).toBe('-$500')
  })
  it('uses the euro symbol for EUR', () => {
    expect(compactUnit(500, 'dollar', 'EUR')).toBe('€500')
  })
})

describe('axisUnit', () => {
  it('formats R-multiples for axes', () => {
    expect(axisUnit(5, 'r')).toBe('5.0R')
    expect(axisUnit(50, 'r')).toBe('50R')
  })
  it('formats dollars for axes with lowercase k', () => {
    expect(axisUnit(1500, 'dollar')).toBe('$1.5k')
    expect(axisUnit(-500, 'dollar')).toBe('-$500')
  })
})

describe('formatPctSmart', () => {
  it('drops decimals for whole numbers', () => {
    expect(formatPctSmart(100)).toBe('100%')
    expect(formatPctSmart(50)).toBe('50%')
    expect(formatPctSmart(0)).toBe('0%')
  })
  it('keeps two decimals for fractional values', () => {
    expect(formatPctSmart(99.5)).toBe('99.50%')
    expect(formatPctSmart(66.6666)).toBe('66.67%')
  })
})

describe('formatPercent', () => {
  it('prefixes a sign and uses one decimal by default', () => {
    expect(formatPercent(12.5)).toBe('+12.5%')
    expect(formatPercent(-3)).toBe('-3.0%')
  })
  it('honours a custom decimal count', () => {
    expect(formatPercent(50, 0)).toBe('+50%')
  })
})

describe('en-US number/date formatting', () => {
  it('formats currency', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50')
    expect(formatCurrency(1234.5, 'EUR')).toBe('€1,234.50')
  })
  it('formats plain numbers', () => {
    expect(formatNumber(1234.5)).toBe('1,234.50')
    expect(formatNumber(1234.5, 0)).toBe('1,235')
  })
  it('formats dates as MM/dd/yyyy', () => {
    expect(formatDate('2026-06-26')).toBe('06/26/2026')
  })
})
