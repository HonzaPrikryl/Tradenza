// Shared, dependency-free result type for rate-limited server actions.
//
// A rate-limited action *returns* this instead of throwing, so the retry timing
// survives the server→client boundary (Next.js strips custom fields and redacts
// messages from thrown server-action errors in production). Kept free of any
// server or client imports so both sides can use it.

export interface RateLimited {
  readonly rateLimited: true
  /** Seconds the caller should wait before retrying. */
  readonly retryAfter: number
}

/** Narrow an action result to the rate-limited signal. */
export function isRateLimited(result: unknown): result is RateLimited {
  return typeof result === 'object' && result !== null && (result as RateLimited).rateLimited === true
}
