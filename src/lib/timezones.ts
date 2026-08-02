// Single source of truth for the timezone pickers. Previously each screen kept
// its own ten-entry list, so a browser reporting anything outside it (most of the
// world — Europe/Bratislava, Asia/Kolkata, America/Denver…) silently fell back to
// UTC and every imported timestamp was off by hours.

/** Trading hubs, pinned to the top of the picker. */
export const COMMON_TIMEZONES = [
  'UTC',
  'Europe/Prague',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const

export const FALLBACK_TIMEZONE = 'UTC'

/** Every zone the runtime knows, common ones first. */
export function allTimezones(): string[] {
  let supported: string[] = []
  try {
    supported = Intl.supportedValuesOf?.('timeZone') ?? []
  } catch {
    supported = []
  }
  const common = COMMON_TIMEZONES as readonly string[]
  return [...common, ...supported.filter((z) => !common.includes(z))]
}

/** True when the runtime can actually resolve this zone. */
export function isValidTimezone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The zone the browser is running in, or null when it can't be determined. */
export function browserTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimezone(tz) ? tz : null
  } catch {
    return null
  }
}

/** "GMT+02:00" for the picker labels. */
export function gmtLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(
      new Date(),
    )
    const off = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
    return off === 'GMT' ? 'GMT+00:00' : off
  } catch {
    return 'GMT'
  }
}

export function timezoneOptions(selected?: string | null): { value: string; label: string }[] {
  const zones = allTimezones()
  const list = selected && !zones.includes(selected) ? [selected, ...zones] : zones
  return list.map((z) => ({ value: z, label: `(${gmtLabel(z)}) ${z}` }))
}
