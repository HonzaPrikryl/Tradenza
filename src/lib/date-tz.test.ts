import { describe, it, expect } from 'vitest'
import { dayKeyInTz, hourInTz, minutesSinceMidnightInTz, timeLabelInTz, shiftDay } from './date-tz'

// 23:30 UTC on 2026-01-05 — late enough that New York (UTC-5 in January) is still
// the same calendar day at 18:30, which makes the tz projection observable.
const instant = new Date('2026-01-05T23:30:00Z')

describe('dayKeyInTz', () => {
  it('formats yyyy-MM-dd in the given zone', () => {
    expect(dayKeyInTz(instant, 'UTC')).toBe('2026-01-05')
    expect(dayKeyInTz(instant, 'America/New_York')).toBe('2026-01-05')
  })
})

describe('hourInTz', () => {
  it('returns the wall-clock hour in the zone', () => {
    expect(hourInTz(instant, 'UTC')).toBe(23)
    expect(hourInTz(instant, 'America/New_York')).toBe(18)
  })
})

describe('minutesSinceMidnightInTz / timeLabelInTz', () => {
  it('computes minutes past midnight', () => {
    expect(minutesSinceMidnightInTz(instant, 'UTC')).toBe(23 * 60 + 30)
  })
  it('renders a zero-padded HH:mm label', () => {
    expect(timeLabelInTz(instant, 'UTC')).toBe('23:30')
    expect(timeLabelInTz(instant, 'America/New_York')).toBe('18:30')
  })
})

describe('shiftDay', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftDay('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('steps backwards', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
  })
})
