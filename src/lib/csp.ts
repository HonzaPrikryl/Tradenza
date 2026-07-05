// Content-Security-Policy — nonce-based.
//
// In production, script-src trusts only a per-request nonce plus `strict-dynamic`
// (scripts loaded by an already-trusted script — e.g. Clerk's loader — are trusted
// transitively). That lets us drop 'unsafe-inline' and 'unsafe-eval' entirely,
// which is the single most effective CSP defence against XSS. Browsers too old to
// understand `strict-dynamic` fall back to the explicit host allow-list.
//
// style-src keeps 'unsafe-inline' because MUI/emotion inject inline <style> at
// runtime and can't be nonced from here — a widely accepted trade-off.
//
// In development the script policy stays permissive: Next's HMR / React Refresh
// rely on 'unsafe-eval' and inline bootstrapping.

// The wildcard hosts cover Clerk's shared dev/prod infra. Production instances on
// a *custom* Frontend API domain (e.g. https://clerk.tradenza.dev) are NOT matched
// by these wildcards, so we also derive that origin from the publishable key —
// Clerk base64-encodes the Frontend API host into the key itself, which keeps the
// CSP in lock-step with whatever instance the deploy is pointed at (zero config drift).
const CLERK_WILDCARDS = ['https://*.clerk.accounts.dev', 'https://*.clerk.com']

/** Origin of the Clerk Frontend API, decoded from the publishable key. */
function clerkFrontendApiOrigin(): string | null {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  if (!pk) return null
  try {
    // pk_(test|live)_<base64("<frontend-api-host>$")> — atob is available in the Edge runtime.
    const host = atob(pk.replace(/^pk_(test|live)_/, '')).replace(/\$+$/, '')
    return host ? `https://${host}` : null
  } catch {
    return null
  }
}

const CLERK_ORIGIN = clerkFrontendApiOrigin()
const CLERK = CLERK_ORIGIN ? [...CLERK_WILDCARDS, CLERK_ORIGIN] : CLERK_WILDCARDS
const TURNSTILE = 'https://challenges.cloudflare.com'
const SENTRY = ['https://*.ingest.sentry.io', 'https://*.ingest.us.sentry.io', 'https://*.ingest.de.sentry.io']
const R2 = 'https://*.r2.cloudflarestorage.com'
// PostHog EU (analytics). Harmless to allow even when analytics is disabled.
const POSTHOG = ['https://eu.i.posthog.com', 'https://eu-assets.i.posthog.com']

/** Cryptographically-random, base64 nonce. Runs in the Edge (Web Crypto) runtime. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/** Assemble the CSP header value for one request. */
export function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${CLERK.join(' ')} ${TURNSTILE} ${POSTHOG.join(' ')}`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${CLERK.join(' ')} ${TURNSTILE} ${POSTHOG.join(' ')}`

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${CLERK.join(' ')} ${R2} ${SENTRY.join(' ')} ${POSTHOG.join(' ')}`,
    `frame-src 'self' ${CLERK.join(' ')} ${TURNSTILE}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}
