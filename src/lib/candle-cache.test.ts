import { describe, it, expect } from 'vitest'
import {
  AVAILABILITY_LAG_SEC,
  EMPTY_TTL_SEC,
  MAX_CHUNKS_PER_QUERY,
  MAX_ROWS_PER_REQUEST,
  RECENT_TTL_SEC,
  aggregate,
  bracketsPrice,
  chunkIsFinal,
  chunkStartFor,
  chunkStartsFor,
  dedupeSorted,
  groupConsecutive,
  isChunkFresh,
  maxChunksPerRequest,
  overlaps,
  pickContract,
  pickResolution,
  sliceCandles,
  splitIntoChunks,
} from './candle-cache'
import type { Candle } from './market-data'

const candle = (t: number, price = 1): Candle => ({ t, o: price, h: price, l: price, c: price, v: 1 })

describe('pickResolution', () => {
  it('scales the bar size with how long the position was held', () => {
    expect(pickResolution(30).intervalSec).toBe(60) // seconds-long scalp
    expect(pickResolution(2 * 3600).intervalSec).toBe(60)
    expect(pickResolution(2 * 86400).intervalSec).toBe(1800)
    expect(pickResolution(30 * 86400).intervalSec).toBe(3600)
    expect(pickResolution(2 * 365 * 86400).intervalSec).toBe(86400)
  })

  it('treats a missing or nonsensical duration as a point in time', () => {
    expect(pickResolution(0).intervalSec).toBe(60)
    expect(pickResolution(-5).intervalSec).toBe(60)
    expect(pickResolution(NaN).intervalSec).toBe(60)
  })

  it('keeps every chunk a whole number of bars, small enough for one provider call', () => {
    for (const d of [0, 3600, 3 * 86400, 30 * 86400, 5 * 365 * 86400]) {
      const { intervalSec, chunkSpanSec } = pickResolution(d)
      expect(chunkSpanSec % intervalSec).toBe(0)
      expect(chunkSpanSec / intervalSec).toBeLessThanOrEqual(1440)
    }
  })
})

describe('chunkStartsFor', () => {
  const day = 86400

  it('covers the whole window, aligned to the epoch', () => {
    const starts = chunkStartsFor(day * 10 + 100, day * 12 + 500, day)
    expect(starts).toEqual([day * 10, day * 11, day * 12])
  })

  it('returns a single chunk when the window sits inside one', () => {
    expect(chunkStartsFor(day * 10 + 100, day * 10 + 200, day)).toEqual([day * 10])
  })

  it('keeps the newest chunks when a window would need too many', () => {
    const starts = chunkStartsFor(0, day * 500, day)
    expect(starts).toHaveLength(MAX_CHUNKS_PER_QUERY)
    expect(starts[starts.length - 1]).toBe(day * 500)
  })

  it('agrees with chunkStartFor on boundaries', () => {
    expect(chunkStartFor(day * 3, day)).toBe(day * 3)
    expect(chunkStartFor(day * 3 - 1, day)).toBe(day * 2)
  })
})

describe('groupConsecutive', () => {
  const day = 86400

  it('folds adjacent chunks into one provider request', () => {
    const groups = groupConsecutive([day * 2, day * 3, day * 4], day, 10)
    expect(groups).toEqual([{ fromSec: day * 2, toSec: day * 5, starts: [day * 2, day * 3, day * 4] }])
  })

  it('breaks the run on a gap', () => {
    const groups = groupConsecutive([day * 2, day * 5], day, 10)
    expect(groups.map((g) => g.starts)).toEqual([[day * 2], [day * 5]])
  })

  it('never exceeds the per-request chunk cap', () => {
    const groups = groupConsecutive([day, day * 2, day * 3, day * 4], day, 2)
    expect(groups.map((g) => g.starts.length)).toEqual([2, 2])
  })

  it('sorts unordered input', () => {
    const groups = groupConsecutive([day * 3, day, day * 2], day, 10)
    expect(groups).toHaveLength(1)
    expect(groups[0].fromSec).toBe(day)
  })
})

describe('maxChunksPerRequest', () => {
  it('keeps a request under the provider row cap', () => {
    for (const d of [0, 3 * 86400, 30 * 86400, 5 * 365 * 86400]) {
      const { intervalSec, chunkSpanSec } = pickResolution(d)
      const chunks = maxChunksPerRequest(chunkSpanSec, intervalSec)
      expect(chunks).toBeGreaterThanOrEqual(1)
      expect((chunks * chunkSpanSec) / intervalSec).toBeLessThanOrEqual(MAX_ROWS_PER_REQUEST)
    }
  })
})

describe('chunk freshness', () => {
  const day = 86400
  const now = day * 100

  it('serves a completed chunk forever', () => {
    const chunk = { chunkStart: day * 10, complete: true, empty: false, fetchedAtSec: 0 }
    expect(isChunkFresh(chunk, day, now)).toBe(true)
  })

  it('re-fetches an empty historical chunk once its TTL passes', () => {
    const base = { chunkStart: day * 10, complete: false, empty: true }
    expect(isChunkFresh({ ...base, fetchedAtSec: now - EMPTY_TTL_SEC + 60 }, day, now)).toBe(true)
    expect(isChunkFresh({ ...base, fetchedAtSec: now - EMPTY_TTL_SEC - 60 }, day, now)).toBe(false)
  })

  it('re-fetches a still-forming chunk on the short TTL', () => {
    const base = { chunkStart: day * 99, complete: false, empty: false }
    expect(isChunkFresh({ ...base, fetchedAtSec: now - RECENT_TTL_SEC + 10 }, day, now)).toBe(true)
    expect(isChunkFresh({ ...base, fetchedAtSec: now - RECENT_TTL_SEC - 10 }, day, now)).toBe(false)
  })

  it('only calls a chunk final once the availability lag has passed', () => {
    expect(chunkIsFinal(day * 98, day, now)).toBe(true)
    expect(chunkIsFinal(day * 99, day, now)).toBe(false)
    expect(chunkIsFinal(day * 99, day, now + AVAILABILITY_LAG_SEC)).toBe(true)
  })
})

describe('splitIntoChunks', () => {
  const day = 86400

  it('files each candle under its own chunk and keeps requested chunks that stayed empty', () => {
    const split = splitIntoChunks(
      [candle(day * 2 + 60), candle(day * 2 + 120), candle(day * 4 + 60)],
      [day * 2, day * 3, day * 4],
      day,
    )
    expect(split.get(day * 2)?.map((c) => c.t)).toEqual([day * 2 + 60, day * 2 + 120])
    expect(split.get(day * 3)).toEqual([])
    expect(split.get(day * 4)).toHaveLength(1)
  })

  it('drops candles outside the requested chunks', () => {
    const split = splitIntoChunks([candle(day * 9)], [day * 2], day)
    expect(split.get(day * 2)).toEqual([])
  })
})

describe('dedupeSorted', () => {
  it('sorts ascending and keeps one candle per timestamp', () => {
    const out = dedupeSorted([candle(300, 3), candle(100, 1), candle(300, 9), candle(200, 2)])
    expect(out.map((c) => c.t)).toEqual([100, 200, 300])
    expect(out[2].c).toBe(9) // overlapping pages: the newer copy wins
  })

  it('keeps the session bar when a venue also publishes a thin one for the same minute', () => {
    const session = { t: 60, o: 78.5, h: 78.55, l: 78.42, c: 78.47, v: 33337 }
    const block = { t: 60, o: 78.5, h: 78.5, l: 78.5, c: 78.5, v: 589 }
    expect(dedupeSorted([session, block])).toEqual([session])
    expect(dedupeSorted([block, session])).toEqual([session])
  })
})

describe('aggregate', () => {
  it('rolls minute bars into 30-minute bars', () => {
    const src: Candle[] = [
      { t: 0, o: 1, h: 4, l: 1, c: 3, v: 10 },
      { t: 60, o: 3, h: 5, l: 2, c: 4, v: 5 },
      { t: 1800, o: 4, h: 6, l: 4, c: 6, v: 7 },
    ]
    expect(aggregate(src, 60, 1800)).toEqual([
      { t: 0, o: 1, h: 5, l: 1, c: 4, v: 15 },
      { t: 1800, o: 4, h: 6, l: 4, c: 6, v: 7 },
    ])
  })

  it('is a no-op when the source already has the target size', () => {
    const src = [candle(0), candle(60)]
    expect(aggregate(src, 60, 60)).toBe(src)
  })
})

describe('sliceCandles', () => {
  it('keeps the inclusive window', () => {
    const src = [candle(100), candle(200), candle(300)]
    expect(sliceCandles(src, 200, 300).map((c) => c.t)).toEqual([200, 300])
  })
})

describe('bracketsPrice', () => {
  // The real NQ session of 2026-06-16: the June contract the provider still
  // called the front month vs. the September one that actually traded.
  const june = [{ t: 0, o: 30500, h: 30580.75, l: 30101, c: 30200, v: 1 }]
  const september = [{ t: 0, o: 30800, h: 30889, l: 30407.75, c: 30700, v: 1 }]

  it('rejects the contract the trade could not have filled in', () => {
    expect(bracketsPrice(june, 30821.25)).toBe(false)
  })

  it('accepts the contract that traded at the fill price', () => {
    expect(bracketsPrice(september, 30821.25)).toBe(true)
  })

  it('tolerates a fill just outside the window extremes', () => {
    expect(bracketsPrice(september, 30889 + 30)).toBe(true)
    expect(bracketsPrice(september, 30889 + 500)).toBe(false)
  })

  it('cannot judge without candles or a usable price', () => {
    expect(bracketsPrice([], 30821.25)).toBe(false)
    expect(bracketsPrice(september, NaN)).toBe(false)
    expect(bracketsPrice(september, 0)).toBe(false)
  })
})

describe('pickContract', () => {
  // One day of daily bars across NQ's listed expiries, 2026-06-16: the June
  // contract the provider still called the front month, the September one the
  // volume had already moved to, and a thin far-dated month.
  const day = [
    { t: 0, o: 30500, h: 30580.75, l: 30101, c: 30200, v: 73893, id: 42004058 },
    { t: 0, o: 30800, h: 30889, l: 30407.75, c: 30700, v: 480762, id: 42004177 },
    { t: 0, o: 31000, h: 31190, l: 30750, c: 31100, v: 181, id: 261401 },
  ]

  it('picks the contract that traded through the fill price', () => {
    expect(pickContract(day, 30821.25)).toBe(42004177)
  })

  it('prefers the liquid contract when a thin one also spans the price', () => {
    // 261401 brackets 30821.25 too, on 181 lots against 480 762.
    expect(pickContract(day, 30821.25)).not.toBe(261401)
  })

  it('still finds a deliberately far-dated contract', () => {
    expect(pickContract(day, 31150)).toBe(261401)
  })

  it('is null when no contract traded there, or without a usable price', () => {
    expect(pickContract(day, 12000)).toBeNull()
    expect(pickContract(day, NaN)).toBeNull()
    expect(pickContract([{ t: 0, o: 1, h: 2, l: 1, c: 1, v: 5 }], 1.5)).toBeNull() // no ids
  })
})

describe('overlaps', () => {
  it('detects shared time and ignores touching ranges', () => {
    expect(overlaps(0, 10, 5, 15)).toBe(true)
    expect(overlaps(0, 10, 10, 20)).toBe(false)
    expect(overlaps(0, 10, 2, 3)).toBe(true)
  })
})
