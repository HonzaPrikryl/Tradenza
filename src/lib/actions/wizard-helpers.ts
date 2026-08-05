// Pure parsing / timezone helpers used by the import wizard actions.
// Kept in a plain module (no 'use server') so they can be unit-tested and
// reused without pulling in the server-action runtime.

// Upper bounds on a single import, shared by the zod schema and the wizard so
// the UI can say "this file has 14,000 rows, split it" instead of letting the
// user hit an opaque validation failure. They live here rather than next to the
// schema because a 'use server' module may only export async functions.
export const MAX_TRADE_ROWS = 10000
export const MAX_FILL_ROWS = 20000

/**
 * Drop a trailing timezone abbreviation ("… 16:13:58 EST") that our date parser
 * cannot use anyway. AM/PM is explicitly preserved: it is also a short trailing
 * word, and eating it turns every afternoon trade into a morning one.
 */
export function stripTzAbbrev(value: string): string {
  return value
    .trim()
    .replace(/\s+(?![AaPp]\.?[Mm]\.?$)[A-Za-z]{2,5}$/, '')
    .trim()
}

/**
 * Read a side/direction cell. Returns null for anything we don't recognise —
 * mapping the wrong column (an "Order Type" full of "Market"/"Limit") must not
 * silently turn a whole file into longs. Callers decide the fallback.
 */
export function parseDirection(value: string | undefined): 'long' | 'short' | null {
  const v = (value ?? '').toLowerCase().trim()
  // "Close Long" (Bybit's Closing Direction) describes the position that was
  // closed, so it means the trade was long — not that the closing fill was a sell.
  if (['sell', 'short', 's', 'sold', 'sld', 'sell short', 'close short'].includes(v)) return 'short'
  if (['buy', 'long', 'b', 'bot', 'bought', 'buy long', 'close long'].includes(v)) return 'long'
  return null
}

/**
 * Resolve trade direction and a positive quantity from a round-trip CSV row.
 *
 * Most brokers ship an explicit side/direction column. Some (e.g. DeepCharts)
 * omit it and encode long/short in the **sign of the quantity** (a negative
 * quantity = short). A side column we can actually read wins; a cell we cannot
 * read (wrong column mapped, unknown vocabulary) falls through to the quantity
 * sign rather than defaulting everything to long. The returned quantity is
 * always the absolute value, so a signed input never leaks a negative size into
 * storage or P&L math.
 */
export function resolveSideAndQuantity(
  sideRaw: string | undefined,
  quantityRaw: number | null,
): { direction: 'long' | 'short'; quantity: number; sideUnreadable: boolean } {
  const parsed = parseDirection(sideRaw)
  const hasSide = sideRaw != null && sideRaw.trim() !== ''
  const direction: 'long' | 'short' = parsed ?? (quantityRaw !== null && quantityRaw < 0 ? 'short' : 'long')
  const quantity = quantityRaw !== null ? Math.abs(quantityRaw) : 1
  return { direction, quantity, sideUnreadable: hasSide && parsed === null }
}

// ─── Numbers ──────────────────────────────────────────────────────────────────
// "1,234" is genuinely ambiguous: 1234 in a US export, 1.234 in a European one.
// A single value cannot be decided — the file can. `detectDecimalSeparator`
// looks at every value a column supplies and picks one convention for all of
// them, so a ";"-delimited EU export doesn't silently multiply prices by 1000.

export type DecimalSeparator = '.' | ','

/**
 * Decide which character is the decimal separator for a set of values from the
 * same column. Evidence, strongest first:
 *   1. a value containing both separators — the *last* one is the decimal
 *   2. a comma followed by anything other than exactly 3 digits ("1,5", "12,345678")
 *   3. multiple commas in one value ("1,234,567") — grouping, so decimal is "."
 * With no evidence at all we keep "." (the safer default: a bare "1,234" then
 * reads as 1234, which is what every non-EU export means).
 */
export function detectDecimalSeparator(values: (string | undefined)[]): DecimalSeparator {
  let commaVotes = 0
  let dotVotes = 0
  for (const raw of values) {
    const s = (raw ?? '').trim()
    if (!s || !/[.,]/.test(s)) continue
    const dots = (s.match(/\./g) ?? []).length
    const commas = (s.match(/,/g) ?? []).length

    if (dots > 0 && commas > 0) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) commaVotes += 2
      else dotVotes += 2
      continue
    }
    if (commas > 1) {
      dotVotes++
      continue
    }
    if (commas === 1) {
      const after = s.length - s.lastIndexOf(',') - 1
      if (after !== 3) commaVotes++
      continue
    }
    if (dots === 1) {
      const after = s.length - s.lastIndexOf('.') - 1
      if (after !== 3) dotVotes++
    }
  }
  return commaVotes > dotVotes ? ',' : '.'
}

/**
 * Parse a numeric cell. `decimal` says which character separates the fractional
 * part; the other separator is treated as grouping and dropped. Handles currency
 * symbols, spaces (including NBSP), unicode minus, and accounting parentheses.
 */
export function parseNumber(value: string | undefined, decimal: DecimalSeparator = '.'): number | null {
  if (!value || value.trim() === '') return null
  let s = value.replace(/[^\d.,()+\-−]/g, '')
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/−/g, '-').replace(/[()]/g, '')
  if (decimal === ',') s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  if (!/\d/.test(s)) return null
  const n = parseFloat(s)
  if (isNaN(n)) return null
  return negative ? -n : n
}

/**
 * Read a buy/sell cell from a fill log.
 *
 * Deliberately NOT delegating to `parseDirection`: the two answer different
 * questions and "Close Long" means the opposite thing to each. On a round-trip
 * row it names the position (long); on a fill it names the order that closed
 * that position (a sell). Same string, inverted meaning — so the vocabularies
 * are listed out separately rather than shared.
 */
export function parseBuySell(value: string | undefined): 'buy' | 'sell' | null {
  const s = (value ?? '').trim().toLowerCase()
  if (['b', 'buy', 'bot', 'bought', 'long', 'l', 'buy long', 'open long', 'close short'].includes(s)) return 'buy'
  if (['s', 'sell', 'sld', 'sold', 'short', 'sell short', 'open short', 'close long'].includes(s)) return 'sell'
  return null
}

/**
 * Position size is compared against zero to decide when a fill sequence closes a
 * round trip. Crypto and forex sizes are fractional, and 0.1 + 0.2 - 0.3 is not
 * 0 in floating point — an exact comparison never fired, so every fill for such
 * a symbol collapsed into one enormous trade. Well below any real lot size.
 */
export const POSITION_EPSILON = 1e-9

export function isFlat(position: number): boolean {
  return Math.abs(position) < POSITION_EPSILON
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

// ─── Round-trip partial merging ───────────────────────────────────────────────
// Some exports (e.g. DeepCharts) split a single position into one row per exit
// fill, with every partial repeating the shared entry (same symbol, direction,
// entry timestamp, entry price). Imported naively, the rows either collide on a
// single dedup key (losing all but one partial) or appear as several tiny trades.
// These helpers regroup the partials back into one trade — summed size, quantity-
// weighted prices, summed P&L — while preserving each fill as an execution so the
// scale-out detail and running P&L survive.

/**
 * What a trade carries beyond its fills: the plan, the review and the labels.
 *
 * Absent from every broker export and present in ours, so it travels alongside
 * the numbers rather than inside them. Each field is independently optional —
 * a file may map the tags column and nothing else.
 */
export interface TradeJournal {
  status: 'open' | 'closed' | 'cancelled' | null
  exitQuantity: number | null
  multiplier: number | null
  stopLoss: number | null
  takeProfit: number | null
  riskAmount: number | null
  riskRewardRatio: number | null
  rating: number | null
  setupName: string | null
  strategy: string | null
  tags: string[]
}

export const EMPTY_JOURNAL: TradeJournal = {
  status: null,
  exitQuantity: null,
  multiplier: null,
  stopLoss: null,
  takeProfit: null,
  riskAmount: null,
  riskRewardRatio: null,
  rating: null,
  setupName: null,
  strategy: null,
  tags: [],
}

/**
 * Fold the journals of a position's partials into one.
 *
 * A row-per-exit export repeats the trade's journal on every partial, or fills
 * it in on only one of them. Either way the first row that actually supplies a
 * value is the answer; tags are unioned, since a hand-edited file can spread
 * them across the partials.
 */
export function mergeJournals(journals: (TradeJournal | undefined)[]): TradeJournal {
  const present = journals.filter((j): j is TradeJournal => !!j)
  if (present.length === 0) return { ...EMPTY_JOURNAL, tags: [] }

  const firstOf = <K extends keyof TradeJournal>(key: K): TradeJournal[K] =>
    present.map((j) => j[key]).find((v) => v !== null && v !== undefined && v !== '') ?? EMPTY_JOURNAL[key]

  return {
    status: firstOf('status'),
    exitQuantity: firstOf('exitQuantity'),
    multiplier: firstOf('multiplier'),
    stopLoss: firstOf('stopLoss'),
    takeProfit: firstOf('takeProfit'),
    riskAmount: firstOf('riskAmount'),
    riskRewardRatio: firstOf('riskRewardRatio'),
    rating: firstOf('rating'),
    setupName: firstOf('setupName'),
    strategy: firstOf('strategy'),
    tags: [...new Set(present.flatMap((j) => j.tags))],
  }
}

/** Split a tag cell — "Breakout; Late entry" — into individual tag names. */
export function parseTagList(raw: string | undefined): string[] {
  if (!raw) return []
  return [
    ...new Set(
      raw
        .split(/[;|,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 50)
}

export interface RoundTripLeg {
  symbol: string // already upper-cased
  direction: 'long' | 'short'
  entryDatetime: Date
  entryPrice: number
  exitDatetime: Date | null
  exitPrice: number | null
  quantity: number // positive
  fees: number
  grossPnl: number | null
  netPnl: number | null
  notes: string | null
  journal?: TradeJournal
}

export interface MergedExecution {
  datetime: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
  commission: number
  fee: number
}

export interface MergedTrade {
  symbol: string
  direction: 'long' | 'short'
  entryDatetime: Date
  entryPrice: number
  entryQuantity: number
  exitDatetime: Date | null
  exitPrice: number | null
  exitQuantity: number
  fees: number
  grossPnl: number | null
  netPnl: number | null
  notes: string | null
  journal: TradeJournal
  legCount: number
  executions: MergedExecution[]
}

const round8 = (n: number): number => Math.round(n * 1e8) / 1e8

// Sum a numeric field across legs; null when no leg supplies it (so a merged
// trade only carries a broker-provided P&L when at least one partial had one).
function sumProvided(legs: RoundTripLeg[], pick: (l: RoundTripLeg) => number | null): number | null {
  const vals = legs.map(pick).filter((v): v is number => v !== null)
  return vals.length > 0 ? round8(vals.reduce((s, v) => s + v, 0)) : null
}

function buildMergedTrade(legs: RoundTripLeg[]): MergedTrade {
  const first = legs[0]
  const entryQuantity = legs.reduce((s, l) => s + l.quantity, 0)
  const entryPrice =
    entryQuantity > 0
      ? round8(legs.reduce((s, l) => s + l.entryPrice * l.quantity, 0) / entryQuantity)
      : first.entryPrice

  const exitLegs = legs.filter((l) => l.exitPrice !== null && l.exitDatetime !== null)
  const exitQuantity = exitLegs.reduce((s, l) => s + l.quantity, 0)
  const exitPrice =
    exitQuantity > 0 ? round8(exitLegs.reduce((s, l) => s + l.exitPrice! * l.quantity, 0) / exitQuantity) : null
  const exitDatetime =
    exitLegs.length > 0 ? new Date(Math.max(...exitLegs.map((l) => l.exitDatetime!.getTime()))) : null

  const entrySide: 'buy' | 'sell' = first.direction === 'long' ? 'buy' : 'sell'
  const exitSide: 'buy' | 'sell' = entrySide === 'buy' ? 'sell' : 'buy'

  // Collapse identical entry fills (same price) into a single execution; keep each
  // exit partial as its own execution so the scale-out sequence is preserved.
  const entryByPrice = new Map<number, number>()
  for (const l of legs) {
    const p = round8(l.entryPrice)
    entryByPrice.set(p, (entryByPrice.get(p) ?? 0) + l.quantity)
  }
  const executions: MergedExecution[] = []
  for (const [price, quantity] of entryByPrice) {
    executions.push({
      datetime: first.entryDatetime.toISOString(),
      side: entrySide,
      quantity,
      price,
      commission: 0,
      fee: 0,
    })
  }
  for (const l of exitLegs) {
    executions.push({
      datetime: l.exitDatetime!.toISOString(),
      side: exitSide,
      quantity: l.quantity,
      price: l.exitPrice!,
      commission: 0,
      fee: 0,
    })
  }
  executions.sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime))

  return {
    symbol: first.symbol,
    direction: first.direction,
    entryDatetime: first.entryDatetime,
    entryPrice,
    entryQuantity,
    exitDatetime,
    exitPrice,
    exitQuantity,
    fees: round8(legs.reduce((s, l) => s + l.fees, 0)),
    grossPnl: sumProvided(legs, (l) => l.grossPnl),
    netPnl: sumProvided(legs, (l) => l.netPnl),
    notes: legs.map((l) => l.notes).find((n) => n && n.trim()) ?? null,
    journal: mergeJournals(legs.map((l) => l.journal)),
    legCount: legs.length,
    executions,
  }
}

/**
 * Group round-trip legs that belong to the same position (identical symbol,
 * direction, entry timestamp **and entry price**) and merge each group into a
 * single trade. Non-partial rows form a group of one and pass through unchanged.
 * Input order is preserved for the first occurrence of each group.
 *
 * The entry price belongs in the identity because partials repeat it verbatim.
 * Without it, two genuinely separate positions opened on the same symbol within
 * the same second collapsed into one trade with a meaningless averaged entry.
 */
export function mergeRoundTripPartials(legs: RoundTripLeg[]): MergedTrade[] {
  const groups = new Map<string, RoundTripLeg[]>()
  const order: string[] = []
  for (const leg of legs) {
    // \u0000 written as an escape, not a raw byte: a literal NUL makes the whole
    // source file read as binary to grep, diffs and review tools.
    const key = [leg.symbol, leg.direction, leg.entryDatetime.toISOString(), round8(leg.entryPrice)].join('\u0000')
    const bucket = groups.get(key)
    if (bucket) {
      bucket.push(leg)
    } else {
      groups.set(key, [leg])
      order.push(key)
    }
  }
  return order.map((key) => buildMergedTrade(groups.get(key)!))
}

// ─── Dates ────────────────────────────────────────────────────────────────────
// "06/07/2026" is July 6th to most of the world and June 7th in the US. Like the
// decimal separator, one value can't settle it but the file can: a single day
// above 12 anywhere in the column proves the whole column is day-first.

const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/

/**
 * Decide whether slash dates in a set of values are day-first (16/06/2026) or
 * month-first (06/16/2026). Only values with an unambiguous component vote; with
 * no evidence we keep month-first, which is what US exports mean.
 */
export function detectDayFirst(values: (string | undefined)[]): boolean {
  let dayFirst = 0
  let monthFirst = 0
  for (const raw of values) {
    const m = (raw ?? '').trim().match(SLASH_DATE)
    if (!m) continue
    const a = +m[1]
    const b = +m[2]
    if (a > 12 && b <= 12) dayFirst++
    else if (b > 12 && a <= 12) monthFirst++
  }
  return dayFirst > monthFirst
}

/** Reject impossible dates instead of letting Date.UTC roll them over. */
function isRealDate(y: number, mo: number, d: number, h: number, mi: number, sec: number): boolean {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  if (h > 23 || mi > 59 || sec > 59) return false
  const probe = new Date(Date.UTC(y, mo - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d
}

export function parseDateInTz(value: string | undefined, tz: string, dayFirst = false): Date | null {
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
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/)
  if (m) {
    ;[y, mo, d, h, mi, sec] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)]
  } else if (
    (m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?)?$/))
  ) {
    const a = +m[1]
    const b = +m[2]
    // An out-of-range first component settles the order on its own, whatever the
    // file-level hint said.
    const isDayFirst = a > 12 ? true : b > 12 ? false : dayFirst
    ;[d, mo] = isDayFirst ? [a, b] : [b, a]
    ;[y, h, mi, sec] = [+m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)]
    const ampm = m[7]?.toLowerCase().replace(/\./g, '')
    if (ampm === 'pm' && h < 12) h += 12
    if (ampm === 'am' && h === 12) h = 0
  } else if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))) {
    ;[d, mo, y, h, mi, sec] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)]
  } else {
    const fallback = new Date(s)
    return isNaN(fallback.getTime()) ? null : fallback
  }

  if (!isRealDate(y, mo, d, h, mi, sec)) return null

  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, sec)
  try {
    // Two passes. The offset has to be the one in effect at the *local* time we
    // were given, but we can only look it up from an instant — so the first pass
    // gives a candidate instant and the second reads the offset there. Without
    // it, wall times within an hour of a DST change land an hour off.
    const first = utcGuess - tzOffset(tz, new Date(utcGuess))
    return new Date(utcGuess - tzOffset(tz, new Date(first)))
  } catch {
    return new Date(utcGuess)
  }
}
