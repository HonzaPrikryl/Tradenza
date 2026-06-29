// Pure parsing / timezone helpers used by the import wizard actions.
// Kept in a plain module (no 'use server') so they can be unit-tested and
// reused without pulling in the server-action runtime.

export function stripTzAbbrev(value: string): string {
  return value
    .trim()
    .replace(/\s+[A-Za-z]{2,5}$/, '')
    .trim()
}

export function parseDirection(value: string): 'long' | 'short' {
  const v = value.toLowerCase().trim()
  if (['sell', 'short', 's', 'sold'].includes(v)) return 'short'
  return 'long'
}

export function parseNumber(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null
  let s = value.replace(/[$\s,]/g, '')
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  const n = parseFloat(s)
  if (isNaN(n)) return null
  return negative ? -n : n
}

export function parseBuySell(value: string | undefined): 'buy' | 'sell' | null {
  const s = (value ?? '').trim().toLowerCase()
  if (['b', 'buy', 'bot', 'long', 'l'].includes(s)) return 'buy'
  if (['s', 'sell', 'sld', 'short'].includes(s)) return 'sell'
  return null
}

export function tzOffset(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]))
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    parts.hour === '24' ? 0 : +parts.hour,
    +parts.minute,
    +parts.second,
  )
  return asUtc - date.getTime()
}

export function parseDateInTz(value: string | undefined, tz: string): Date | null {
  if (!value || value.trim() === '') return null
  const s = value.trim()

  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }

  let y = 0,
    mo = 0,
    d = 0,
    h = 0,
    mi = 0,
    sec = 0
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) {
    ;[y, mo, d, h, mi, sec] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)]
  } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/))) {
    ;[mo, d, y, h, mi, sec] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)]
    const ampm = m[7]?.toLowerCase()
    if (ampm === 'pm' && h < 12) h += 12
    if (ampm === 'am' && h === 12) h = 0
  } else if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))) {
    ;[d, mo, y, h, mi, sec] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)]
  } else {
    const fallback = new Date(s)
    return isNaN(fallback.getTime()) ? null : fallback
  }

  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, sec)
  try {
    return new Date(utcGuess - tzOffset(tz, new Date(utcGuess)))
  } catch {
    return new Date(utcGuess)
  }
}
