import { describe, it, expect } from 'vitest'
import { stripTzAbbrev, parseDirection, parseNumber, parseBuySell, tzOffset, parseDateInTz } from './wizard-helpers'

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
  it('returns null for empty input', () => {
    expect(parseDateInTz('', 'UTC')).toBeNull()
  })
})
