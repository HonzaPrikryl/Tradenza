'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { browserTimezone } from '@/lib/timezones'
import { detectUserTimezone } from '@/lib/actions/user-timezone'

/**
 * Reports the browser's timezone once, on the user's first authenticated page
 * load. The server ignores it if a zone is already stored, so this can't
 * overwrite a deliberate choice — it only fills the blank.
 *
 * Rendered from the app layout rather than the settings page: the zone has to be
 * right the first time the user imports a file, and most never open settings.
 */
export default function TimezoneDetector({ hasTimezone }: { hasTimezone: boolean }) {
  const router = useRouter()
  const sent = useRef(false)

  useEffect(() => {
    if (hasTimezone || sent.current) return
    const tz = browserTimezone()
    if (!tz) return
    sent.current = true
    detectUserTimezone(tz)
      .then((res) => {
        if (res.timezone) router.refresh()
      })
      .catch(() => {
        /* never block a page render on a preference */
      })
  }, [hasTimezone, router])

  return null
}
