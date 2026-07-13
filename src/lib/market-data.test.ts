import { describe, it, expect } from 'vitest'
import { resolveFeed, polygonForexTicker, binanceSymbol, intervalToPolygon, intervalToBinance } from './market-data'

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
  it('routes futures to Databento GLBX continuous', () => {
    const f = resolveFeed('futures', 'ESZ4')
    expect(f?.provider).toBe('databento')
    expect(f?.databento).toEqual({ dataset: 'GLBX.MDP3', symbols: 'ES.v.0', stypeIn: 'continuous' })
    expect(f?.cacheKey).toBe('ES')
  })
  it('routes stocks to a Databento equities dataset by raw ticker', () => {
    const f = resolveFeed('stocks', 'AAPL')
    expect(f?.provider).toBe('databento')
    expect(f?.databento?.stypeIn).toBe('raw_symbol')
    expect(f?.databento?.symbols).toBe('AAPL')
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
  })
  it('maps seconds to Binance interval strings', () => {
    expect(intervalToBinance(60)).toBe('1m')
    expect(intervalToBinance(1800)).toBe('30m')
    expect(intervalToBinance(3600)).toBe('1h')
  })
})
