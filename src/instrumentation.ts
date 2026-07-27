import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Validate at server boot, not at build: `next build` also runs this hook
    // (for prerendering), but a Docker image build has no runtime secrets — the
    // real environment only exists once the container starts.
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      const { validateEnv } = await import('./lib/env')
      validateEnv()
    }

    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Captures errors thrown in Server Components, server actions, route handlers
// and middleware — the cases a try/catch or client boundary cannot see.
export const onRequestError = Sentry.captureRequestError
