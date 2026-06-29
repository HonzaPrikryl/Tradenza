'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { t } from '@/i18n'
import { activeLocale } from '@/i18n/config'

/**
 * Catches errors thrown in the root layout itself. It replaces the whole
 * document, so it must render its own <html>/<body> and cannot rely on the
 * app's theme/styles being present — keep it self-contained and inline.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang={activeLocale}>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0a0a0a',
          color: '#fafafa',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          padding: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.5rem' }}>{t('error.global.title')}</h1>
          <p style={{ fontSize: '0.875rem', color: '#a1a1aa', margin: '0 0 1.5rem' }}>{t('error.global.desc')}</p>
          <button
            onClick={reset}
            style={{
              border: 'none',
              borderRadius: '0.375rem',
              padding: '0.5rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#0a0a0a',
              background: '#fafafa',
              cursor: 'pointer',
            }}
          >
            {t('error.global.retry')}
          </button>
        </div>
      </body>
    </html>
  )
}
