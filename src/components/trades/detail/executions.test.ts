import { describe, it, expect } from 'vitest'
import { normalizeExecutions, storedMultiplier, storedRiskPlan } from './executions'
import type { Trade } from '@/lib/db'

// Helper: build a Trade-shaped object. Numeric DB columns arrive as strings
// (Drizzle `numeric`), which is what these helpers must tolerate.
const trade = (overrides: Record<string, unknown>): Trade =>
  ({
    direction: 'long',
    entryDatetime: '2026-01-05T14:30:00Z',
    entryPrice: '5000',
    entryQuantity: '1',
    fees: '0',
    exitPrice: null,
    exitDatetime: null,
    exitQuantity: null,
    extra: null,
    ...overrides,
  }) as unknown as Trade

describe('normalizeExecutions — explicit executions', () => {
  it('parses, sorts by time, and drops invalid rows', () => {
    const t = trade({
      extra: {
        executions: [
          { datetime: '2026-01-05T15:00:00Z', side: 'sell', quantity: '2', price: '5010', commission: '1', fee: '0.5' },
          { datetime: '2026-01-05T14:30:00Z', side: 'buy', quantity: '2', price: '5000', commission: '1', fee: '0.5' },
          { datetime: 'not-a-date', side: 'buy', quantity: '1', price: '5001' }, // invalid time
          { datetime: '2026-01-05T14:40:00Z', side: 'buy', quantity: '0', price: '5002' }, // qty <= 0
        ],
      },
    })
    const out = normalizeExecutions(t)
    expect(out).toHaveLength(2)
    expect(out.map((e) => e.side)).toEqual(['buy', 'sell']) // sorted ascending by time
    expect(out[0]).toMatchObject({ time: 1767623400, quantity: 2, price: 5000, commission: 1, fee: 0.5 })
  })

  it('defaults an unrecognised side to buy', () => {
    const t = trade({
      extra: { executions: [{ datetime: '2026-01-05T14:30:00Z', side: 'whatever', quantity: '1', price: '5000' }] },
    })
    expect(normalizeExecutions(t)[0].side).toBe('buy')
  })
})

describe('normalizeExecutions — synthesized fallback', () => {
  it('builds entry + exit for a closed trade and flips the side on exit', () => {
    const t = trade({
      direction: 'short',
      entryQuantity: '3',
      fees: '6',
      exitPrice: '4990',
      exitDatetime: '2026-01-05T15:00:00Z',
      exitQuantity: null, // missing exit qty falls back to entry qty
    })
    const out = normalizeExecutions(t)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ side: 'sell', quantity: 3, price: 5000, fee: 6 })
    expect(out[1]).toMatchObject({ side: 'buy', quantity: 3, price: 4990, fee: 0 })
  })

  it('produces only an entry execution for an open trade', () => {
    const out = normalizeExecutions(trade({ direction: 'long', fees: '2' }))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ side: 'buy', quantity: 1, price: 5000, fee: 2 })
  })
})

describe('storedMultiplier', () => {
  it('returns a positive stored multiplier', () => {
    expect(storedMultiplier(trade({ extra: { contractMultiplier: '50' } }))).toBe(50)
  })
  it('returns undefined for zero, missing, or absent extra', () => {
    expect(storedMultiplier(trade({ extra: { contractMultiplier: '0' } }))).toBeUndefined()
    expect(storedMultiplier(trade({ extra: {} }))).toBeUndefined()
    expect(storedMultiplier(trade({ extra: null }))).toBeUndefined()
  })
})

describe('storedRiskPlan', () => {
  it('coerces stringified leg values into numbers', () => {
    const rp = storedRiskPlan(
      trade({
        extra: {
          riskPlan: {
            tickValue: '12.5',
            profitTargets: [{ ticks: '8', qty: '1' }],
            stopLosses: [{ ticks: '4', qty: '2' }],
          },
        },
      }),
    )
    expect(rp).toEqual({
      tickValue: 12.5,
      profitTargets: [{ ticks: 8, qty: 1 }],
      stopLosses: [{ ticks: 4, qty: 2 }],
    })
  })

  it('returns undefined when no risk plan is stored', () => {
    expect(storedRiskPlan(trade({ extra: {} }))).toBeUndefined()
    expect(storedRiskPlan(trade({ extra: null }))).toBeUndefined()
  })
})
