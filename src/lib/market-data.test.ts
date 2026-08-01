import { describe, it, expect } from 'vitest'
import {
  resolveFeed,
  polygonForexTicker,
  binanceSymbol,
  intervalToPolygon,
  intervalToBinance,
  intervalToDatabento,
  futuresDataset,
  futuresParentFeed,
  futuresInstrumentFeed,
} from './market-data'

describe('polygonForexTicker', () => {
  it('builds a C: ticker from a pair', () => {
    expect(polygonForexTicker('EURUSD')).toBe('C:EURUSD')
    expect(polygonForexTicker('EUR/USD')).toBe('C:EURUSD')
    expect(polygonForexTicker('usdjpy')).toBe('C:USDJPY')
  })
  it('is null for non-pairs', () => {
    expect(polygonForexTicker('AAPL')).toBeNull()
    expect(polygonForexTicker('ES')).toBeNull()
  })
})

describe('binanceSymbol', () => {
  it('maps USD-quoted symbols to USDT', () => {
    expect(binanceSymbol('BTCUSD')).toBe('BTCUSDT')
    expect(binanceSymbol('BTC/USD')).toBe('BTCUSDT')
    expect(binanceSymbol('ETH-USD')).toBe('ETHUSDT')
  })
  it('passes through USDT / USDC symbols', () => {
    expect(binanceSymbol('BTCUSDT')).toBe('BTCUSDT')
    expect(binanceSymbol('SOLUSDC')).toBe('SOLUSDC')
  })
  it('normalises XBT to BTC', () => {
    expect(binanceSymbol('XBTUSD')).toBe('BTCUSDT')
  })
  it('leaves crypto-crypto pairs alone', () => {
    expect(binanceSymbol('ETHBTC')).toBe('ETHBTC')
  })
})

describe('resolveFeed', () => {
  it('routes a bare futures root to the Databento GLBX continuous front month', () => {
    const f = resolveFeed('futures', 'ES')
    expect(f?.provider).toBe('databento')
    expect(f?.databento).toEqual({ dataset: 'GLBX.MDP3', symbols: 'ES.v.0', stypeIn: 'continuous' })
    expect(f?.cacheKey).toBe('databento:GLBX.MDP3:ES.v.0')
    expect(f?.contractRank).toBe(0)
  })
  it('charts the exact contract when the symbol names its expiry', () => {
    const f = resolveFeed('futures', 'NQU6')
    expect(f?.databento).toEqual({ dataset: 'GLBX.MDP3', symbols: 'NQU6', stypeIn: 'raw_symbol' })
    expect(f?.contractRank).toBeUndefined() // nothing to guess, so no other rank to try
  })
  it('falls back to the continuous series for an expiry Databento cannot be asked for', () => {
    expect(resolveFeed('futures', 'NQU26')?.databento?.symbols).toBe('NQ.v.0')
  })
  it('routes roots that are not on Globex to the venue that carries them', () => {
    expect(resolveFeed('futures', 'KC')?.databento?.dataset).toBe('IFUS.IMPACT') // ICE softs
    expect(resolveFeed('futures', 'VX')?.databento?.dataset).toBe('XCBF.PITCH') // Cboe volatility
    expect(resolveFeed('futures', 'CTZ6')?.cacheKey).toBe('databento:IFUS.IMPACT:CTZ6')
    expect(futuresDataset('NQ')).toBe('GLBX.MDP3')
  })
  it('can ask for every expiry of a root at once, and for one exact contract', () => {
    expect(futuresParentFeed('NQ', 'GLBX.MDP3').databento).toEqual({
      dataset: 'GLBX.MDP3',
      symbols: 'NQ.FUT',
      stypeIn: 'parent',
    })
    const exact = futuresInstrumentFeed(42004177, 'GLBX.MDP3')
    expect(exact.databento).toEqual({ dataset: 'GLBX.MDP3', symbols: '42004177', stypeIn: 'instrument_id' })
    expect(exact.cacheKey).toBe('databento:GLBX.MDP3:id:42004177')
    expect(exact.contractRank).toBeUndefined() // an exact contract is not a guess
  })
  it('routes stocks to a Databento equities dataset by raw ticker', () => {
    const f = resolveFeed('stocks', 'AAPL')
    expect(f?.provider).toBe('databento')
    expect(f?.databento?.stypeIn).toBe('raw_symbol')
    expect(f?.databento?.symbols).toBe('AAPL')
    expect(f?.cacheKey).toBe('databento:XNAS.ITCH:AAPL')
  })
  it('namespaces the cache key so a futures root cannot collide with a ticker', () => {
    expect(resolveFeed('futures', 'ES')?.cacheKey).not.toBe(resolveFeed('stocks', 'ES')?.cacheKey)
  })
  it('routes forex to Polygon', () => {
    const f = resolveFeed('forex', 'EURUSD')
    expect(f?.provider).toBe('polygon')
    expect(f?.polygonTicker).toBe('C:EURUSD')
    expect(f?.cacheKey).toBe('polygon:C:EURUSD')
  })
  it('routes crypto to Binance', () => {
    const f = resolveFeed('crypto', 'BTCUSD')
    expect(f?.provider).toBe('binance')
    expect(f?.binanceSymbol).toBe('BTCUSDT')
    expect(f?.cacheKey).toBe('binance:BTCUSDT')
  })
  it('is null for options / cfd / other and empty symbols', () => {
    expect(resolveFeed('options', 'AAPL')).toBeNull()
    expect(resolveFeed('cfd', 'US30')).toBeNull()
    expect(resolveFeed('forex', '')).toBeNull()
  })
})

describe('interval mapping', () => {
  it('maps seconds to Polygon multiplier/timespan', () => {
    expect(intervalToPolygon(60)).toEqual({ multiplier: 1, timespan: 'minute' })
    expect(intervalToPolygon(1800)).toEqual({ multiplier: 30, timespan: 'minute' })
    expect(intervalToPolygon(3600)).toEqual({ multiplier: 1, timespan: 'hour' })
    expect(intervalToPolygon(86400)).toEqual({ multiplier: 1, timespan: 'day' })
  })
  it('maps seconds to Binance interval strings', () => {
    expect(intervalToBinance(60)).toBe('1m')
    expect(intervalToBinance(1800)).toBe('30m')
    expect(intervalToBinance(3600)).toBe('1h')
    expect(intervalToBinance(86400)).toBe('1d')
  })
  it('maps seconds to a Databento schema, fetching 30m as aggregated 1m', () => {
    expect(intervalToDatabento(60)).toEqual({ schema: 'ohlcv-1m', nativeSec: 60 })
    expect(intervalToDatabento(1800)).toEqual({ schema: 'ohlcv-1m', nativeSec: 60 })
    expect(intervalToDatabento(3600)).toEqual({ schema: 'ohlcv-1h', nativeSec: 3600 })
    expect(intervalToDatabento(86400)).toEqual({ schema: 'ohlcv-1d', nativeSec: 86400 })
  })
})
