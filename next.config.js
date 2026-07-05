const { withSentryConfig } = require('@sentry/nextjs')

// Origins allowed to invoke Server Actions. Same-origin always works; this list
// covers dev and any production/proxy host, driven by env so it is correct per
// deployment instead of hardcoded to localhost.
const serverActionOrigins = ['localhost:3000']
if (process.env.VERCEL_URL) serverActionOrigins.push(process.env.VERCEL_URL)
if (process.env.NEXT_PUBLIC_APP_URL) {
  try {
    serverActionOrigins.push(new URL(process.env.NEXT_PUBLIC_APP_URL).host)
  } catch {
    /* ignore malformed NEXT_PUBLIC_APP_URL */
  }
}

// Content-Security-Policy. Shipped Report-Only so it cannot break Clerk/Sentry/R2
// before it has been verified in a browser. Review violations in the console,
// then rename the header to `Content-Security-Policy` to enforce it.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://*.r2.cloudflarestorage.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
  "frame-src 'self' https://*.clerk.accounts.dev https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Content-Security-Policy-Report-Only', value: csp },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optional rate-limit deps are loaded at runtime (only when Upstash is set), so
  // keep them external instead of bundling — this also ensures they're included in
  // the serverless deployment.
  serverExternalPackages: ['@upstash/ratelimit', '@upstash/redis'],
  experimental: {
    serverActions: {
      allowedOrigins: serverActionOrigins,
    },
    // Tree-shake barrel imports for heavy packages so only used modules ship.
    optimizePackageImports: ['@mui/material', '@mui/system', '@mui/x-date-pickers', 'lucide-react', 'date-fns'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
    ],
  },
}

module.exports = withSentryConfig(nextConfig, {
  // Org/project drive source-map upload at build time. Safe to leave unset
  // locally — error capture still works without them.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only log source-map upload in CI.
  silent: !process.env.CI,
  // Prettier stack traces for client bundles.
  widenClientFileUpload: true,
  // Strip the Sentry SDK logger from production bundles.
  disableLogger: true,
})
