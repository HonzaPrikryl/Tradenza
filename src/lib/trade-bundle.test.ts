import { describe, it, expect } from 'vitest'
import {
  TRADE_BUNDLE_FORMAT,
  TRADE_BUNDLE_VERSION,
  bundleFilename,
  derivedExternalId,
  matchKey,
  parseTradeBundle,
  tagKey,
  tradeBundleSchema,
} from './trade-bundle'

const trade = (overrides: Record<string, unknown> = {}) => ({
  symbol: 'NQ',
  direction: 'long',
  status: 'closed',
  assetClass: 'futures',
  entryPrice: '20000.25',
  entryQuantity: '2',
  entryDatetime: '2026-01-05T14:30:00.000Z',
  ...overrides,
})

const bundle = (trades: unknown[] = [trade()]) => ({
  format: TRADE_BUNDLE_FORMAT,
  version: TRADE_BUNDLE_VERSION,
  trades,
})

describe('tradeBundleSchema', () => {
  it('fills in the optional collections so readers never branch on undefined', () => {
    const parsed = tradeBundleSchema.parse(bundle())
    expect(parsed.tagGroups).toEqual([])
    expect(parsed.strategies).toEqual([])
    expect(parsed.trades[0].tags).toEqual([])
    expect(parsed.trades[0].screenshots).toEqual([])
  })

  it('normalises every absent optional to null rather than undefined', () => {
    const parsed = tradeBundleSchema.parse(bundle())
    const t = parsed.trades[0]
    expect(t.exitPrice).toBeNull()
    expect(t.notes).toBeNull()
    expect(t.riskRewardRatio).toBeNull()
    expect(t.extra).toBeNull()
    expect(t.strategy).toBeNull()
  })

  it('keeps decimals as strings so database precision survives the round trip', () => {
    const parsed = tradeBundleSchema.parse(bundle([trade({ netPnl: '1234.56780000' })]))
    expect(parsed.trades[0].netPnl).toBe('1234.56780000')
  })

  it('carries extra through untouched — it holds the fills and the risk plan', () => {
    const extra = {
      contractMultiplier: 20,
      executions: [{ datetime: '2026-01-05T14:30:00.000Z', side: 'buy', quantity: 2, price: 20000.25 }],
      riskPlan: { tickValue: 5, profitTargets: [{ ticks: 40, qty: 2 }], stopLosses: [{ ticks: 20, qty: 2 }] },
    }
    const parsed = tradeBundleSchema.parse(bundle([trade({ extra })]))
    expect(parsed.trades[0].extra).toEqual(extra)
  })

  it('rejects a bundle with no trades', () => {
    expect(tradeBundleSchema.safeParse(bundle([])).success).toBe(false)
  })

  it('rejects a trade with an unparseable entry time', () => {
    expect(tradeBundleSchema.safeParse(bundle([trade({ entryDatetime: 'last tuesday' })])).success).toBe(false)
  })

  it('rejects a price that is not a number', () => {
    expect(tradeBundleSchema.safeParse(bundle([trade({ entryPrice: 'about 20k' })])).success).toBe(false)
  })
})

describe('parseTradeBundle', () => {
  it('accepts a well-formed bundle', () => {
    const out = parseTradeBundle(JSON.stringify(bundle()))
    expect(out.ok).toBe(true)
  })

  it('reports malformed JSON distinctly from a wrong file', () => {
    expect(parseTradeBundle('{ not json')).toEqual({ ok: false, reason: 'notJson' })
    expect(parseTradeBundle(JSON.stringify({ hello: 'world' }))).toEqual({ ok: false, reason: 'notBundle' })
  })

  it('refuses a bundle from a newer version instead of dropping its fields', () => {
    const doc = { ...bundle(), version: TRADE_BUNDLE_VERSION + 1 }
    expect(parseTradeBundle(JSON.stringify(doc))).toEqual({ ok: false, reason: 'newerVersion' })
  })

  it('flags a bundle that is the right shape but internally invalid', () => {
    const doc = bundle([trade({ direction: 'sideways' })])
    expect(parseTradeBundle(JSON.stringify(doc))).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('name matching', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(matchKey('  Opening Range Breakout ')).toBe(matchKey('opening range breakout'))
  })

  it('scopes a tag by its group so two groups can reuse a name', () => {
    expect(tagKey('Setup', 'Breakout')).not.toBe(tagKey('Mistake', 'Breakout'))
    expect(tagKey(null, 'Breakout')).not.toBe(tagKey('Setup', 'Breakout'))
  })

  it('treats an ungrouped tag consistently however it is spelled', () => {
    expect(tagKey(null, ' breakout')).toBe(tagKey(null, 'Breakout'))
  })
})

describe('derivedExternalId', () => {
  it('is stable for the same position however the date is expressed', () => {
    const a = derivedExternalId({ symbol: 'NQ', entryDatetime: '2026-01-05T14:30:00.000Z', direction: 'long' })
    const b = derivedExternalId({ symbol: 'nq', entryDatetime: new Date('2026-01-05T14:30:00Z'), direction: 'long' })
    expect(a).toBe(b)
  })

  it('separates the two directions of the same symbol and time', () => {
    const base = { symbol: 'NQ', entryDatetime: '2026-01-05T14:30:00.000Z' }
    expect(derivedExternalId({ ...base, direction: 'long' })).not.toBe(
      derivedExternalId({ ...base, direction: 'short' }),
    )
  })
})

describe('bundleFilename', () => {
  it('is dated and JSON', () => {
    expect(bundleFilename(new Date('2026-08-05T10:00:00Z'))).toBe('tradenza-backup-2026-08-05.json')
  })
})

describe('rating', () => {
  const rated = (rating: unknown) =>
    tradeBundleSchema.parse({
      format: TRADE_BUNDLE_FORMAT,
      version: TRADE_BUNDLE_VERSION,
      trades: [
        {
          symbol: 'NQ',
          direction: 'long',
          status: 'closed',
          assetClass: 'futures',
          entryPrice: '1',
          entryQuantity: '1',
          entryDatetime: '2026-01-05T14:30:00.000Z',
          rating,
        },
      ],
    }).trades[0].rating

  it('passes a valid rating through untouched', () => {
    expect(rated(3.5)).toBe(3.5)
  })

  it('clamps a hand-edited value instead of rejecting the whole journal', () => {
    expect(rated(99)).toBe(5)
    expect(rated(-4)).toBe(0)
  })
})
