import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { ClerkProvider } from '@clerk/nextjs'
import { clerkAppearance } from '@/lib/clerk-appearance'
import { Toaster } from 'sonner'
import { GeistMono } from 'geist/font/mono'
import { t } from '@/i18n'
import { activeLocale } from '@/i18n/config'
import MuiProvider from '@/components/providers/MuiProvider'
import ThemeProvider, { ThemeScript } from '@/components/providers/ThemeProvider'
import ConfirmProvider from '@/components/providers/ConfirmProvider'
import PostHogProvider from '@/components/providers/PostHogProvider'
import './globals.css'

const SITE_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://tradenza.dev'
const SOCIAL_DESCRIPTION =
  'Open-source trading journal for importing trades, reviewing executions, tracking stats and building discipline.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: t('meta.title'),
    template: '%s · Tradenza',
  },
  description: t('meta.ogDescription'),
  applicationName: 'Tradenza',
  keywords: [
    'trading journal',
    'open source trading journal',
    'free trading journal',
    'self-hosted trading journal',
    'trade tracker',
    'trade log',
    'trading diary',
    'trading statistics',
    'trading analytics',
    'trading performance tracker',
    'trading dashboard',
    'equity curve',
    'win rate',
    'profit factor',
    'expectancy',
    'R multiple',
    'risk management',
    'trading discipline tracker',
    'trading habit tracker',
    'futures journal',
    'forex journal',
    'stocks trading journal',
    'options trading journal',
    'crypto trading journal',
    'prop firm journal',
    'prop trading',
    'day trading journal',
    'swing trading journal',
    'CSV trade import',
    'Tradezella alternative',
    'TraderSync alternative',
    'Edgewonk alternative',
    'Next.js trading app',
  ],
  authors: [{ name: 'Tradenza' }],
  creator: 'Tradenza',
  publisher: 'Tradenza',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: 'Tradenza',
    title: `Tradenza — ${t('meta.ogTitle')}`,
    description: SOCIAL_DESCRIPTION,
    url: SITE_URL!,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Tradenza — ${t('meta.ogTitle')}`,
    description: SOCIAL_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  category: 'finance',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-request nonce set by middleware — passed to Clerk and our inline theme
  // script so they satisfy the nonce-based Content-Security-Policy.
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <ClerkProvider appearance={clerkAppearance} nonce={nonce}>
      <html lang={activeLocale} suppressHydrationWarning>
        <head>
          <ThemeScript nonce={nonce} />
        </head>
        <body
          className={`${GeistMono.variable} font-body antialiased`}
          style={{ fontFamily: 'var(--font-body, "DM Sans", system-ui, sans-serif)' }}
          suppressHydrationWarning
        >
          <PostHogProvider>
            <ThemeProvider>
              <MuiProvider>
                <ConfirmProvider>{children}</ConfirmProvider>
              </MuiProvider>
            </ThemeProvider>
          </PostHogProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              },
            }}
          />
        </body>
      </html>
    </ClerkProvider>
  )
}
