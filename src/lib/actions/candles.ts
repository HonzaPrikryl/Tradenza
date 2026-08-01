'use server'

import { db, trades, marketCandleChunks } from '@/lib/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { uuid } from '@/lib/validation'
import { authedAction } from '@/lib/safe-action'
import {
  resolveFeed,
  intervalToPolygon,
  intervalToBinance,
  intervalToDatabento,
  futuresParentFeed,
  futuresInstrumentFeed,
  type Candle,
  type Feed,
  type DatabentoSpec,
  type DatabentoSchema,
} from '@/lib/market-data'
import {
  AVAILABILITY_LAG_SEC,
  aggregate,
  bracketsPrice,
  pickContract,
  chunkIsFinal,
  chunkStartsFor,
  dedupeSorted,
  groupConsecutive,
  isChunkFresh,
  maxChunksPerRequest,
  overlaps,
  pickResolution,
  sliceCandles,
  splitIntoChunks,
} from '@/lib/candle-cache'

// Historical sources:
//   futures / stocks → Databento  https://databento.com/docs/api-reference-historical
//   forex            → Polygon.io https://polygon.io/docs/rest/forex/aggregates
//   crypto           → Binance    https://developers.binance.com/docs/binance-spot-api-docs

export type { Candle }

export type CandlesResult =
  | { status: 'ok'; intervalSec: number; candles: Candle[] }
  | { status: 'noKey' | 'unsupported' | 'noData' | 'error' | 'rateLimited' | 'noAccess' | 'today' }

// A soft failure a fetcher can raise so the UI can show a fitting message
// instead of one generic error:
//   rateLimited → transient (HTTP 429), worth retrying shortly
//   noAccess    → permanent for this deployment (HTTP 401/403): bad key, missing
//                 dataset entitlement, exhausted credit or a plan that doesn't
//                 cover the endpoint. "Try again later" would be a lie here.
//   error       → anything else
type SoftError = 'error' | 'rateLimited' | 'noAccess'
class FetchError extends Error {
  constructor(public readonly soft: SoftError) {
    super(soft)
  }
}

// ─── Paging ───────────────────────────────────────────────────────────────────
// Every provider caps the rows one response may carry, and none of them says so
// in a machine-readable way — a truncated answer just looks like a short one.
// So each fetcher asks for a known page size and keeps walking forward from the
// last bar it received until it reaches the end of the range or stops making
// progress. A silently truncated range is what used to get cached as a
// permanent hole.
const MAX_PAGES = 12

async function paginate(
  fetchPage: (cursorSec: number) => Promise<Candle[]>,
  fromSec: number,
  toSec: number,
  stepSec: number,
  pageLimit: number,
): Promise<Candle[]> {
  const out: Candle[] = []
  let cursor = fromSec
  for (let page = 0; page < MAX_PAGES && cursor < toSec; page++) {
    const rows = await fetchPage(cursor)
    if (rows.length === 0) break
    for (const c of rows) if (c.t >= fromSec && c.t < toSec) out.push(c)
    if (rows.length < pageLimit) break
    const next = rows[rows.length - 1].t + stepSec
    if (next <= cursor) break // provider is not advancing — stop rather than spin
    cursor = next
  }
  return dedupeSorted(out)
}

const num = (v: string | number | undefined): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? NaN)
  return Number.isFinite(n) ? n : NaN
}

function tsToSec(v: string | number | undefined): number {
  if (typeof v === 'string' && v.includes('-')) {
    const ms = Date.parse(v)
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN
  }
  try {
    return Number(BigInt(String(v)) / BigInt(1e9))
  } catch {
    return NaN
  }
}

// ─── Databento (futures + stocks) ──────────────────────────────────────────────

const DATABENTO_PAGE_LIMIT = 10000

interface DbnRow {
  hd?: { ts_event?: string | number; instrument_id?: number }
  ts_event?: string | number
  open?: string | number
  high?: string | number
  low?: string | number
  close?: string | number
  volume?: string | number
}

async function fetchDatabentoPage(
  apiKey: string,
  spec: DatabentoSpec,
  startSec: number,
  endSec: number,
  schema: DatabentoSchema,
): Promise<Candle[]> {
  const params = new URLSearchParams({
    dataset: spec.dataset,
    symbols: spec.symbols,
    stype_in: spec.stypeIn,
    schema,
    start: new Date(startSec * 1000).toISOString(),
    end: new Date(endSec * 1000).toISOString(),
    encoding: 'json',
    pretty_px: 'true',
    pretty_ts: 'true',
    limit: String(DATABENTO_PAGE_LIMIT),
  })

  const res = await fetch(`https://hist.databento.com/v0/timeseries.get_range?${params}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` },
    cache: 'no-store',
  })
  if (res.status === 429) throw new FetchError('rateLimited')
  if (res.status === 401 || res.status === 403) {
    console.error('[candles] Databento not entitled', res.status, spec.dataset, await res.text().catch(() => ''))
    throw new FetchError('noAccess')
  }
  if (!res.ok) {
    console.error('[candles] Databento error', res.status, await res.text().catch(() => ''))
    throw new FetchError('error')
  }

  const text = await res.text()
  const candles: Candle[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let row: DbnRow
    try {
      row = JSON.parse(trimmed)
    } catch {
      continue
    }
    const id = row.hd?.instrument_id
    const t = tsToSec(row.hd?.ts_event ?? row.ts_event)
    const o = num(row.open)
    const h = num(row.high)
    const l = num(row.low)
    const c = num(row.close)
    const v = num(row.volume)
    if (![t, o, h, l, c].every(Number.isFinite)) continue
    // Some venues publish a priceless bar for off-book activity (ICE reports
    // block trades that way). Charted as-is it would drag the axis to zero.
    if (o === 0 && h === 0 && l === 0 && c === 0) continue
    candles.push({
      t,
      o,
      h,
      l,
      c,
      v: Number.isFinite(v) ? v : 0,
      // Only a parent request mixes contracts, and only then does the id matter.
      ...(spec.stypeIn === 'parent' && typeof id === 'number' ? { id } : {}),
    })
  }
  candles.sort((a, b) => a.t - b.t)
  return candles
}

async function fetchDatabento(
  apiKey: string,
  spec: DatabentoSpec,
  startSec: number,
  endSec: number,
  intervalSec: number,
): Promise<Candle[]> {
  const { schema, nativeSec } = intervalToDatabento(intervalSec)
  const native = await paginate(
    (cursor) => fetchDatabentoPage(apiKey, spec, cursor, endSec, schema),
    startSec,
    endSec,
    nativeSec,
    DATABENTO_PAGE_LIMIT,
  )
  return aggregate(native, nativeSec, intervalSec)
}

// ─── Polygon.io (forex) ─────────────────────────────────────────────────────────

const POLYGON_PAGE_LIMIT = 10000

interface PolyBar {
  t: number // ms
  o: number
  h: number
  l: number
  c: number
  v?: number
}

async function fetchPolygonPage(
  apiKey: string,
  ticker: string,
  startSec: number,
  endSec: number,
  intervalSec: number,
): Promise<Candle[]> {
  const { multiplier, timespan } = intervalToPolygon(intervalSec)
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/` +
    `${startSec * 1000}/${endSec * 1000}?adjusted=true&sort=asc&limit=${POLYGON_PAGE_LIMIT}&apiKey=${apiKey}`

  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 429) throw new FetchError('rateLimited')
  if (res.status === 401 || res.status === 403) {
    console.error('[candles] Polygon not entitled', res.status, await res.text().catch(() => ''))
    throw new FetchError('noAccess')
  }
  if (!res.ok) {
    console.error('[candles] Polygon error', res.status, await res.text().catch(() => ''))
    throw new FetchError('error')
  }
  const data = (await res.json()) as { results?: PolyBar[] }
  const rows = Array.isArray(data.results) ? data.results : []
  return rows
    .map((r) => ({ t: Math.floor(r.t / 1000), o: r.o, h: r.h, l: r.l, c: r.c, v: Number.isFinite(r.v) ? r.v! : 0 }))
    .filter((c) => Number.isFinite(c.t) && [c.o, c.h, c.l, c.c].every(Number.isFinite))
}

// ─── Binance (crypto) ────────────────────────────────────────────────────────────

// Public market-data host — no API key, and dedicated to historical data so it
// doesn't consume the trading API's rate-limit quota. Configurable for regions
// where the primary host is blocked.
const BINANCE_BASE = process.env.BINANCE_API_BASE || 'https://data-api.binance.vision'
const BINANCE_PAGE_LIMIT = 1000

async function fetchBinancePage(
  symbol: string,
  startSec: number,
  endSec: number,
  intervalSec: number,
): Promise<Candle[]> {
  const interval = intervalToBinance(intervalSec)
  const url =
    `${BINANCE_BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}` +
    `&startTime=${startSec * 1000}&endTime=${endSec * 1000}&limit=${BINANCE_PAGE_LIMIT}`
  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 429 || res.status === 418) throw new FetchError('rateLimited')
  // Binance needs no key, but a region-blocked or proxied BINANCE_API_BASE
  // answers 401/403 — permanent for this deployment, not a transient blip.
  if (res.status === 401 || res.status === 403) {
    console.error('[candles] Binance not accessible', res.status, await res.text().catch(() => ''))
    throw new FetchError('noAccess')
  }
  if (!res.ok) {
    console.error('[candles] Binance error', res.status, await res.text().catch(() => ''))
    throw new FetchError('error')
  }
  const rows = (await res.json()) as unknown[]
  if (!Array.isArray(rows)) return []
  return (rows as (string | number)[][])
    .map((r) => ({
      t: Math.floor(Number(r[0]) / 1000),
      o: Number(r[1]),
      h: Number(r[2]),
      l: Number(r[3]),
      c: Number(r[4]),
      v: Number(r[5]),
    }))
    .filter((c) => Number.isFinite(c.t) && [c.o, c.h, c.l, c.c].every(Number.isFinite))
}

// ─── Provider dispatch ───────────────────────────────────────────────────────────

/** Fetch `[fromSec, toSec)` at `intervalSec` from whichever provider serves this feed. */
async function fetchFromProvider(
  feed: Feed,
  apiKey: string | undefined,
  fromSec: number,
  toSec: number,
  intervalSec: number,
): Promise<Candle[]> {
  if (feed.provider === 'databento') {
    return fetchDatabento(apiKey!, feed.databento!, fromSec, toSec, intervalSec)
  }
  if (feed.provider === 'polygon') {
    return paginate(
      (cursor) => fetchPolygonPage(apiKey!, feed.polygonTicker!, cursor, toSec, intervalSec),
      fromSec,
      toSec,
      intervalSec,
      POLYGON_PAGE_LIMIT,
    )
  }
  return paginate(
    (cursor) => fetchBinancePage(feed.binanceSymbol!, cursor, toSec, intervalSec),
    fromSec,
    toSec,
    intervalSec,
    BINANCE_PAGE_LIMIT,
  )
}

// ─── Window loading ──────────────────────────────────────────────────────────────

interface Window {
  start: number
  end: number
  intervalSec: number
  chunkSpanSec: number
  /** The trade's own span — a fetch failure over it is fatal, one over the padding is not. */
  entrySec: number
  closeSec: number
  nowSec: number
  availableUntil: number
}

interface WindowResult {
  candles: Candle[]
  softError: SoftError | null
  failedInsideTrade: boolean
}

/** Serve one feed's window: cached chunks where possible, provider calls for the rest. */
async function loadWindow(feed: Feed, apiKey: string | undefined, w: Window): Promise<WindowResult> {
  const { start, end, intervalSec, chunkSpanSec, entrySec, closeSec, nowSec, availableUntil } = w
  const starts = chunkStartsFor(start, end, chunkSpanSec)

  // ── Read whatever the shared cache already holds for these chunks ──────────
  const rows = await db
    .select()
    .from(marketCandleChunks)
    .where(
      and(
        eq(marketCandleChunks.feedKey, feed.cacheKey),
        eq(marketCandleChunks.intervalSec, intervalSec),
        inArray(marketCandleChunks.chunkStart, starts),
      ),
    )

  const byStart = new Map<number, Candle[]>()
  const missing: number[] = []
  const cached = new Map(rows.map((r) => [r.chunkStart, r]))
  for (const s of starts) {
    const row = cached.get(s)
    if (!row) {
      missing.push(s)
      continue
    }
    const candles = row.candles as Candle[]
    const fresh = isChunkFresh(
      {
        chunkStart: s,
        complete: row.complete,
        empty: candles.length === 0,
        fetchedAtSec: Math.floor(row.fetchedAt.getTime() / 1000),
      },
      chunkSpanSec,
      nowSec,
    )
    if (fresh) byStart.set(s, candles)
    else missing.push(s)
  }

  // ── Fill the gaps, one provider call per run of adjacent chunks ────────────
  let softError: SoftError | null = null
  let failedInsideTrade = false

  for (const group of groupConsecutive(missing, chunkSpanSec, maxChunksPerRequest(chunkSpanSec, intervalSec))) {
    // Never ask beyond what the provider can have published yet — the tail of
    // the range is stored as an incomplete chunk and re-fetched later.
    const reqTo = Math.min(group.toSec, availableUntil)
    if (reqTo <= group.fromSec) continue

    let fetched: Candle[]
    try {
      fetched = await fetchFromProvider(feed, apiKey, group.fromSec, reqTo, intervalSec)
    } catch (e) {
      if (e instanceof FetchError) softError = e.soft
      else {
        console.error('[candles] fetch failed', e)
        softError = 'error'
      }
      // A gap in the padding only shortens the chart; a gap over the trade
      // itself would misplace the execution markers, so that one is fatal.
      if (overlaps(group.fromSec, reqTo, entrySec, closeSec + 1)) failedInsideTrade = true
      continue
    }

    const split = splitIntoChunks(fetched, group.starts, chunkSpanSec)
    const values = group.starts.map((s) => ({
      feedKey: feed.cacheKey,
      intervalSec,
      chunkStart: s,
      candles: split.get(s) ?? [],
      // Only a final, non-empty chunk is settled for good. Empty ones keep a
      // TTL so a weekend, a not-yet-listed contract or a provider blip is
      // retried instead of poisoning this window forever.
      complete: chunkIsFinal(s, chunkSpanSec, nowSec) && (split.get(s)?.length ?? 0) > 0,
      fetchedAt: new Date(),
    }))

    for (const [s, list] of split) byStart.set(s, list)

    // Per-chunk upsert: concurrent readers of the same instrument write
    // disjoint rows, so nobody can clobber another writer's range.
    await db
      .insert(marketCandleChunks)
      .values(values)
      .onConflictDoUpdate({
        target: [marketCandleChunks.feedKey, marketCandleChunks.intervalSec, marketCandleChunks.chunkStart],
        set: {
          candles: sql`excluded.candles`,
          complete: sql`excluded.complete`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      })
  }

  const merged = starts.flatMap((s) => byStart.get(s) ?? [])
  return { candles: sliceCandles(merged, start, end), softError, failedInsideTrade }
}

// ─── Contract identification ─────────────────────────────────────────────────────

/** One day of daily bars is enough to tell which expiry traded through a price. */
const PROBE_INTERVAL_SEC = 86400

/**
 * Find the exact contract a futures trade was executed in, by asking for one
 * day of daily bars across every listed expiry of the root and keeping the one
 * that traded through the fill price. The probe goes through the same chunk
 * cache as everything else, so a trade costs it once, globally.
 */
async function resolveExactContract(
  feed: Feed,
  apiKey: string | undefined,
  w: Window,
  entryPrice: number,
): Promise<Feed | null> {
  const spec = feed.databento
  if (!spec) return null
  const root = spec.symbols.split('.')[0]

  const dayStart = Math.floor(w.entrySec / PROBE_INTERVAL_SEC) * PROBE_INTERVAL_SEC
  const probe = await loadWindow(futuresParentFeed(root, spec.dataset), apiKey, {
    ...w,
    start: dayStart,
    end: Math.min(dayStart + PROBE_INTERVAL_SEC, w.availableUntil),
    intervalSec: PROBE_INTERVAL_SEC,
    chunkSpanSec: PROBE_INTERVAL_SEC,
  })

  const id = pickContract(probe.candles, entryPrice)
  return id === null ? null : futuresInstrumentFeed(id, spec.dataset)
}

// ─── Orchestration ───────────────────────────────────────────────────────────────

export const getTradeCandles = authedAction(
  [uuid],
  async ({ userId }, tradeId): Promise<CandlesResult> => {
    const trade = await db.query.trades.findFirst({
      where: and(eq(trades.id, tradeId), eq(trades.userId, userId)),
    })
    if (!trade) return { status: 'error' }

    const feed = resolveFeed(trade.assetClass, trade.symbol)
    if (!feed) return { status: 'unsupported' }

    // Per-provider credentials. Binance needs none; Databento/Polygon do.
    const apiKey =
      feed.provider === 'databento'
        ? process.env.DATABENTO_API_KEY
        : feed.provider === 'polygon'
          ? process.env.POLYGON_API_KEY
          : undefined
    if (feed.provider !== 'binance' && !apiKey) return { status: 'noKey' }

    const entrySec = Math.floor(new Date(trade.entryDatetime).getTime() / 1000)
    const exitSec = trade.exitDatetime ? Math.floor(new Date(trade.exitDatetime).getTime() / 1000) : null
    if (!Number.isFinite(entrySec)) return { status: 'error' }

    const nowSec = Math.floor(Date.now() / 1000)
    const availableUntil = nowSec - AVAILABILITY_LAG_SEC

    // Historical data providers only cover past days — a trade opened today has
    // no historical candles yet, so surface a dedicated message instead of an
    // empty "no data" chart.
    const startOfTodaySec = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000)
    if (entrySec >= startOfTodaySec) return { status: 'today' }

    const closeSec = exitSec !== null && Number.isFinite(exitSec) ? exitSec : entrySec
    const { intervalSec, paddingSec, chunkSpanSec } = pickResolution(closeSec - entrySec)

    const start = entrySec - paddingSec
    const end = Math.min(closeSec + paddingSec, availableUntil)
    // The whole window still sits inside the provider's publishing lag.
    if (end <= start) return { status: 'today' }

    const window: Window = { start, end, intervalSec, chunkSpanSec, entrySec, closeSec, nowSec, availableUntil }
    const entryPrice = Number(trade.entryPrice)
    const canMatchFill = Number.isFinite(entryPrice) && entryPrice > 0

    // ── Pick the contract the trade was actually executed in ──────────────────
    // For a bare futures root the expiry is a guess, and the front month is the
    // wrong guess whenever the trade was executed elsewhere — around a roll,
    // where volume moves days before the provider's continuous series does, or
    // because the trader deliberately chose a far-dated contract. The fills
    // settle it: a contract the trade could not have filled in is not the one
    // to chart. Neither a transport failure nor a root the provider doesn't
    // know gets any better by looking further, so those stop at the front month.
    const front = await loadWindow(feed, apiKey, window)
    let loaded = front

    const guessedExpiry = feed.contractRank !== undefined
    const mismatched =
      guessedExpiry &&
      canMatchFill &&
      !front.softError &&
      front.candles.length > 0 &&
      !bracketsPrice(front.candles, entryPrice)

    if (mismatched) {
      const exact = await resolveExactContract(feed, apiKey, window, entryPrice)
      // No contract of this root traded at that price: keep the front month —
      // an approximate chart still beats an empty one.
      if (exact) loaded = await loadWindow(exact, apiKey, window)
    }

    if (loaded.failedInsideTrade && loaded.softError) return { status: loaded.softError }
    if (loaded.candles.length > 0) return { status: 'ok', intervalSec, candles: loaded.candles }
    // Nothing at all: report the provider failure if there was one, since
    // "no market data" would blame the instrument for a transport problem.
    return { status: loaded.softError ?? 'noData' }
  },
  { limit: ['candles', 'candlesDaily'] },
)
