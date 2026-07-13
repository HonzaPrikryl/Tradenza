'use server'

import { db, trades, marketCandles } from '@/lib/db'
import { and, eq } from 'drizzle-orm'
import { uuid } from '@/lib/validation'
import { authedAction } from '@/lib/safe-action'
import { resolveFeed, intervalToPolygon, intervalToBinance, type Candle, type DatabentoSpec } from '@/lib/market-data'

// Historical sources:
//   futures / stocks → Databento  https://databento.com/docs/api-reference-historical
//   forex            → Polygon.io https://polygon.io/docs/rest/forex/aggregates
//   crypto           → Binance    https://developers.binance.com/docs/binance-spot-api-docs

export type { Candle }

export type CandlesResult =
  | { status: 'ok'; intervalSec: number; candles: Candle[] }
  | { status: 'noKey' | 'unsupported' | 'noData' | 'error' | 'rateLimited' | 'today' }

// A soft failure a fetcher can raise to distinguish a transient rate-limit
// (HTTP 429) from a generic error, so the UI can show a fitting message.
type SoftError = 'error' | 'rateLimited'
class FetchError extends Error {
  constructor(public readonly soft: SoftError) {
    super(soft)
  }
}

const PADDING_BY_INTERVAL: Record<number, number> = {
  60: 2 * 3600,
  1800: 8 * 3600,
  3600: 24 * 3600,
}
const AVAILABILITY_LAG = 20 * 60

function aggregate(candles: Candle[], fromSec: number, toSec: number): Candle[] {
  if (toSec === fromSec) return candles
  const out: Candle[] = []
  let bucket: Candle | null = null
  for (const c of candles) {
    const t = Math.floor(c.t / toSec) * toSec
    if (!bucket || bucket.t !== t) {
      if (bucket) out.push(bucket)
      bucket = { t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v }
    } else {
      bucket.h = Math.max(bucket.h, c.h)
      bucket.l = Math.min(bucket.l, c.l)
      bucket.c = c.c
      bucket.v += c.v
    }
  }
  if (bucket) out.push(bucket)
  return out
}

/** Merge two candle lists, dedupe by timestamp (newer wins), keep ascending. */
function mergeCandles(a: Candle[], b: Candle[]): Candle[] {
  if (a.length === 0) return b
  if (b.length === 0) return a
  const byT = new Map<number, Candle>()
  for (const c of a) byT.set(c.t, c)
  for (const c of b) byT.set(c.t, c)
  return Array.from(byT.values()).sort((x, y) => x.t - y.t)
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

interface DbnRow {
  hd?: { ts_event?: string | number }
  ts_event?: string | number
  open?: string | number
  high?: string | number
  low?: string | number
  close?: string | number
  volume?: string | number
}

async function fetchDatabento(
  apiKey: string,
  spec: DatabentoSpec,
  startSec: number,
  endSec: number,
  schema: 'ohlcv-1m' | 'ohlcv-1h',
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
    limit: '50000',
  })

  const res = await fetch(`https://hist.databento.com/v0/timeseries.get_range?${params}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` },
    cache: 'no-store',
  })
  if (res.status === 429) throw new FetchError('rateLimited')
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
    const t = tsToSec(row.hd?.ts_event ?? row.ts_event)
    const o = num(row.open)
    const h = num(row.high)
    const l = num(row.low)
    const c = num(row.close)
    const v = num(row.volume)
    if (![t, o, h, l, c].every(Number.isFinite)) continue
    candles.push({ t, o, h, l, c, v: Number.isFinite(v) ? v : 0 })
  }
  candles.sort((a, b) => a.t - b.t)
  return candles
}

// ─── Polygon.io (forex) ─────────────────────────────────────────────────────────

interface PolyBar {
  t: number // ms
  o: number
  h: number
  l: number
  c: number
  v?: number
}

async function fetchPolygon(
  apiKey: string,
  ticker: string,
  startSec: number,
  endSec: number,
  intervalSec: number,
): Promise<Candle[]> {
  const { multiplier, timespan } = intervalToPolygon(intervalSec)
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/` +
    `${startSec * 1000}/${endSec * 1000}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`

  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 429) throw new FetchError('rateLimited')
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

async function fetchBinance(symbol: string, startSec: number, endSec: number, intervalSec: number): Promise<Candle[]> {
  const interval = intervalToBinance(intervalSec)
  const endMs = endSec * 1000
  const out: Candle[] = []
  let cursor = startSec * 1000

  // Binance caps klines at 1000 rows/request; page forward until the window is
  // covered (bounded to keep a single trade's fetch cheap).
  for (let page = 0; page < 25 && cursor < endMs; page++) {
    const url = `${BINANCE_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${cursor}&endTime=${endMs}&limit=1000`
    const res = await fetch(url, { cache: 'no-store' })
    if (res.status === 429 || res.status === 418) throw new FetchError('rateLimited')
    if (!res.ok) {
      console.error('[candles] Binance error', res.status, await res.text().catch(() => ''))
      throw new FetchError('error')
    }
    const rows = (await res.json()) as unknown[]
    if (!Array.isArray(rows) || rows.length === 0) break
    for (const r of rows as (string | number)[][]) {
      out.push({
        t: Math.floor(Number(r[0]) / 1000),
        o: Number(r[1]),
        h: Number(r[2]),
        l: Number(r[3]),
        c: Number(r[4]),
        v: Number(r[5]),
      })
    }
    if (rows.length < 1000) break
    cursor = Number((rows[rows.length - 1] as (string | number)[])[0]) + 1
  }
  return out.filter((c) => Number.isFinite(c.t) && [c.o, c.h, c.l, c.c].every(Number.isFinite))
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
    const nowSec = Math.floor(Date.now() / 1000) - AVAILABILITY_LAG

    // Historical data providers only cover past days — a trade opened today has
    // no historical candles yet, so surface a dedicated message instead of an
    // empty "no data" chart.
    const startOfTodaySec = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000)
    if (entrySec >= startOfTodaySec) return { status: 'today' }

    const duration = (exitSec ?? entrySec) - entrySec
    let schema: 'ohlcv-1m' | 'ohlcv-1h' = 'ohlcv-1m'
    let intervalSec = 60
    if (duration > 7 * 86400) {
      schema = 'ohlcv-1h'
      intervalSec = 3600
    } else if (duration > 8 * 3600) {
      intervalSec = 1800 // 1m → aggregate to 30m
    }
    const padding = PADDING_BY_INTERVAL[intervalSec]

    const start = entrySec - padding
    const end = Math.min((exitSec ?? entrySec) + padding, nowSec)
    if (end <= start) return { status: 'noData' }

    const symbolRoot = feed.cacheKey
    let softError: SoftError = 'error'

    // Fetch one time span from the right provider, normalised to `intervalSec`.
    const fetchSpan = async (spanStart: number, spanEnd: number): Promise<Candle[] | null> => {
      if (spanEnd <= spanStart) return []
      try {
        if (feed.provider === 'databento') {
          const span = await fetchDatabento(apiKey!, feed.databento!, spanStart, spanEnd, schema)
          return intervalSec === 1800 ? aggregate(span, 60, 1800) : span
        }
        if (feed.provider === 'polygon') {
          return await fetchPolygon(apiKey!, feed.polygonTicker!, spanStart, spanEnd, intervalSec)
        }
        return await fetchBinance(feed.binanceSymbol!, spanStart, spanEnd, intervalSec)
      } catch (e) {
        if (e instanceof FetchError) softError = e.soft
        else console.error('[candles] fetch failed', e)
        return null
      }
    }

    // Slice the merged superset down to the window this trade actually wants.
    const slice = (all: Candle[]): Candle[] => all.filter((c) => c.t >= start && c.t <= end)

    // Global cache shared across all users: candles for a given feed + interval
    // are identical for everyone, so a span fetched once serves every user's trade.
    const cached = await db.query.marketCandles.findFirst({
      where: and(eq(marketCandles.symbolRoot, symbolRoot), eq(marketCandles.intervalSec, intervalSec)),
    })

    // Cache hit: requested window already within the covered span → no fetch.
    if (cached && cached.fromSec <= start && cached.toSec >= end) {
      const hit = slice(cached.candles as Candle[])
      return hit.length > 0 ? { status: 'ok', intervalSec, candles: hit } : { status: 'noData' }
    }

    if (!cached) {
      const fetched = await fetchSpan(start, end)
      if (fetched === null) return { status: softError }
      await db
        .insert(marketCandles)
        .values({ symbolRoot, intervalSec, fromSec: start, toSec: end, candles: fetched })
        .onConflictDoUpdate({
          target: [marketCandles.symbolRoot, marketCandles.intervalSec],
          set: { fromSec: start, toSec: end, candles: fetched, updatedAt: new Date() },
        })
      const out = slice(fetched)
      return out.length > 0 ? { status: 'ok', intervalSec, candles: out } : { status: 'noData' }
    }

    // Partial hit: extend the covered envelope by fetching only the missing edges.
    const newFrom = Math.min(start, cached.fromSec)
    const newTo = Math.max(end, cached.toSec)
    let merged = cached.candles as Candle[]

    if (newFrom < cached.fromSec) {
      const left = await fetchSpan(newFrom, cached.fromSec)
      if (left === null) return { status: softError }
      merged = mergeCandles(left, merged)
    }
    if (newTo > cached.toSec) {
      const right = await fetchSpan(cached.toSec, newTo)
      if (right === null) return { status: softError }
      merged = mergeCandles(merged, right)
    }

    await db
      .update(marketCandles)
      .set({ fromSec: newFrom, toSec: newTo, candles: merged, updatedAt: new Date() })
      .where(and(eq(marketCandles.symbolRoot, symbolRoot), eq(marketCandles.intervalSec, intervalSec)))

    const out = slice(merged)
    return out.length > 0 ? { status: 'ok', intervalSec, candles: out } : { status: 'noData' }
  },
  { limit: ['candles', 'candlesDaily'] },
)
