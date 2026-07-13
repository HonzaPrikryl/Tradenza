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
}

export type Provider = 'databento' | 'polygon' | 'binance'

export interface DatabentoSpec {
  dataset: string
  symbols: string
  stypeIn: 'continuous' | 'raw_symbol'
}

export interface Feed {
  provider: Provider
  /** Namespaces the shared candle cache so keys never collide across providers. */
  cacheKey: string
  databento?: DatabentoSpec
  polygonTicker?: string
  binanceSymbol?: string
}

// Trailing month code on a futures symbol, e.g. the "Z4" in "ESZ4".
export const MONTH_CODE = /[FGHJKMNQUVXZ]\d{1,2}$/

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

// Resolve the historical feed for a trade, or null when unsupported.
export function resolveFeed(assetClass: string, symbol: string): Feed | null {
  const sym = (symbol || '').toUpperCase().trim()
  if (!sym) return null

  if (assetClass === 'futures') {
    const root = sym.replace(MONTH_CODE, '')
    return {
      provider: 'databento',
      cacheKey: root,
      databento: { dataset: 'GLBX.MDP3', symbols: `${root}.v.0`, stypeIn: 'continuous' },
    }
  }

  if (assetClass === 'stocks') {
    const dataset = process.env.DATABENTO_EQUITIES_DATASET || 'XNAS.ITCH'
    return {
      provider: 'databento',
      cacheKey: `${dataset}:${sym}`,
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
export function intervalToPolygon(intervalSec: number): { multiplier: number; timespan: 'minute' | 'hour' } {
  if (intervalSec >= 3600) return { multiplier: 1, timespan: 'hour' }
  if (intervalSec >= 1800) return { multiplier: 30, timespan: 'minute' }
  return { multiplier: 1, timespan: 'minute' }
}

// Binance kline interval string for a target interval.
export function intervalToBinance(intervalSec: number): '1m' | '30m' | '1h' {
  if (intervalSec >= 3600) return '1h'
  if (intervalSec >= 1800) return '30m'
  return '1m'
}
