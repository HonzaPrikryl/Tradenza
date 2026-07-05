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

// The Content-Security-Policy is set per-request in middleware.ts, because it
// carries a per-request nonce (nonce-based CSP can't be a static header). The
// static, request-independent security headers live here.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
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
