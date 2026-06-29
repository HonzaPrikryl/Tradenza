// Timezone-aware calendar helpers shared by the dashboard and progress actions.
// Pure (no 'use server') so they can be reused and unit-tested. All of these
// project a UTC instant onto the wall-clock calendar of `tz` (falling back to
// the runtime zone when tz is null).

export function dayKeyInTz(d: Date, tz: string | null): string {
  // en-CA formats as "yyyy-MM-dd".
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function hourInTz(d: Date, tz: string | null): number {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || undefined,
    hour: '2-digit',
    hour12: false,
  }).format(d)
  const h = parseInt(s, 10)
  return Number.isFinite(h) ? h % 24 : 0
}

export function minutesSinceMidnightInTz(d: Date, tz: string | null): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || undefined,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  return h * 60 + m
}

export function timeLabelInTz(d: Date, tz: string | null): string {
  const m = minutesSinceMidnightInTz(d, tz)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Adds `delta` calendar days to a "yyyy-MM-dd" key. Computed in UTC so it never
// drifts across DST boundaries the way a local Date would.
export function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}
