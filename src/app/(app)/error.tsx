'use client'

import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { t } from '@/i18n'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 text-center">
      <div>
        <h1 className="mb-2 text-xl font-semibold">{t('error.title')}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{t('error.desc')}</p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RotateCcw className="h-4 w-4" />
            {t('error.retry')}
          </button>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            {t('error.back')}
          </Link>
        </div>
        {error.digest && <p className="mt-6 text-xs text-muted-foreground/50">{error.digest}</p>}
      </div>
    </div>
  )
}
