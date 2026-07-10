import { describe, it, expect } from 'vitest'
import {
  stripTzAbbrev,
  parseDirection,
  parseNumber,
  parseBuySell,
  tzOffset,
  parseDateInTz,
  resolveSideAndQuantity,
  mergeRoundTripPartials,
  type RoundTripLeg,
} from './wizard-helpers'

const leg = (over: Partial<RoundTripLeg>): RoundTripLeg => ({
  symbol: 'MNQ',
  direction: 'long',
  entryDatetime: new Date('2026-07-10T16:19:43Z'),
  entryPrice: 29917,
  exitDatetime: new Date('2026-07-10T16:20:23Z'),
  exitPrice: 29897.25,
  quantity: 3,
  fees: 0,
  grossPnl: null,
  netPnl: null,
  notes: null,
  ...over,
})

describe('stripTzAbbrev', () => {
  it('removes a trailing timezone abbreviation', () => {
    expect(stripTzAbbrev('2026-01-05 09:30 EST')).toBe('2026-01-05 09:30')
    expect(stripTzAbbrev('2026-01-05 09:30')).toBe('2026-01-05 09:30')
  })
})

describe('parseDirection', () => {
  it('maps sell-like values to short', () => {
    expect(parseDirection('SELL')).toBe('short')
    expect(parseDirection('s')).toBe('short')
    expect(parseDirection('Sold')).toBe('short')
  })
  it('defaults to long', () => {
    expect(parseDirection('b')).toBe('long')
    expect(parseDirection('buy')).toBe('long')
    expect(parseDirection('anything')).toBe('long')
  })
})

describe('parseNumber', () => {
  it('parses currency-formatted numbers', () => {
    expect(parseNumber('$1,234.50')).toBe(1234.5)
  })
  it('treats parentheses as negative', () => {
    expect(parseNumber('(50)')).toBe(-50)
  })
  it('returns null for empty or non-numeric input', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber(undefined)).toBeNull()
    expect(parseNumber('abc')).toBeNull()
  })
})

describe('parseBuySell', () => {
  it('recognises buy synonyms', () => {
    expect(parseBuySell('BOT')).toBe('buy')
    expect(parseBuySell('long')).toBe('buy')
  })
  it('recognises sell synonyms', () => {
    expect(parseBuySell('sld')).toBe('sell')
    expect(parseBuySell('SHORT')).toBe('sell')
  })
  it('returns null for unknown input', () => {
    expect(parseBuySell('x')).toBeNull()
    expect(parseBuySell(undefined)).toBeNull()
  })
})

describe('resolveSideAndQuantity', () => {
  it('uses a mapped side column when present (quantity made absolute)', () => {
    expect(resolveSideAndQuantity('sell', 4)).toEqual({ direction: 'short', quantity: 4 })
    expect(resolveSideAndQuantity('buy', 4)).toEqual({ direction: 'long', quantity: 4 })
  })
  it('infers short from a negative quantity when no side column (DeepCharts style)', () => {
    expect(resolveSideAndQuantity(undefined, -6)).toEqual({ direction: 'short', quantity: 6 })
    expect(resolveSideAndQuantity('', -2)).toEqual({ direction: 'short', quantity: 2 })
  })
  it('infers long from a positive quantity when no side column', () => {
    expect(resolveSideAndQuantity(undefined, 6)).toEqual({ direction: 'long', quantity: 6 })
  })
  it('a mapped side column overrides the quantity sign', () => {
    // Explicit side wins even if the quantity sign disagrees.
    expect(resolveSideAndQuantity('buy', -3)).toEqual({ direction: 'long', quantity: 3 })
  })
  it('defaults to long / qty 1 when quantity is missing', () => {
    expect(resolveSideAndQuantity(undefined, null)).toEqual({ direction: 'long', quantity: 1 })
  })
})

describe('mergeRoundTripPartials', () => {
  it('merges two exit partials of one long position into a single trade', () => {
    // The reported bug: entry +6 scaled out as two -3 exits arrived as two rows
    // sharing the same entry, and the second was dropped as a duplicate.
    const [t] = mergeRoundTripPartials([
      leg({ exitPrice: 29897.25, quantity: 3, netPnl: -118.5 }),
      leg({ exitPrice: 29896.75, quantity: 3, netPnl: -121.5 }),
    ])
    expect(t.direction).toBe('long')
    expect(t.entryQuantity).toBe(6)
    expect(t.entryPrice).toBe(29917)
    expect(t.exitQuantity).toBe(6)
    expect(t.exitPrice).toBe(29897) // (29897.25*3 + 29896.75*3) / 6
    expect(t.netPnl).toBe(-240) // -118.5 + -121.5
    expect(t.legCount).toBe(2)
    // One aggregated entry execution + one execution per exit partial.
    expect(t.executions).toEqual([
      { datetime: '2026-07-10T16:19:43.000Z', side: 'buy', quantity: 6, price: 29917, commission: 0, fee: 0 },
      { datetime: '2026-07-10T16:20:23.000Z', side: 'sell', quantity: 3, price: 29897.25, commission: 0, fee: 0 },
      { datetime: '2026-07-10T16:20:23.000Z', side: 'sell', quantity: 3, price: 29896.75, commission: 0, fee: 0 },
    ])
  })

  it('merges a short scaled out across three exits (qty 2+1+1)', () => {
    const [t] = mergeRoundTripPartials([
      leg({
        direction: 'short',
        entryDatetime: new Date('2026-07-09T16:29:34Z'),
        entryPrice: 29753,
        quantity: 2,
        exitPrice: 29700.25,
        netPnl: 211,
      }),
      leg({
        direction: 'short',
        entryDatetime: new Date('2026-07-09T16:29:34Z'),
        entryPrice: 29753,
        quantity: 1,
        exitPrice: 29751.75,
        netPnl: 2.5,
      }),
      leg({
        direction: 'short',
        entryDatetime: new Date('2026-07-09T16:29:34Z'),
        entryPrice: 29753,
        quantity: 1,
        exitPrice: 29751.75,
        netPnl: 2.5,
      }),
    ])
    expect(t.direction).toBe('short')
    expect(t.entryQuantity).toBe(4)
    expect(t.exitQuantity).toBe(4)
    expect(t.netPnl).toBe(216) // 211 + 2.5 + 2.5
    expect(t.legCount).toBe(3)
    // Entry side of a short is a sell; the entry fills collapse into one exec.
    expect(t.executions[0]).toEqual({
      datetime: '2026-07-09T16:29:34.000Z',
      side: 'sell',
      quantity: 4,
      price: 29753,
      commission: 0,
      fee: 0,
    })
    expect(t.executions).toHaveLength(4) // 1 entry + 3 exits
  })

  it('leaves a non-partial round-trip as a single-leg trade', () => {
    const [t] = mergeRoundTripPartials([leg({ quantity: 2, netPnl: 44 })])
    expect(t.entryQuantity).toBe(2)
    expect(t.legCount).toBe(1)
    expect(t.netPnl).toBe(44)
  })

  it('does not merge positions with different entry timestamps', () => {
    const merged = mergeRoundTripPartials([
      leg({ entryDatetime: new Date('2026-07-10T16:19:43Z') }),
      leg({ entryDatetime: new Date('2026-07-10T16:30:00Z') }),
    ])
    expect(merged).toHaveLength(2)
  })

  it('keeps P&L null when no partial supplied one', () => {
    const [t] = mergeRoundTripPartials([leg({ netPnl: null, grossPnl: null })])
    expect(t.netPnl).toBeNull()
    expect(t.grossPnl).toBeNull()
  })
})

describe('tzOffset', () => {
  it('is zero for UTC', () => {
    expect(tzOffset('UTC', new Date('2026-01-05T12:00:00Z'))).toBe(0)
  })
  it('is -5h for New York in January (EST)', () => {
    // Offset returned in milliseconds; EST = UTC-5.
    expect(tzOffset('America/New_York', new Date('2026-01-05T12:00:00Z'))).toBe(-5 * 3600_000)
  })
})

describe('parseDateInTz', () => {
  it('passes through an explicit ISO/Z instant', () => {
    expect(parseDateInTz('2026-01-05T12:00:00Z', 'America/New_York')?.toISOString()).toBe('2026-01-05T12:00:00.000Z')
  })
  it('interprets a naive datetime in the given timezone', () => {
    // 09:30 in New York (EST, UTC-5) -> 14:30 UTC
    expect(parseDateInTz('2026-01-05 09:30', 'America/New_York')?.toISOString()).toBe('2026-01-05T14:30:00.000Z')
  })
  it('parses US MM/DD/YYYY with AM/PM', () => {
    expect(parseDateInTz('01/05/2026 02:30 PM', 'UTC')?.toISOString()).toBe('2026-01-05T14:30:00.000Z')
  })
  it('tolerates fractional seconds and keeps the given timezone (DeepCharts Exit DT)', () => {
    // Milliseconds must not knock the value onto the server-local fallback path.
    expect(parseDateInTz('2026-07-06 16:27:37.915', 'UTC')?.toISOString()).toBe('2026-07-06T16:27:37.000Z')
    expect(parseDateInTz('2026-07-06 16:27:37.915', 'America/New_York')?.toISOString()).toBe('2026-07-06T20:27:37.000Z')
  })
  it('returns null for empty input', () => {
    expect(parseDateInTz('', 'UTC')).toBeNull()
  })
})
