import { describe, it, expect } from 'vitest'
import { uuid, uuidArray, dateKey, year, month } from './validation'

const V = '11111111-1111-1111-1111-111111111111'

describe('uuid', () => {
  it('accepts a valid uuid', () => {
    expect(uuid.parse(V)).toBe(V)
  })
  it('rejects a non-uuid string', () => {
    expect(() => uuid.parse('not-a-uuid')).toThrow()
    expect(() => uuid.parse('')).toThrow()
  })
})

describe('uuidArray', () => {
  it('accepts an empty list and a list of uuids', () => {
    expect(uuidArray.parse([])).toEqual([])
    expect(uuidArray.parse([V, V])).toEqual([V, V])
  })
  it('rejects a list containing a non-uuid', () => {
    expect(() => uuidArray.parse([V, 'nope'])).toThrow()
  })
})

describe('dateKey', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(dateKey.parse('2026-07-04')).toBe('2026-07-04')
  })
  it('rejects other shapes', () => {
    expect(() => dateKey.parse('2026-7-4')).toThrow()
    expect(() => dateKey.parse('2026-07-04T00:00')).toThrow()
    expect(() => dateKey.parse('nope')).toThrow()
  })
})

describe('year', () => {
  it('coerces numeric strings', () => {
    expect(year.parse('2026')).toBe(2026)
    expect(year.parse(2026)).toBe(2026)
  })
  it('enforces the integer range', () => {
    expect(() => year.parse(1969)).toThrow()
    expect(() => year.parse(10000)).toThrow()
    expect(() => year.parse(2026.5)).toThrow()
  })
})

describe('month', () => {
  it('coerces and accepts 1–12', () => {
    expect(month.parse('7')).toBe(7)
    expect(month.parse(1)).toBe(1)
    expect(month.parse(12)).toBe(12)
  })
  it('rejects out-of-range months', () => {
    expect(() => month.parse(0)).toThrow()
    expect(() => month.parse(13)).toThrow()
  })
})
