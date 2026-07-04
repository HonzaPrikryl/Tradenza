import { describe, it, expect, vi, beforeEach } from 'vitest'

// Sentry is a side-effect dependency of the fail-open path — stub it.
const { captureMock } = vi.hoisted(() => ({ captureMock: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: captureMock }))

import { enforce, enforceRateLimit, __resetRateLimitCache, type RatePolicy } from './rate-limit'

// Build a fake limiters object where every policy resolves to the given result,
// or throws when `throws` is set (to exercise the fail-open path).
function fakeLimiters(opts: { success: boolean; reset?: number; throws?: boolean }) {
  const limit = vi.fn(async (_id: string) => {
    if (opts.throws) throw new Error('redis down')
    return { success: opts.success, reset: opts.reset ?? 0 }
  })
  const policies: RatePolicy[] = ['candles', 'candlesDaily', 'import', 'mutation', 'global']
  const map = Object.fromEntries(policies.map((p) => [p, { limit }]))
  return { map: map as unknown as Parameters<typeof enforce>[0], limit }
}

beforeEach(() => {
  captureMock.mockReset()
  __resetRateLimitCache()
})

describe('enforce', () => {
  it('returns null (allowed) when no limiters are configured', async () => {
    await expect(enforce(null, 'global', 'user_1')).resolves.toBeNull()
  })

  it('returns null when under the limit', async () => {
    const { map, limit } = fakeLimiters({ success: true })
    await expect(enforce(map, 'mutation', 'user_1')).resolves.toBeNull()
    expect(limit).toHaveBeenCalledWith('user_1')
  })

  it('returns seconds-to-retry when the limit is exceeded', async () => {
    const { map } = fakeLimiters({ success: false, reset: Date.now() + 5000 })
    const retryAfter = await enforce(map, 'candles', 'user_1')
    expect(typeof retryAfter).toBe('number')
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(5)
  })

  it('fails open (returns null and reports) when the limiter itself errors', async () => {
    const { map } = fakeLimiters({ success: true, throws: true })
    await expect(enforce(map, 'global', 'user_1')).resolves.toBeNull()
    expect(captureMock).toHaveBeenCalledTimes(1)
  })
})

describe('enforceRateLimit', () => {
  it('returns null when Upstash env vars are absent', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    await expect(enforceRateLimit('global', 'user_1')).resolves.toBeNull()
  })
})
