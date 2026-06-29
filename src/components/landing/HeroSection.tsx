import Link from 'next/link'
import { ArrowRight, ChevronDown, Github, Sparkles } from 'lucide-react'
import { t } from '@/i18n'
import DashboardPreview from './DashboardPreview'
import Blob from './Blob'
import { GITHUB_URL } from './links'

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Primary glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] bg-[radial-gradient(75%_55%_at_55%_0%,hsl(var(--primary)/0.16),transparent_72%)]"
      />
      <Blob className="-right-14 top-20 h-[26rem] w-[26rem]" color="hsl(var(--primary) / 0.16)" />
      <Blob className="-left-20 bottom-10 h-[26rem] w-[26rem]" color="hsl(var(--primary) / 0.16)" />

      <div className="mx-auto flex max-w-6xl flex-col px-6 pb-12 pt-12 sm:pt-16 lg:min-h-[calc(100svh-4.5rem)] lg:pb-8">
        <div className="flex flex-1 items-center">
          <div className="grid w-full items-center gap-10 lg:grid-cols-2 lg:gap-14">
            {/* Copy */}
            <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-6 inline-flex animate-enter items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/15"
              >
                <Sparkles className="h-3 w-3" />
                {t('landing.hero.badge')}
              </a>

              <h1
                className="mb-6 animate-enter text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl xl:text-6xl"
                style={{ animationDelay: '80ms' }}
              >
                {t('landing.hero.title1')}{' '}
                <span className="bg-gradient-to-r from-primary to-emerald-300 bg-clip-text text-transparent">
                  {t('landing.hero.title2')}
                </span>
              </h1>

              <p
                className="mb-9 max-w-xl animate-enter text-base leading-relaxed text-muted-foreground sm:text-lg"
                style={{ animationDelay: '160ms' }}
              >
                {t('landing.hero.subtitle')}
              </p>

              <div
                className="hidden animate-enter flex-col items-center gap-3 sm:flex sm:flex-row lg:justify-start"
                style={{ animationDelay: '240ms' }}
              >
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/30"
                >
                  {t('landing.hero.ctaPrimary')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-6 py-3 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-accent"
                >
                  <Github className="h-4 w-4" />
                  {t('landing.hero.ctaSecondary')}
                </a>
              </div>

              <p
                className="mt-4 hidden animate-enter text-xs text-muted-foreground sm:block"
                style={{ animationDelay: '320ms' }}
              >
                {t('landing.hero.note')}
              </p>
            </div>

            {/* Product preview */}
            <div className="animate-enter" style={{ animationDelay: '300ms' }}>
              <DashboardPreview />
            </div>
          </div>
        </div>

        {/* Scroll affordance, pinned to the bottom of the first screen. */}
        <a
          href="#features"
          className="group inline-flex animate-enter flex-col items-center gap-1 self-center pt-6 text-muted-foreground transition-colors hover:text-foreground"
          style={{ animationDelay: '460ms' }}
          aria-label={t('landing.hero.scrollCue')}
        >
          <span className="text-[11px] font-medium uppercase tracking-widest">{t('landing.hero.scrollCue')}</span>
          <ChevronDown className="h-5 w-5 motion-safe:animate-bounce" />
        </a>
      </div>
    </section>
  )
}
