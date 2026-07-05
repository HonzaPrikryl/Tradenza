'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'

// Privacy-respecting product analytics (PostHog, EU cloud). Entirely OPTIONAL:
// with `NEXT_PUBLIC_POSTHOG_KEY` unset (local dev, self-host that doesn't want it)
// nothing initialises and the app behaves unchanged.
//
// Deliberately privacy-first:
//   • EU ingestion (`eu.i.posthog.com`) — data stays in the EU.
//   • `persistence: 'memory'` — no cookies, no localStorage → no consent banner.
//   • autocapture + session recording OFF — we never hoover up DOM text/inputs,
//     which for a trading app could contain financial data. Only explicit
//     pageviews (and any events we add on purpose) are sent.
//   • `person_profiles: 'identified_only'` — anonymous visitors don't create
//     person profiles; a profile appears only once a signed-in user is identified.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com'

let started = false
function ensureInit() {
  if (started || !KEY || typeof window === 'undefined') return
  posthog.init(KEY, {
    api_host: HOST,
    ui_host: 'https://eu.posthog.com',
    persistence: 'memory',
    person_profiles: 'identified_only',
    capture_pageview: false, // captured manually below (App Router has no full reloads)
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
  })
  started = true
}

// Manual pageview on every route/query change. Wrapped in Suspense by the parent
// because `useSearchParams` requires it.
function PageviewTracker() {
  const posthogClient = usePostHog()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!posthogClient || !pathname) return
    const qs = searchParams?.toString()
    posthogClient.capture('$pageview', { $current_url: pathname + (qs ? `?${qs}` : '') })
  }, [posthogClient, pathname, searchParams])

  return null
}

// Tie events to the signed-in user (by Clerk id) and reset on sign-out.
function IdentifyUser() {
  const posthogClient = usePostHog()
  const { isSignedIn, userId } = useAuth()

  useEffect(() => {
    if (!posthogClient) return
    if (isSignedIn && userId) posthogClient.identify(userId)
    else posthogClient.reset()
  }, [posthogClient, isSignedIn, userId])

  return null
}

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensureInit()
  }, [])

  // Analytics disabled (no key) → render children untouched, zero overhead.
  if (!KEY) return <>{children}</>

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      <IdentifyUser />
      {children}
    </PHProvider>
  )
}
