// Market-data provider resolution and symbology mapping. Pure (no 'use server')
// so it is unit-testable and can be imported by the candles server action.
//
// Each asset class is routed to the historical OHLCV source that actually covers
// it:
//   - futures  → Databento GLBX.MDP3 (CME Globex continuous contracts)
//   - stocks   → Databento US equities (dataset configurable)
//   - forex    → Polygon.io currencies aggregates (ticker `C:EURUSD`)
//   - crypto   → Binance spot klines (symbol `BTCUSDT`)
// Options / CFD have no wired source yet → no feed (chart shows a limitation).

import { forexPairParts } from './forex'

export interface Candle {
  /** Unix seconds (UTC). */
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
  /**
   * Provider instrument id. Only carried by a parent feed, where one request
   * answers for every contract of a root and the bars have to stay
   * distinguishable; single-instrument feeds leave it unset.
   */
  id?: number
}

export type Provider = 'databento' | 'polygon' | 'binance'

export type DatabentoSchema = 'ohlcv-1m' | 'ohlcv-1h' | 'ohlcv-1d'

export interface DatabentoSpec {
  dataset: string
  symbols: string
  stypeIn: 'continuous' | 'raw_symbol' | 'parent' | 'instrument_id'
}

export interface Feed {
  provider: Provider
  /**
   * Identifies the instrument in the shared candle cache. Provider- and
   * dataset-namespaced so keys can never collide across feeds (a futures root
   * and an equity ticker may well be the same string).
   */
  cacheKey: string
  databento?: DatabentoSpec
  polygonTicker?: string
  binanceSymbol?: string
  /**
   * Set only for a continuous futures series, where the instrument is a guess:
   * the rank this feed asks for (0 = front month). A caller that can tell the
   * guess was wrong — because the trade filled at a price this series never
   * traded at — can ask for the next rank.
   */
  contractRank?: number
}

// Trailing month code on a futures symbol, e.g. the "Z4" in "ESZ4".
export const MONTH_CODE = /[FGHJKMNQUVXZ]\d{1,2}$/

// The same, restricted to CME's single-digit year, which is a symbol Databento
// can be queried with directly ("NQU6"). "NQU26" names a real contract too, but
// not in a form the raw-symbol lookup accepts.
const TRADABLE_MONTH_CODE = /[FGHJKMNQUVXZ]\d$/

/**
 * Every listed contract of a futures root, as one daily-bar request. Used to
 * identify which expiry a trade was executed in when the front month turns out
 * not to be it — daily granularity keeps this to a few hundred rows even for a
 * root with a hundred listed months.
 */
export function futuresParentFeed(root: string, dataset: string): Feed {
  return {
    provider: 'databento',
    cacheKey: `databento:${dataset}:${root}.FUT`,
    databento: { dataset, symbols: `${root}.FUT`, stypeIn: 'parent' },
  }
}

/** One exact contract, addressed by the instrument id a parent probe returned. */
export function futuresInstrumentFeed(instrumentId: number, dataset: string): Feed {
  return {
    provider: 'databento',
    cacheKey: `databento:${dataset}:id:${instrumentId}`,
    databento: { dataset, symbols: String(instrumentId), stypeIn: 'instrument_id' },
  }
}

// Most listed futures the app knows how to value trade on CME Globex, but not
// all of them: the ICE softs and the Cboe volatility contracts live on their own
// venues and return nothing at all from GLBX. Roots not listed here default to
// Globex.
const FUTURES_DATASETS: Record<string, string> = {
  CT: 'IFUS.IMPACT', // Cotton #2
  SB: 'IFUS.IMPACT', // Sugar #11
  KC: 'IFUS.IMPACT', // Coffee C
  CC: 'IFUS.IMPACT', // Cocoa
  OJ: 'IFUS.IMPACT', // Orange Juice
  VX: 'XCBF.PITCH', // VIX
}

/** The Databento dataset carrying a futures root. */
export function futuresDataset(root: string): string {
  return FUTURES_DATASETS[root] ?? 'GLBX.MDP3'
}

// Polygon forex ticker, e.g. "EUR/USD" → "C:EURUSD". Null when not a pair.
export function polygonForexTicker(symbol: string): string | null {
  const parts = forexPairParts(symbol)
  if (!parts) return null
  return `C:${parts[0]}${parts[1]}`
}

// Map a user's crypto symbol to a Binance spot symbol. Users commonly log
// against "USD"; Binance quotes in USDT, so `BTCUSD` → `BTCUSDT`. Kraken-style
// "XBT" is normalised to "BTC". Already-Binance symbols pass through.
export function binanceSymbol(symbol: string): string | null {
  let s = (symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!s) return null
  if (s.startsWith('XBT')) s = 'BTC' + s.slice(3)
  if (s.endsWith('USDT') || s.endsWith('USDC')) return s
  if (s.endsWith('USD')) return s.slice(0, -3) + 'USDT'
  return s
}

/**
 * Resolve the historical feed for a trade, or null when unsupported.
 *
 * `rank` only means anything for a bare futures root, where the exact contract
 * is unknown: 0 is the provider's front month, 1 the one behind it, and so on.
 * The front month is a guess that goes wrong around a roll — the liquidity
 * moves to the next expiry days before the provider's continuous series does,
 * so a trade executed in the new contract would be charted against the old one,
 * hundreds of points away from its own fills.
 */
export function resolveFeed(assetClass: string, symbol: string, rank = 0): Feed | null {
  const sym = (symbol || '').toUpperCase().trim()
  if (!sym) return null

  if (assetClass === 'futures') {
    const root = sym.replace(MONTH_CODE, '')
    const dataset = futuresDataset(root)

    // The symbol names its own expiry ("NQU6") — no guessing needed.
    if (TRADABLE_MONTH_CODE.test(sym)) {
      return {
        provider: 'databento',
        cacheKey: `databento:${dataset}:${sym}`,
        databento: { dataset, symbols: sym, stypeIn: 'raw_symbol' },
      }
    }
    const symbols = `${root}.v.${Math.max(0, Math.trunc(rank))}`
    return {
      provider: 'databento',
      cacheKey: `databento:${dataset}:${symbols}`,
      databento: { dataset, symbols, stypeIn: 'continuous' },
      contractRank: Math.max(0, Math.trunc(rank)),
    }
  }

  if (assetClass === 'stocks') {
    const dataset = process.env.DATABENTO_EQUITIES_DATASET || 'XNAS.ITCH'
    return {
      provider: 'databento',
      cacheKey: `databento:${dataset}:${sym}`,
      databento: { dataset, symbols: sym, stypeIn: 'raw_symbol' },
    }
  }

  if (assetClass === 'forex') {
    const ticker = polygonForexTicker(sym)
    if (!ticker) return null
    return { provider: 'polygon', cacheKey: `polygon:${ticker}`, polygonTicker: ticker }
  }

  if (assetClass === 'crypto') {
    const bs = binanceSymbol(sym)
    if (!bs) return null
    return { provider: 'binance', cacheKey: `binance:${bs}`, binanceSymbol: bs }
  }

  return null
}

// Polygon aggregate granularity for a target interval.
export function intervalToPolygon(intervalSec: number): { multiplier: number; timespan: 'minute' | 'hour' | 'day' } {
  if (intervalSec >= 86400) return { multiplier: 1, timespan: 'day' }
  if (intervalSec >= 3600) return { multiplier: 1, timespan: 'hour' }
  if (intervalSec >= 1800) return { multiplier: 30, timespan: 'minute' }
  return { multiplier: 1, timespan: 'minute' }
}

// Binance kline interval string for a target interval.
export function intervalToBinance(intervalSec: number): '1m' | '30m' | '1h' | '1d' {
  if (intervalSec >= 86400) return '1d'
  if (intervalSec >= 3600) return '1h'
  if (intervalSec >= 1800) return '30m'
  return '1m'
}

/**
 * Databento schema for a target interval, plus the granularity that schema
 * actually returns. Databento has no 30-minute schema, so 30m is fetched as 1m
 * and aggregated locally — `nativeSec` says which one came back.
 */
export function intervalToDatabento(intervalSec: number): { schema: DatabentoSchema; nativeSec: number } {
  if (intervalSec >= 86400) return { schema: 'ohlcv-1d', nativeSec: 86400 }
  if (intervalSec >= 3600) return { schema: 'ohlcv-1h', nativeSec: 3600 }
  return { schema: 'ohlcv-1m', nativeSec: 60 }
}
