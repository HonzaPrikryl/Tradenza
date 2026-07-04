'use server'

import { db, trades, marketCandles } from '@/lib/db'
import { and, eq } from 'drizzle-orm'
import { uuid } from '@/lib/validation'
import { authedAction } from '@/lib/safe-action'

// Historical API: https://databento.com/docs/api-reference-historical

export interface Candle {
  /** Unix seconds (UTC). */
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export type CandlesResult =
  | { status: 'ok'; intervalSec: number; candles: Candle[] }
  | { status: 'noKey' | 'unsupported' | 'noData' | 'error' }

const PADDING_BY_INTERVAL: Record<number, number> = {
  60: 2 * 3600,
  1800: 8 * 3600,
  3600: 24 * 3600,
}
const AVAILABILITY_LAG = 20 * 60

const MONTH_CODE = /[FGHJKMNQUVXZ]\d{1,2}$/

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

interface DbnRow {
  hd?: { ts_event?: string | number }
  ts_event?: string | number
  open?: string | number
  high?: string | number
  low?: string | number
  close?: string | number
  volume?: string | number
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

async function fetchDatabento(
  apiKey: string,
  symbolRoot: string,
  startSec: number,
  endSec: number,
  schema: 'ohlcv-1m' | 'ohlcv-1h',
): Promise<Candle[] | null> {
  const params = new URLSearchParams({
    dataset: 'GLBX.MDP3',
    symbols: `${symbolRoot}.v.0`,
    stype_in: 'continuous',
    schema,
    start: new Date(startSec * 1000).toISOString(),
    end: new Date(endSec * 1000).toISOString(),
    encoding: 'json',
    pretty_px: 'true',
    pretty_ts: 'true',
    limit: '50000',
  })

  const res = await fetch(`https://hist.databento.com/v0/timeseries.get_range?${params}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    console.error('[candles] Databento error', res.status, await res.text().catch(() => ''))
    return null
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

export const getTradeCandles = authedAction([uuid], async ({ userId }, tradeId): Promise<CandlesResult> => {
  const trade = await db.query.trades.findFirst({
    where: and(eq(trades.id, tradeId), eq(trades.userId, userId)),
  })
  if (!trade) return { status: 'error' }
  if (trade.assetClass !== 'futures') return { status: 'unsupported' }

  const apiKey = process.env.DATABENTO_API_KEY
  if (!apiKey) return { status: 'noKey' }

  const entrySec = Math.floor(new Date(trade.entryDatetime).getTime() / 1000)
  const exitSec = trade.exitDatetime ? Math.floor(new Date(trade.exitDatetime).getTime() / 1000) : null
  const nowSec = Math.floor(Date.now() / 1000) - AVAILABILITY_LAG

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

  const symbolRoot = trade.symbol.toUpperCase().replace(MONTH_CODE, '')

  // Fetch one time span from Databento and aggregate it to `intervalSec` if needed.
  const fetchSpan = async (spanStart: number, spanEnd: number): Promise<Candle[] | null> => {
    if (spanEnd <= spanStart) return []
    let span: Candle[] | null
    try {
      span = await fetchDatabento(apiKey, symbolRoot, spanStart, spanEnd, schema)
    } catch (e) {
      console.error('[candles] fetch failed', e)
      return null
    }
    if (span === null) return null
    return intervalSec === 1800 ? aggregate(span, 60, 1800) : span
  }

  // Slice the merged superset down to the window this trade actually wants.
  const slice = (all: Candle[]): Candle[] => all.filter((c) => c.t >= start && c.t <= end)

  // Global cache shared across all users: candles for a continuous root + interval
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
    if (fetched === null) return { status: 'error' }
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
    if (left === null) return { status: 'error' }
    merged = mergeCandles(left, merged)
  }
  if (newTo > cached.toSec) {
    const right = await fetchSpan(cached.toSec, newTo)
    if (right === null) return { status: 'error' }
    merged = mergeCandles(merged, right)
  }

  await db
    .update(marketCandles)
    .set({ fromSec: newFrom, toSec: newTo, candles: merged, updatedAt: new Date() })
    .where(and(eq(marketCandles.symbolRoot, symbolRoot), eq(marketCandles.intervalSec, intervalSec)))

  const out = slice(merged)
  return out.length > 0 ? { status: 'ok', intervalSec, candles: out } : { status: 'noData' }
})
