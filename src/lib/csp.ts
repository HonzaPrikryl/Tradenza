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

const CLERK = ['https://*.clerk.accounts.dev', 'https://*.clerk.com']
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
