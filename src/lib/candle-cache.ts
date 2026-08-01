// Time-chunked candle cache: the pure math behind the shared market-data cache.
// Kept free of 'use server' and of any DB/provider import so it can be unit-tested.
//
// Why chunks instead of one covered span per instrument:
//   A single `[fromSec, toSec]` envelope per instrument has to be trusted
//   blindly, so any hole inside it (a provider row cap, a hiccup, an empty
//   answer) is cached as "covered" and turns into a permanent
//   "No market data available" for every trade landing in that hole. Fixed,
//   epoch-aligned chunks make coverage self-describing instead: a chunk row
//   either exists (and holds exactly what the provider returned for its span)
//   or it does not. Nothing can claim coverage it does not have, rows stay
//   small enough to fetch in one provider call, and concurrent writers touch
//   different rows.

import type { Candle } from './market-data'

/** Providers publish historical bars with a short delay; treat that tail as not-yet-final. */
export const AVAILABILITY_LAG_SEC = 20 * 60

/** A chunk that is not final yet (its span reaches into the availability lag) is re-fetched this often. */
export const RECENT_TTL_SEC = 15 * 60

/**
 * A final chunk that came back empty is re-fetched at most this often. Empty is
 * legitimate (weekend, holiday, contract not listed yet) but also what a broken
 * symbol or a provider blip looks like, so it must never be cached forever.
 */
export const EMPTY_TTL_SEC = 12 * 3600

/** Upper bound on candles requested in a single provider call (all of them cap rows server-side). */
export const MAX_ROWS_PER_REQUEST = 20000

/** Upper bound on chunks touched by one chart request, so a decade-long position stays cheap. */
export const MAX_CHUNKS_PER_QUERY = 96

export interface Resolution {
  /** Bar size of the chart. */
  intervalSec: number
  /** Context shown before entry / after exit. */
  paddingSec: number
  /** Cache chunk span; always a whole multiple of `intervalSec`. */
  chunkSpanSec: number
}

// Bar size scales with how long the position was held: a scalp wants minutes,
// a swing wants hours, a multi-month position wants days. Each step keeps a
// chunk at ≤ 1440 rows, which is far below every provider's row cap.
const RESOLUTIONS: Array<Resolution & { maxDurationSec: number }> = [
  { maxDurationSec: 8 * 3600, intervalSec: 60, paddingSec: 2 * 3600, chunkSpanSec: 86400 },
  { maxDurationSec: 7 * 86400, intervalSec: 1800, paddingSec: 8 * 3600, chunkSpanSec: 7 * 86400 },
  { maxDurationSec: 90 * 86400, intervalSec: 3600, paddingSec: 24 * 3600, chunkSpanSec: 30 * 86400 },
  { maxDurationSec: Infinity, intervalSec: 86400, paddingSec: 30 * 86400, chunkSpanSec: 365 * 86400 },
]

/** Bar size, padding and chunk span for a position held `durationSec`. */
export function pickResolution(durationSec: number): Resolution {
  const d = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0
  const r = RESOLUTIONS.find((x) => d <= x.maxDurationSec) ?? RESOLUTIONS[RESOLUTIONS.length - 1]
  return { intervalSec: r.intervalSec, paddingSec: r.paddingSec, chunkSpanSec: r.chunkSpanSec }
}

/** Start of the chunk holding `sec`. Chunks are epoch-aligned, so every caller agrees on boundaries. */
export function chunkStartFor(sec: number, spanSec: number): number {
  return Math.floor(sec / spanSec) * spanSec
}

/**
 * Chunk starts covering `[startSec, endSec]`, oldest first. Capped at
 * `MAX_CHUNKS_PER_QUERY` — the newest chunks win, so an absurdly long window
 * degrades to a shorter chart instead of a huge fan-out of provider calls.
 */
export function chunkStartsFor(startSec: number, endSec: number, spanSec: number): number[] {
  const first = chunkStartFor(startSec, spanSec)
  const last = chunkStartFor(endSec, spanSec)
  const starts: number[] = []
  for (let s = first; s <= last; s += spanSec) starts.push(s)
  return starts.length > MAX_CHUNKS_PER_QUERY ? starts.slice(starts.length - MAX_CHUNKS_PER_QUERY) : starts
}

/** How many chunks may share one provider request without risking its row cap. */
export function maxChunksPerRequest(spanSec: number, intervalSec: number): number {
  const rowsPerChunk = Math.max(1, Math.ceil(spanSec / intervalSec))
  return Math.max(1, Math.floor(MAX_ROWS_PER_REQUEST / rowsPerChunk))
}

export interface ChunkRange {
  /** Inclusive start of the first chunk. */
  fromSec: number
  /** Exclusive end of the last chunk. */
  toSec: number
  starts: number[]
}

/**
 * Fold missing chunk starts into as few provider requests as possible: adjacent
 * chunks are fetched together, gaps break the run, and no request covers more
 * than `maxPerGroup` chunks.
 */
export function groupConsecutive(starts: number[], spanSec: number, maxPerGroup: number): ChunkRange[] {
  const sorted = [...starts].sort((a, b) => a - b)
  const groups: ChunkRange[] = []
  for (const s of sorted) {
    const open = groups[groups.length - 1]
    if (open && open.toSec === s && open.starts.length < maxPerGroup) {
      open.toSec = s + spanSec
      open.starts.push(s)
    } else {
      groups.push({ fromSec: s, toSec: s + spanSec, starts: [s] })
    }
  }
  return groups
}

/** True once a chunk's whole span lies in the past far enough that its bars can no longer change. */
export function chunkIsFinal(chunkStart: number, spanSec: number, nowSec: number): boolean {
  return chunkStart + spanSec <= nowSec - AVAILABILITY_LAG_SEC
}

export interface CachedChunk {
  chunkStart: number
  /** Set when the chunk was final *and* non-empty at write time — then it never needs re-fetching. */
  complete: boolean
  empty: boolean
  fetchedAtSec: number
}

/** Whether a cached chunk may be served as-is, or has to be re-fetched. */
export function isChunkFresh(chunk: CachedChunk, spanSec: number, nowSec: number): boolean {
  if (chunk.complete) return true
  const final = chunkIsFinal(chunk.chunkStart, spanSec, nowSec)
  const ttl = chunk.empty && final ? EMPTY_TTL_SEC : RECENT_TTL_SEC
  return nowSec - chunk.fetchedAtSec < ttl
}

/** Bucket freshly fetched candles into the chunks they belong to; every requested start gets an entry. */
export function splitIntoChunks(candles: Candle[], starts: number[], spanSec: number): Map<number, Candle[]> {
  const out = new Map<number, Candle[]>()
  for (const s of starts) out.set(s, [])
  for (const c of candles) {
    const bucket = out.get(chunkStartFor(c.t, spanSec))
    if (bucket) bucket.push(c)
  }
  for (const list of out.values()) list.sort((a, b) => a.t - b.t)
  return out
}

/** Sort ascending and drop duplicate timestamps (last write wins), as providers may overlap pages. */
export function dedupeSorted(candles: Candle[]): Candle[] {
  const byT = new Map<number, Candle>()
  for (const c of candles) byT.set(c.t, c)
  return Array.from(byT.values()).sort((a, b) => a.t - b.t)
}

/** Roll `fromSec` bars up into `toSec` bars (e.g. 1m → 30m). */
export function aggregate(candles: Candle[], fromSec: number, toSec: number): Candle[] {
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

/** Narrow a chunk-aligned superset down to the window a trade actually asked for. */
export function sliceCandles(candles: Candle[], startSec: number, endSec: number): Candle[] {
  return candles.filter((c) => c.t >= startSec && c.t <= endSec)
}

/** Whether two half-open ranges share any time at all. */
export function overlaps(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom < bTo && bFrom < aTo
}
