'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { track } from '@/lib/analytics'

// Fires `onboarding_completed` exactly once, the first time the user has finished
// all getting-started steps. The dashboard hides the checklist once complete, so
// completion can't be captured from the checklist itself — and it re-renders on
// every visit, so we need a one-time guard to avoid re-firing on each dashboard
// load. A first-party localStorage flag (keyed per user) does that; it's the same
// functional storage the theme already uses — no tracking cookie.
const KEY = 'tradenza-onboarding-completed'

export default function OnboardingCompleteTracker({ allDone }: { allDone: boolean }) {
  const { userId } = useAuth()

  useEffect(() => {
    if (!allDone) return
    try {
      const flagKey = userId ? `${KEY}:${userId}` : KEY
      if (localStorage.getItem(flagKey)) return
      localStorage.setItem(flagKey, '1')
      track({ name: 'onboarding_completed' })
    } catch {
      /* storage unavailable (private mode) — skip rather than risk double-firing */
    }
  }, [allDone, userId])

  return null
}
