import { describe, it, expect } from 'vitest'
import {
  stripTzAbbrev,
  parseDirection,
  parseNumber,
  parseBuySell,
  tzOffset,
  parseDateInTz,
  detectDecimalSeparator,
  detectDayFirst,
  isFlat,
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

  it('never eats AM/PM — it is a short trailing word too', () => {
    expect(stripTzAbbrev('6/16/2026 4:13 PM')).toBe('6/16/2026 4:13 PM')
    expect(stripTzAbbrev('6/16/2026 4:13 am')).toBe('6/16/2026 4:13 am')
    expect(stripTzAbbrev('6/16/2026 4:13 p.m.')).toBe('6/16/2026 4:13 p.m.')
  })
})

describe('parseDirection', () => {
  it('maps sell-like values to short', () => {
    expect(parseDirection('SELL')).toBe('short')
    expect(parseDirection('s')).toBe('short')
    expect(parseDirection('Sold')).toBe('short')
  })

  it('maps buy-like values to long', () => {
    expect(parseDirection('b')).toBe('long')
    expect(parseDirection('buy')).toBe('long')
    expect(parseDirection('BOT')).toBe('long')
  })

  it('reads Bybit closing direction as the position that was closed', () => {
    expect(parseDirection('Close Long')).toBe('long')
    expect(parseDirection('Close Short')).toBe('short')
  })

  it('returns null for anything it does not recognise', () => {
    // A side column mapped onto "Order Type" must not turn the file into longs.
    expect(parseDirection('Market')).toBeNull()
    expect(parseDirection('Limit')).toBeNull()
    expect(parseDirection('anything')).toBeNull()
    expect(parseDirection(undefined)).toBeNull()
  })
})

describe('detectDecimalSeparator', () => {
  it('picks the last separator when a value carries both', () => {
    expect(detectDecimalSeparator(['1.234,56'])).toBe(',')
    expect(detectDecimalSeparator(['1,234.56'])).toBe('.')
  })

  it('reads a comma with other than three trailing digits as decimal', () => {
    expect(detectDecimalSeparator(['1,5', '30821,25'])).toBe(',')
  })

  it('reads repeated commas as digit grouping', () => {
    expect(detectDecimalSeparator(['1,234,567'])).toBe('.')
  })

  it('defaults to a dot when the column offers no evidence', () => {
    expect(detectDecimalSeparator(['1,234'])).toBe('.')
    expect(detectDecimalSeparator(['100', '', undefined])).toBe('.')
  })

  it('lets one decisive value settle a column of ambiguous ones', () => {
    expect(detectDecimalSeparator(['1,234', '1,234', '12,5'])).toBe(',')
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

  it('honours a comma decimal separator instead of multiplying by ten', () => {
    expect(parseNumber('1,5', ',')).toBe(1.5)
    expect(parseNumber('-12,75', ',')).toBe(-12.75)
    expect(parseNumber('1.234,56', ',')).toBe(1234.56)
    expect(parseNumber('30821,25', ',')).toBe(30821.25)
  })

  it('strips grouping separators of the opposite convention', () => {
    expect(parseNumber('1 234,56', ',')).toBe(1234.56)
    expect(parseNumber('1 234.56')).toBe(1234.56)
  })

  it('accepts a unicode minus', () => {
    expect(parseNumber('\u221285.5')).toBe(-85.5)
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
    expect(resolveSideAndQuantity('sell', 4)).toEqual({ direction: 'short', quantity: 4, sideUnreadable: false })
    expect(resolveSideAndQuantity('buy', 4)).toEqual({ direction: 'long', quantity: 4, sideUnreadable: false })
  })
  it('infers short from a negative quantity when no side column (DeepCharts style)', () => {
    expect(resolveSideAndQuantity(undefined, -6)).toEqual({ direction: 'short', quantity: 6, sideUnreadable: false })
    expect(resolveSideAndQuantity('', -2)).toEqual({ direction: 'short', quantity: 2, sideUnreadable: false })
  })
  it('infers long from a positive quantity when no side column', () => {
    expect(resolveSideAndQuantity(undefined, 6)).toEqual({ direction: 'long', quantity: 6, sideUnreadable: false })
  })
  it('a mapped side column overrides the quantity sign', () => {
    // Explicit side wins even if the quantity sign disagrees.
    expect(resolveSideAndQuantity('buy', -3)).toEqual({ direction: 'long', quantity: 3, sideUnreadable: false })
  })
  it('defaults to long / qty 1 when quantity is missing', () => {
    expect(resolveSideAndQuantity(undefined, null)).toEqual({ direction: 'long', quantity: 1, sideUnreadable: false })
  })

  it('falls back to the quantity sign and flags an unreadable side cell', () => {
    // The wrong column is mapped (an order type, not a side) — the old code
    // silently called every one of these long.
    expect(resolveSideAndQuantity('Market', -3)).toEqual({
      direction: 'short',
      quantity: 3,
      sideUnreadable: true,
    })
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

describe('detectDayFirst', () => {
  it('reads a day above 12 as proof the column is day-first', () => {
    expect(detectDayFirst(['16/06/2026', '06/07/2026'])).toBe(true)
  })

  it('reads a month-position value above 12 as proof of month-first', () => {
    expect(detectDayFirst(['06/16/2026', '06/07/2026'])).toBe(false)
  })

  it('keeps month-first when nothing in the column is decisive', () => {
    expect(detectDayFirst(['06/07/2026'])).toBe(false)
    expect(detectDayFirst(['2026-06-07', undefined, ''])).toBe(false)
  })
})

describe('parseDateInTz — day/month order', () => {
  it('reads slash dates day-first when told to', () => {
    expect(parseDateInTz('16/06/2026 14:30', 'UTC', true)?.toISOString()).toBe('2026-06-16T14:30:00.000Z')
    expect(parseDateInTz('06/07/2026', 'UTC', true)?.toISOString()).toBe('2026-07-06T00:00:00.000Z')
  })

  it('reads slash dates month-first by default', () => {
    expect(parseDateInTz('06/07/2026', 'UTC')?.toISOString()).toBe('2026-06-07T00:00:00.000Z')
    expect(parseDateInTz('6/16/2026 4:13 PM', 'UTC')?.toISOString()).toBe('2026-06-16T16:13:00.000Z')
  })

  it('lets an out-of-range component override the file-level hint', () => {
    // "16" cannot be a month whatever the rest of the file suggested.
    expect(parseDateInTz('16/06/2026', 'UTC', false)?.toISOString()).toBe('2026-06-16T00:00:00.000Z')
  })

  it('rejects impossible dates instead of rolling them over', () => {
    // Date.UTC(2026, 15, 6) silently becomes April 2027; that used to be imported.
    expect(parseDateInTz('16/06/2026', 'UTC', false)?.getUTCFullYear()).toBe(2026)
    expect(parseDateInTz('13/13/2026', 'UTC')).toBeNull()
    expect(parseDateInTz('2026-02-30', 'UTC')).toBeNull()
    expect(parseDateInTz('2026-13-01', 'UTC')).toBeNull()
  })

  it('understands dotted AM/PM', () => {
    expect(parseDateInTz('6/16/2026 4:13 p.m.', 'UTC')?.toISOString()).toBe('2026-06-16T16:13:00.000Z')
  })
})

describe('parseDateInTz — DST boundaries', () => {
  it('resolves a wall time just before a spring-forward transition', () => {
    // Prague jumps 02:00 → 03:00 on 2026-03-29. 01:30 is still CET (UTC+1), but a
    // single-pass offset lookup read CEST off the candidate instant and landed an
    // hour early.
    expect(parseDateInTz('2026-03-29 01:30', 'Europe/Prague')?.toISOString()).toBe('2026-03-29T00:30:00.000Z')
  })

  it('resolves a wall time just after the transition', () => {
    expect(parseDateInTz('2026-03-29 03:30', 'Europe/Prague')?.toISOString()).toBe('2026-03-29T01:30:00.000Z')
  })

  it('leaves ordinary times untouched', () => {
    expect(parseDateInTz('2026-06-16 16:13:58', 'Europe/Prague')?.toISOString()).toBe('2026-06-16T14:13:58.000Z')
  })
})

describe('mergeRoundTripPartials — position identity', () => {
  const base = (over: Partial<RoundTripLeg>) =>
    leg({ entryDatetime: new Date('2026-06-16T10:00:00Z'), entryPrice: 100, exitPrice: 110, quantity: 1, ...over })

  it('keeps two positions opened in the same second but at different prices apart', () => {
    // Same symbol, side and timestamp — only the entry price differs. Merging
    // them produced one trade with an averaged entry that matched neither.
    const out = mergeRoundTripPartials([base({ entryPrice: 100 }), base({ entryPrice: 200 })])
    expect(out).toHaveLength(2)
    expect(out.map((t) => t.entryPrice)).toEqual([100, 200])
  })

  it('still merges real partials, which repeat the entry verbatim', () => {
    const out = mergeRoundTripPartials([base({ quantity: 2, exitPrice: 110 }), base({ quantity: 3, exitPrice: 120 })])
    expect(out).toHaveLength(1)
    expect(out[0].entryQuantity).toBe(5)
    expect(out[0].legCount).toBe(2)
  })

  it('reports exit quantity below entry quantity when a leg is still open', () => {
    const out = mergeRoundTripPartials([
      base({ quantity: 2 }),
      base({ quantity: 3, exitPrice: null, exitDatetime: null }),
    ])
    expect(out[0].entryQuantity).toBe(5)
    expect(out[0].exitQuantity).toBe(2)
  })
})

describe('isFlat', () => {
  it('treats a fractional round trip as flat', () => {
    // 0.1 + 0.2 - 0.3 is 5.55e-17, not 0. Exact equality never fired, so every
    // crypto/forex fill for a symbol ended up in one enormous "trade".
    let pos = 0
    for (const q of [0.1, 0.2, -0.3]) pos += q
    expect(pos === 0).toBe(false)
    expect(isFlat(pos)).toBe(true)
  })

  it('treats forex lot arithmetic as flat', () => {
    let pos = 0
    for (const q of [0.7, 0.1, 0.1, -0.9]) pos += q
    expect(isFlat(pos)).toBe(true)
  })

  it('does not call a real open position flat', () => {
    expect(isFlat(0.01)).toBe(false)
    expect(isFlat(-1)).toBe(false)
    expect(isFlat(0)).toBe(true)
  })
})

describe('parseBuySell — fill-log semantics', () => {
  it('recognises the long-form words a fill log uses', () => {
    expect(parseBuySell('Sold')).toBe('sell')
    expect(parseBuySell('Bought')).toBe('buy')
    expect(parseBuySell('Sell Short')).toBe('sell')
  })

  it('inverts "close" wording, unlike parseDirection', () => {
    // On a fill, "Close Long" is the sell that closed a long. On a round-trip row
    // the same string names the position. The two must not be shared.
    expect(parseBuySell('Close Long')).toBe('sell')
    expect(parseDirection('Close Long')).toBe('long')
    expect(parseBuySell('Close Short')).toBe('buy')
    expect(parseDirection('Close Short')).toBe('short')
  })

  it('still returns null for anything unrecognised', () => {
    expect(parseBuySell('Market')).toBeNull()
    expect(parseBuySell(undefined)).toBeNull()
  })
})
