import { t } from '@/i18n'
import Blob from './Blob'
import Reveal from './Reveal'
import { appUrl } from './links'

export default function FinalCtaSection() {
  return (
    <section className="relative overflow-hidden border-t border-border px-6 py-16 sm:py-28">
      <Reveal className="relative mx-auto w-full max-w-5xl">
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-b from-primary/[0.08] to-card px-6 py-12 text-center sm:px-12 sm:py-20">
          <Blob className="-right-24 -top-10 h-[24rem] w-[24rem]" color="hsl(var(--primary) / 0.2)" />
          <Blob className="-left-24 -bottom-16 h-[22rem] w-[22rem]" color="hsl(var(--primary) / 0.14)" />
          <div className="relative">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">
              {t('landing.finalCta.kicker')}
            </p>
            <h2 className="mb-4 text-3xl font-semibold tracking-tight sm:text-4xl">{t('landing.finalCta.heading')}</h2>
            <p className="mx-auto mb-9 max-w-md text-muted-foreground">{t('landing.finalCta.subheading')}</p>
            <a
              href={appUrl('/sign-up')}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-7 py-3.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/30"
            >
              {t('landing.finalCta.cta')}
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
