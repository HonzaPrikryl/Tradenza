import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

// Only initialize when a DSN is configured, so local/dev without Sentry is a no-op.
if (dsn) {
  Sentry.init({
    dsn,
    // 100% of traces in dev, 10% in prod — tune to your traffic.
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
    enableLogs: true,
    // Don't spam Sentry while developing.
    enabled: process.env.NODE_ENV === 'production',
  })
}
