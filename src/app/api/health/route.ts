import { sql } from 'drizzle-orm'
import * as Sentry from '@sentry/nextjs'
import { db } from '@/lib/db'

// Readiness + liveness probe for external uptime monitors (UptimeRobot, Better
// Stack, …) and platform health checks. Public (allow-listed in middleware) so it
// can be polled without auth.
//
// Design decisions:
//   • It checks the app's ONE hard dependency — Neon (a real `SELECT 1`). Green
//     therefore means "the process is up AND can reach its database", not merely
//     "the process answered". A failing DB returns 503 so the monitor alerts.
//   • It deliberately does NOT probe fail-open / optional dependencies (Upstash
//     rate-limiting, R2, Sentry): the app keeps serving without them, so gating
//     health on them would produce false alarms. They're reported for visibility
//     but never change the status code.
//   • The DB check is bounded by a timeout so a hung connection can't hang the
//     probe — a stuck dependency is a failure, not an infinite wait.
//   • Cheap and uncached: one round-trip, `force-dynamic` + `no-store`, so every
//     poll reflects live state.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DB_TIMEOUT_MS = 5_000

type CheckStatus = 'ok' | 'down' | 'skipped'

interface Check {
  status: CheckStatus
  latencyMs?: number
  detail?: string
}

// Short commit SHA / build id, when the platform provides it (Vercel does).
function version(): string | undefined {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  return sha ? sha.slice(0, 7) : undefined
}

function environment(): string {
  return process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown'
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

// The critical check: can we reach Postgres and get a trivial answer back?
async function checkDatabase(): Promise<Check> {
  const startedAt = Date.now()
  try {
    await withTimeout(db.execute(sql`select 1`), DB_TIMEOUT_MS)
    return { status: 'ok', latencyMs: Date.now() - startedAt }
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'health', check: 'db' } })
    const detail = err instanceof Error ? err.message : 'unknown error'
    return { status: 'down', latencyMs: Date.now() - startedAt, detail }
  }
}

// Optional dependency: reported for visibility only. Never affects the HTTP
// status — the app runs fine without it (rate limiting fails open).
function checkRateLimiter(): Check {
  const configured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  return { status: configured ? 'ok' : 'skipped', detail: configured ? undefined : 'not configured' }
}

export async function GET(): Promise<Response> {
  const startedAt = Date.now()

  const database = await checkDatabase()
  const rateLimiter = checkRateLimiter()

  const healthy = database.status === 'ok'

  const body = {
    status: healthy ? 'ok' : 'error',
    version: version(),
    environment: environment(),
    uptimeSeconds: Math.round(process.uptime()),
    checks: {
      database,
      rateLimiter,
    },
    latencyMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  }

  return Response.json(body, {
    status: healthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}

// Cheap liveness ping for monitors that only need "is the process answering?"
// — no DB round-trip, always 200 while the server is up.
export async function HEAD(): Promise<Response> {
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
