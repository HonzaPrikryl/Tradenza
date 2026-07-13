import { describe, it, expect } from 'vitest'
import {
  classifyOutcome,
  classifyMeasure,
  outcomeMeasure,
  tradeNotional,
  multiplierFor,
  normalizeBreakevenConfig,
  outcomeSign,
  type BreakevenConfig,
} from './breakeven'

describe('normalizeBreakevenConfig', () => {
  it('builds a config for a valid dollar band', () => {
    expect(normalizeBreakevenConfig('dollar', -5, 5)).toEqual({ mode: 'dollar', from: -5, to: 5 })
  })
  it('normalises reversed bounds', () => {
    expect(normalizeBreakevenConfig('dollar', 5, -5)).toEqual({ mode: 'dollar', from: -5, to: 5 })
  })
  it('treats a zero-width band as disabled', () => {
    expect(normalizeBreakevenConfig('dollar', 0, 0)).toBeNull()
  })
  it('rejects an unknown mode', () => {
    expect(normalizeBreakevenConfig('bogus', -5, 5)).toBeNull()
  })
})

describe('classifyOutcome — no config (exact zero)', () => {
  it('classifies by sign', () => {
    expect(classifyOutcome(3, null)).toBe('win')
    expect(classifyOutcome(0, null)).toBe('breakeven')
    expect(classifyOutcome(-3, null)).toBe('loss')
  })
})

describe('classifyOutcome — dollar band', () => {
  const cfg: BreakevenConfig = { mode: 'dollar', from: -5, to: 5 }
  it('treats values inside the band as breakeven (bounds inclusive)', () => {
    expect(classifyOutcome(3, cfg)).toBe('breakeven')
    expect(classifyOutcome(5, cfg)).toBe('breakeven')
    expect(classifyOutcome(-5, cfg)).toBe('breakeven')
  })
  it('classifies values beyond the band', () => {
    expect(classifyOutcome(6, cfg)).toBe('win')
    expect(classifyOutcome(-6, cfg)).toBe('loss')
  })
})

describe('classifyOutcome — percent band', () => {
  const cfg: BreakevenConfig = { mode: 'percent', from: -0.1, to: 0.1 }
  it('measures return % against the notional', () => {
    expect(classifyOutcome(50, cfg, 100_000)).toBe('breakeven') // 0.05%
    expect(classifyOutcome(200, cfg, 100_000)).toBe('win') // 0.20%
    expect(classifyOutcome(-200, cfg, 100_000)).toBe('loss')
  })
  it('falls back to the exact-zero rule without a positive notional', () => {
    expect(classifyOutcome(5, cfg, 0)).toBe('win')
    expect(classifyOutcome(0, cfg, null)).toBe('breakeven')
  })
})

describe('tradeNotional', () => {
  it('is |price * qty * multiplier|', () => {
    expect(tradeNotional(5000, 2, 50)).toBe(500_000)
    expect(tradeNotional(100, 10)).toBe(1000) // multiplier defaults to 1
  })
})

describe('multiplierFor', () => {
  it('prefers a stored multiplier', () => {
    expect(multiplierFor({ contractMultiplier: 50 }, 'ES')).toBe(50)
  })
  it('falls back to the symbol, then 1', () => {
    expect(multiplierFor(null, 'ES')).toBe(50)
    expect(multiplierFor(null, 'AAPL')).toBe(1)
  })
  it('uses the asset class when provided (options ×100)', () => {
    expect(multiplierFor(null, 'AAPL', 'options')).toBe(100)
    expect(multiplierFor(null, 'ES', 'futures')).toBe(50)
    expect(multiplierFor(null, 'EURUSD', 'forex')).toBe(1)
    expect(multiplierFor(null, 'AAPL', 'stocks')).toBe(1)
  })
  it('still prefers a stored multiplier over the asset class', () => {
    expect(multiplierFor({ contractMultiplier: 5 }, 'AAPL', 'options')).toBe(5)
  })
})

describe('outcomeSign', () => {
  it('maps outcomes to -1/0/1', () => {
    expect([outcomeSign('win'), outcomeSign('breakeven'), outcomeSign('loss')]).toEqual([1, 0, -1])
  })
})

describe('outcomeMeasure', () => {
  it('is the dollar P&L in dollar mode (and with no band)', () => {
    expect(outcomeMeasure(100, null)).toBe(100)
    expect(outcomeMeasure(100, { mode: 'dollar', from: -5, to: 5 })).toBe(100)
  })
  it('is the return % in percent mode', () => {
    expect(outcomeMeasure(50, { mode: 'percent', from: 0, to: 0.1 }, 100_000)).toBeCloseTo(0.05, 6)
  })
  it('contributes 0 in percent mode without a notional', () => {
    expect(outcomeMeasure(50, { mode: 'percent', from: 0, to: 0.1 }, 0)).toBe(0)
  })
})

describe('classifyMeasure', () => {
  const band: BreakevenConfig = { mode: 'percent', from: 0, to: 0.1 }
  it('classifies a summed measure against the band', () => {
    expect(classifyMeasure(0, band)).toBe('breakeven') // offsetting trades cancel
    expect(classifyMeasure(0.05, band)).toBe('breakeven') // slightly positive, still inside
    expect(classifyMeasure(0.5, band)).toBe('win')
    expect(classifyMeasure(-0.01, band)).toBe('loss')
  })
  it('falls back to sign without a band', () => {
    expect([classifyMeasure(5, null), classifyMeasure(0, null), classifyMeasure(-5, null)]).toEqual([
      'win',
      'breakeven',
      'loss',
    ])
  })
})
