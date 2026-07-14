import { describe, it, expect } from 'vitest'
import { computeExcursion } from './mae-mfe'

describe('computeExcursion', () => {
  it('long: low is adverse, high is favourable', () => {
    const e = computeExcursion({ direction: 'long', entryPrice: 100, lowPrice: 95, highPrice: 110 })!
    expect(e.maePrice).toBe(95)
    expect(e.mfePrice).toBe(110)
    expect(e.maePoints).toBe(5)
    expect(e.mfePoints).toBe(10)
  })

  it('short: high is adverse, low is favourable (the previously-broken case)', () => {
    const e = computeExcursion({ direction: 'short', entryPrice: 100, lowPrice: 95, highPrice: 110 })!
    expect(e.maePrice).toBe(110)
    expect(e.mfePrice).toBe(95)
    expect(e.maePoints).toBe(10)
    expect(e.mfePoints).toBe(5)
  })

  it('excursions are never negative when the range does not bracket entry', () => {
    // Long whose entry sits below the whole printed range → zero adverse move.
    const e = computeExcursion({ direction: 'long', entryPrice: 90, lowPrice: 95, highPrice: 110 })!
    expect(e.maePoints).toBe(0)
    expect(e.mfePoints).toBe(20)
    expect(e.maePrice).toBe(90) // entry folded into the range as the low
  })

  it('tolerates swapped low/high inputs', () => {
    const e = computeExcursion({ direction: 'long', entryPrice: 100, lowPrice: 110, highPrice: 95 })!
    expect(e.maePrice).toBe(95)
    expect(e.mfePrice).toBe(110)
    expect(e.maePoints).toBe(5)
    expect(e.mfePoints).toBe(10)
  })

  it('converts to money via pointValue (multiplier × quantity)', () => {
    // ES-style: $50 per point, 2 contracts → $100 per point.
    const e = computeExcursion({
      direction: 'long',
      entryPrice: 5000,
      lowPrice: 4990,
      highPrice: 5020,
      pointValue: 100,
    })!
    expect(e.maeMoney).toBe(1000) // 10 pts × $100
    expect(e.mfeMoney).toBe(2000) // 20 pts × $100
  })

  it('converts to R multiples when risk is provided', () => {
    const e = computeExcursion({
      direction: 'long',
      entryPrice: 100,
      lowPrice: 95,
      highPrice: 110,
      pointValue: 10, // $10/pt
      riskAmount: 100, // 1R = $100
    })!
    expect(e.maeMoney).toBe(50)
    expect(e.mfeMoney).toBe(100)
    expect(e.maeR).toBeCloseTo(0.5, 10)
    expect(e.mfeR).toBeCloseTo(1.0, 10)
  })

  it('leaves money/R null without pointValue or risk', () => {
    const e = computeExcursion({ direction: 'short', entryPrice: 100, lowPrice: 95, highPrice: 110 })!
    expect(e.maeMoney).toBeNull()
    expect(e.mfeMoney).toBeNull()
    expect(e.maeR).toBeNull()
    expect(e.mfeR).toBeNull()
  })

  it('leaves R null when pointValue is present but risk is not (or non-positive)', () => {
    const e = computeExcursion({
      direction: 'long',
      entryPrice: 100,
      lowPrice: 95,
      highPrice: 110,
      pointValue: 10,
      riskAmount: 0,
    })!
    expect(e.maeMoney).toBe(50)
    expect(e.maeR).toBeNull()
    expect(e.mfeR).toBeNull()
  })

  it('handles a flat range (no movement) as zero excursion', () => {
    const e = computeExcursion({ direction: 'long', entryPrice: 100, lowPrice: 100, highPrice: 100, pointValue: 5 })!
    expect(e.maePoints).toBe(0)
    expect(e.mfePoints).toBe(0)
    expect(e.maeMoney).toBe(0)
    expect(e.mfeMoney).toBe(0)
  })

  it('returns null for non-finite inputs', () => {
    expect(computeExcursion({ direction: 'long', entryPrice: NaN, lowPrice: 95, highPrice: 110 })).toBeNull()
    expect(computeExcursion({ direction: 'long', entryPrice: 100, lowPrice: Infinity, highPrice: 110 })).toBeNull()
  })
})
