import * as Sentry from '@sentry/nextjs'

// Per-user rate limiting, backed by Upstash Redis.
//
// Upstash is an OPTIONAL dependency: when its env vars are absent (local dev,
// self-host, or simply not wired up) every check is a no-op, so the app runs
// unchanged. The packages are imported lazily the first time a configured limiter
// is needed, so nothing is loaded when the feature is off.
//
// The limiter also FAILS OPEN: if Redis is unreachable we log and allow the
// request rather than locking users out because of an infra hiccup.

/** Named limit policies. Tune the numbers from real traffic. */
export type RatePolicy = 'candles' | 'candlesDaily' | 'import' | 'mutation' | 'global'

// The subset of `@upstash/ratelimit`'s result we rely on.
interface LimitResult {
  success: boolean
  reset: number
}
interface Limiter {
  limit(identifier: string): Promise<LimitResult>
}
type Limiters = Record<RatePolicy, Limiter>

// Window definitions per policy. Generous by design — honest usage never hits
// these; they exist to contain runaway loops and protect paid/limited upstreams.
const WINDOWS: Record<RatePolicy, { tokens: number; window: string }> = {
  candles: { tokens: 10, window: '1 m' }, // protects Databento credits (per-minute)
  candlesDaily: { tokens: 100, window: '1 d' }, // protects Databento credits (per-day)
  import: { tokens: 5, window: '1 m' }, // protects Neon from bulk-insert storms
  mutation: { tokens: 60, window: '1 m' }, // guards against write storms
  global: { tokens: 300, window: '1 m' }, // catch-all ceiling per user
}

function isConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

// Build one Ratelimit instance per policy. Cached as a promise so the dynamic
// import and client construction happen at most once per server instance.
let limitersPromise: Promise<Limiters | null> | undefined

async function getLimiters(): Promise<Limiters | null> {
  if (!isConfigured()) return null
  if (!limitersPromise) {
    limitersPromise = (async () => {
      // Variable specifiers keep Upstash a truly optional dependency: the modules
      // are only resolved at runtime when the feature is enabled.
      const redisMod = '@upstash/redis'
      const ratelimitMod = '@upstash/ratelimit'
      const { Redis } = await import(/* webpackIgnore: false */ redisMod)
      const { Ratelimit } = await import(/* webpackIgnore: false */ ratelimitMod)

      const redis = Redis.fromEnv()
      const make = (policy: RatePolicy): Limiter =>
        new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(WINDOWS[policy].tokens, WINDOWS[policy].window),
          prefix: `rl:${policy}`,
          analytics: false,
        })

      return {
        candles: make('candles'),
        candlesDaily: make('candlesDaily'),
        import: make('import'),
        mutation: make('mutation'),
        global: make('global'),
      }
    })().catch((err) => {
      // Construction failed (bad config, network) — disable limiting, don't crash.
      Sentry.captureException(err, { tags: { component: 'rate-limit', phase: 'init' } })
      return null
    })
  }
  return limitersPromise
}

/**
 * Core enforcement, decoupled from the Upstash wiring so it is easy to test.
 *
 * Returns the number of **seconds to wait** before retrying when the limit is
 * exceeded, or `null` when the request is allowed. No-ops (returns `null`) when
 * `limiters` is null, and fails open (returns `null`) if the limiter itself errors.
 */
export async function enforce(limiters: Limiters | null, policy: RatePolicy, userId: string): Promise<number | null> {
  if (!limiters) return null
  let result: LimitResult
  try {
    result = await limiters[policy].limit(userId)
  } catch (err) {
    // Fail open: an unreachable limiter must not block legitimate users.
    Sentry.captureException(err, { tags: { component: 'rate-limit', phase: 'check', policy } })
    return null
  }
  if (result.success) return null
  // `reset` is a Unix epoch in ms; convert to whole seconds from now (min 1).
  return Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
}

/**
 * Enforce a policy for a user against the live (optional) Upstash limiters.
 * Returns seconds-to-retry when limited, `null` when allowed.
 */
export async function enforceRateLimit(policy: RatePolicy, userId: string): Promise<number | null> {
  return enforce(await getLimiters(), policy, userId)
}

/** Test seam: drop the cached limiters so env changes take effect. */
export function __resetRateLimitCache(): void {
  limitersPromise = undefined
}
