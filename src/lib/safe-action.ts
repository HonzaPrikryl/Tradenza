import { auth } from '@clerk/nextjs/server'
import { unstable_rethrow } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { t } from '@/i18n'
import { ActionError, UnauthorizedError, ValidationError } from './action-errors'
import { enforceRateLimit, type RatePolicy } from './rate-limit'
import type { RateLimited } from './rate-limit-result'

export type { RateLimited } from './rate-limit-result'

// Typed wrapper for server actions. Every action funnels through here so auth,
// input validation, rate limiting and error handling are enforced in one place.

// Re-export the error taxonomy so call sites can `import { ... } from '@/lib/safe-action'`.
export * from './action-errors'

export interface ActionContext {
  userId: string
}

export interface ActionOptions {
  /** Rate-limit policy (or policies) to enforce, on top of the always-on `global` ceiling. */
  limit?: RatePolicy | RatePolicy[]
}

type SchemaTuple = readonly z.ZodTypeAny[]

type Handler<S extends SchemaTuple, R> = (ctx: ActionContext, ...args: ParsedArgs<S>) => Promise<R>

// What the caller passes in (schema *input*). Built recursively so that a slot
// whose schema accepts `undefined` (ZodOptional / ZodDefault) becomes an optional
// argument — letting trailing optional args be omitted at the call site, exactly
// as the actions are invoked today (e.g. `getAccounts()`, `createTrade(data)`).
type InputArgs<S extends SchemaTuple> = S extends readonly [
  infer Head extends z.ZodTypeAny,
  ...infer Tail extends readonly z.ZodTypeAny[],
]
  ? undefined extends z.input<Head>
    ? [arg?: z.input<Head>, ...InputArgs<Tail>]
    : [arg: z.input<Head>, ...InputArgs<Tail>]
  : []

// What the handler receives (schema *output* — defaults applied, coercions done).
type ParsedArgs<S extends SchemaTuple> = { [K in keyof S]: z.output<S[K]> }

/**
 * Wrap a server action with authentication, positional input validation and
 * centralised error handling.
 *
 * Failure modes are normalised so the client always sees a stable, safe error:
 *  - no session            → `UnauthorizedError`
 *  - invalid arguments     → `ValidationError` (carries flattened zod field errors)
 *  - expected domain error → the thrown `ActionError` passes through untouched
 *  - anything else         → reported to Sentry, replaced with a generic `INTERNAL`
 *    error so bugs and infra failures never leak internals to the client
 *
 * Next.js control-flow signals (`redirect()`, `notFound()`) are re-thrown intact.
 *
 * When a rate-limit policy is configured and the caller exceeds it, the action
 * **returns** a {@link RateLimited} signal (`{ rateLimited, retryAfter }`) instead
 * of throwing — so the retry timing survives the server→client boundary (Next.js
 * strips fields and redacts messages from thrown server-action errors). The return
 * type widens to `R | RateLimited`, so call sites are forced to handle it.
 *
 * @param schemas Zod schemas matched one-to-one against the action arguments.
 * @param handler Receives the auth context and the parsed arguments.
 * @param opts Optional per-action config (e.g. a rate-limit policy).
 * @returns An async function with the same argument shape the client calls.
 */
export function authedAction<const S extends SchemaTuple, R>(
  schemas: S,
  handler: Handler<S, R>,
): (...args: InputArgs<S>) => Promise<R>
export function authedAction<const S extends SchemaTuple, R>(
  schemas: S,
  handler: Handler<S, R>,
  opts: ActionOptions,
): (...args: InputArgs<S>) => Promise<R | RateLimited>
export function authedAction<const S extends SchemaTuple, R>(
  schemas: S,
  handler: Handler<S, R>,
  opts?: ActionOptions,
): (...args: InputArgs<S>) => Promise<R | RateLimited> {
  return async (...args: InputArgs<S>): Promise<R | RateLimited> => {
    const { userId } = await auth()
    if (!userId) throw new UnauthorizedError(t('errors.unauthorized'))

    // Rate limiting runs before validation/work, and only for sensitive/expensive
    // actions (writes, imports, candles) — reads stay Redis-free so Upstash usage
    // stays well within its free tier; read floods are bounded by Vercel/Neon's own
    // caps. A per-user `global` ceiling is checked alongside the action's own policy.
    // No-ops entirely unless Upstash is configured; on a hit we return (not throw).
    if (opts?.limit) {
      const policies: RatePolicy[] = ['global', ...(Array.isArray(opts.limit) ? opts.limit : [opts.limit])]
      for (const policy of policies) {
        const retryAfter = await enforceRateLimit(policy, userId)
        if (retryAfter !== null) return { rateLimited: true, retryAfter }
      }
    }

    let parsed: ParsedArgs<S>
    try {
      parsed = schemas.map((schema, i) => schema.parse(args[i])) as ParsedArgs<S>
    } catch (err) {
      if (err instanceof z.ZodError) {
        // Field-level errors are safe to surface so the UI can point at inputs.
        throw new ValidationError(t('errors.badRequest'), err.flatten())
      }
      throw err
    }

    try {
      return await handler({ userId }, ...parsed)
    } catch (err) {
      // Let Next's control-flow signals (redirect / notFound) propagate untouched.
      unstable_rethrow(err)
      // Expected, client-safe domain errors pass through as thrown.
      if (err instanceof ActionError) throw err
      // Anything else is a bug or infra failure: record it with context and
      // surface a generic message so internals never reach the client.
      Sentry.captureException(err, { tags: { component: 'server-action' }, extra: { userId } })
      throw new ActionError('INTERNAL', t('errors.internal'))
    }
  }
}

/** `authedAction` pre-tagged with the `mutation` rate-limit policy (writes). */
export function mutationAction<const S extends SchemaTuple, R>(
  schemas: S,
  handler: Handler<S, R>,
): (...args: InputArgs<S>) => Promise<R | RateLimited> {
  return authedAction(schemas, handler, { limit: 'mutation' })
}

/** `authedAction` pre-tagged with the `import` rate-limit policy (bulk inserts). */
export function importAction<const S extends SchemaTuple, R>(
  schemas: S,
  handler: Handler<S, R>,
): (...args: InputArgs<S>) => Promise<R | RateLimited> {
  return authedAction(schemas, handler, { limit: 'import' })
}
