import Link from 'next/link'
import { SignedIn, SignedOut } from '@clerk/nextjs'
import { ArrowRight, Github } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { t } from '@/i18n'
import { GITHUB_URL } from './links'

export default function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border/70 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center">
          <Logo className="h-9 sm:h-10" priority />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            <Github className="h-4 w-4" />
            {t('landing.nav.github')}
          </a>
          <SignedOut>
            <Link
              href="/sign-in"
              className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              {t('landing.nav.signIn')}
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t('landing.nav.startFree')}
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t('landing.nav.goToDashboard')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </SignedIn>
        </div>
      </div>
    </nav>
  )
}
