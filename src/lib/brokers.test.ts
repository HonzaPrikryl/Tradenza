import { describe, it, expect } from 'vitest'
import { BROKERS, ALL_ASSETS, getBroker, defaultAssetClass, supportsUpload, type Broker } from './brokers'

describe('broker asset catalogue', () => {
  it('every broker declares at least one supported asset', () => {
    for (const b of BROKERS) {
      expect(b.assets.length, `${b.id} has no assets`).toBeGreaterThan(0)
    }
  })

  it('all declared assets are valid asset types', () => {
    for (const b of BROKERS) {
      for (const a of b.assets) {
        expect(ALL_ASSETS, `${b.id} → ${a}`).toContain(a)
      }
    }
  })

  it('has no duplicate assets per broker', () => {
    for (const b of BROKERS) {
      expect(new Set(b.assets).size, `${b.id} has duplicate assets`).toBe(b.assets.length)
    }
  })

  it('reflects audited multi-asset brokers', () => {
    expect(getBroker('alpaca')?.assets).toEqual(['stocks', 'options', 'crypto'])
    expect(getBroker('ibkr')?.assets).toEqual(['stocks', 'options', 'futures', 'forex', 'crypto', 'cfd'])
    expect(getBroker('thinkorswim')?.assets).toContain('forex')
    expect(getBroker('tradelocker')?.assets).toContain('crypto')
  })
})

describe('defaultAssetClass', () => {
  it('returns the primary (first) asset for a known broker', () => {
    expect(defaultAssetClass(getBroker('ctrader'))).toBe('forex')
    expect(defaultAssetClass(getBroker('deepcharts'))).toBe('futures')
  })

  it('falls back to futures for unknown / asset-less brokers', () => {
    expect(defaultAssetClass(undefined)).toBe('futures')
    const empty: Broker = { id: 'x', name: 'X', short: 'X', className: '', assets: [] }
    expect(defaultAssetClass(empty)).toBe('futures')
  })
})

describe('supportsUpload', () => {
  it('is true for any recognised broker with assets', () => {
    expect(supportsUpload(getBroker('ctrader'))).toBe(true)
    expect(supportsUpload(getBroker('deepcharts'))).toBe(true)
  })

  it('is false for unknown or asset-less brokers', () => {
    expect(supportsUpload(undefined)).toBe(false)
    expect(supportsUpload({ id: 'x', name: 'X', short: 'X', className: '', assets: [] })).toBe(false)
  })
})
