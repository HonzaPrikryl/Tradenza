'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { t } from '@/i18n'
import { isRateLimited, type RateLimited } from '@/lib/rate-limit-result'

// Compact human duration: "8s", "3m", "2h".
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`
  return `${Math.ceil(seconds / 3600)}h`
}

function RateLimitCountdown({ retryAfter }: { retryAfter: number }) {
  const [left, setLeft] = useState(retryAfter)

  useEffect(() => {
    if (retryAfter <= 0) return
    const id = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(id)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [retryAfter])

  return <span>{left > 0 ? t('errors.rateLimitedIn', { time: formatDuration(left) }) : t('errors.rateLimited')}</span>
}

/** Show an error toast with a live countdown until the caller may retry. */
export function notifyRateLimited(retryAfter: number) {
  const secs = Math.max(1, Math.ceil(retryAfter))
  // Keep the toast visible for the wait (short waits count down fully; long waits
  // are capped so the toast doesn't linger for minutes).
  toast.error(<RateLimitCountdown retryAfter={secs} />, { duration: Math.min(Math.max(secs, 4), 60) * 1000 })
}

/**
 * If `result` is the rate-limited signal from a server action, show the countdown
 * toast and return `true` (the caller should stop and not treat it as success).
 * Otherwise returns `false` and narrows `result` away from {@link RateLimited}.
 */
export function handleRateLimit<T>(result: T): result is Extract<T, RateLimited> {
  if (isRateLimited(result)) {
    notifyRateLimited(result.retryAfter)
    return true
  }
  return false
}

/**
 * Batch variant for `Promise.all` results: if any entry is rate-limited, show a
 * single countdown toast and return `true` (the caller should abort).
 */
export function handleRateLimitBatch(results: readonly unknown[]): boolean {
  const limited = results.find(isRateLimited)
  if (limited) {
    notifyRateLimited((limited as RateLimited).retryAfter)
    return true
  }
  return false
}
