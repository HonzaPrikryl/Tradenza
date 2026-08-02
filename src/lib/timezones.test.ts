import { describe, it, expect } from 'vitest'
import {
  COMMON_TIMEZONES,
  FALLBACK_TIMEZONE,
  allTimezones,
  isValidTimezone,
  timezoneOptions,
  gmtLabel,
} from './timezones'

describe('isValidTimezone', () => {
  it('accepts IANA zones the runtime can resolve', () => {
    expect(isValidTimezone('Europe/Prague')).toBe(true)
    expect(isValidTimezone('America/New_York')).toBe(true)
    expect(isValidTimezone('UTC')).toBe(true)
  })

  it('rejects junk without throwing', () => {
    expect(isValidTimezone('Not/AZone')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
    expect(isValidTimezone(null)).toBe(false)
    expect(isValidTimezone(undefined)).toBe(false)
  })
})

describe('allTimezones', () => {
  it('leads with the common trading hubs', () => {
    expect(allTimezones().slice(0, COMMON_TIMEZONES.length)).toEqual([...COMMON_TIMEZONES])
  })

  it('covers zones outside the pinned list — the old hardcoded picker did not', () => {
    const zones = allTimezones()
    for (const z of ['Europe/Bratislava', 'America/Denver', 'Asia/Dubai']) {
      expect(zones, z).toContain(z)
    }
    expect(zones.length).toBeGreaterThan(100)
  })

  it('lists every zone exactly once', () => {
    const zones = allTimezones()
    expect(new Set(zones).size).toBe(zones.length)
  })
})

describe('timezoneOptions', () => {
  it('keeps an unknown stored zone selectable instead of dropping it', () => {
    const opts = timezoneOptions('Mars/Olympus')
    expect(opts[0].value).toBe('Mars/Olympus')
  })

  it('does not duplicate a zone that is already in the list', () => {
    const values = timezoneOptions('Europe/Prague').map((o) => o.value)
    expect(values.filter((v) => v === 'Europe/Prague')).toHaveLength(1)
  })

  it('keeps a browser-reported alias selectable', () => {
    // Runtimes disagree on aliases: ICU enumerates "Asia/Calcutta" while browsers
    // report "Asia/Kolkata". Both resolve, so the selected one must survive even
    // when it is missing from the enumerated list.
    expect(isValidTimezone('Asia/Kolkata')).toBe(true)
    expect(timezoneOptions('Asia/Kolkata').map((o) => o.value)).toContain('Asia/Kolkata')
  })
})

describe('gmtLabel', () => {
  it('formats an offset', () => {
    expect(gmtLabel('UTC')).toBe('GMT+00:00')
    expect(gmtLabel(FALLBACK_TIMEZONE)).toMatch(/^GMT[+-]\d{2}:\d{2}$/)
  })

  it('degrades gracefully on an invalid zone', () => {
    expect(gmtLabel('Not/AZone')).toBe('GMT')
  })
})
