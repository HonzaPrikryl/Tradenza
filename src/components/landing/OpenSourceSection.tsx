import { Check, Coffee, Github, Heart, ShieldCheck } from 'lucide-react'
import { t } from '@/i18n'
import Blob from './Blob'
import Reveal from './Reveal'
import { COFFEE_URL, CONTRIBUTE_URL, GITHUB_URL, SPONSOR_URL } from './links'

export default function OpenSourceSection() {
  return (
    <section className="relative overflow-hidden px-6 py-16 sm:py-28">
      <Reveal className="relative mx-auto w-full max-w-6xl">
        <Blob className="-left-40 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2" color="hsl(var(--primary) / 0.14)" />
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 sm:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.16),transparent_70%)]"
          />
          <div className="relative max-w-2xl">
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3 w-3 text-primary" />
              {t('landing.oss.badge')}
            </span>
            <h2 className="mb-4 text-3xl font-semibold tracking-tight">{t('landing.oss.heading')}</h2>
            <p className="mb-7 leading-relaxed text-muted-foreground">{t('landing.oss.desc')}</p>

            <div className="mb-8 flex flex-wrap gap-3">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Github className="h-4 w-4" />
                {t('landing.oss.ctaStar')}
              </a>
              <a
                href={CONTRIBUTE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Check className="h-4 w-4 text-primary" />
                {t('landing.oss.ctaContribute')}
              </a>
            </div>

            <div className="rounded-lg border border-border bg-background/60 p-4">
              <p className="mb-3 text-sm text-muted-foreground">{t('landing.oss.tipLead')}</p>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={COFFEE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
                >
                  <Coffee className="h-4 w-4 text-primary" />
                  {t('landing.oss.ctaCoffee')}
                </a>
                <span className="text-border">·</span>
                <a
                  href={SPONSOR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
                >
                  <Heart className="h-4 w-4 text-primary" />
                  {t('landing.oss.ctaSponsor')}
                </a>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
