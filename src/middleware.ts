import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Routes that require authentication are everything NOT listed here.
const isPublicRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)', '/opengraph-image(.*)'])

// Paths that are allowed to live on the marketing domain (tradenza.dev).
// Everything else on that host is redirected to the app domain.
const isMarketingRoute = createRouteMatcher([
  '/',
  '/opengraph-image(.*)',
  '/manifest.webmanifest',
  '/icon(.*)',
  '/apple-icon(.*)',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
])

function hostOf(url?: string) {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

const APP_HOST = hostOf(process.env.NEXT_PUBLIC_APP_URL)
const MARKETING_HOST = hostOf(process.env.NEXT_PUBLIC_MARKETING_URL)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL

export default clerkMiddleware(async (auth, request) => {
  const host = (request.headers.get('host') ?? '').toLowerCase()
  const { pathname, search } = request.nextUrl

  const isAppHost = Boolean(APP_HOST) && host === APP_HOST
  const isMarketingHost = Boolean(MARKETING_HOST) && (host === MARKETING_HOST || host === `www.${MARKETING_HOST}`)

  if (isMarketingHost && !isMarketingRoute(request) && APP_URL) {
    return NextResponse.redirect(new URL(pathname + search, APP_URL))
  }

  if (isAppHost && pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
