import { Check } from 'lucide-react'
import { t, tList } from '@/i18n'
import Blob from './Blob'
import Reveal from './Reveal'

const showcase = [
  { key: 'dashboard', light: '/screenshots/dashboard-light.png', dark: '/screenshots/dashboard-dark.png' },
  { key: 'trade', light: '/screenshots/trade-detail-light.png', dark: '/screenshots/trade-detail-dark.png' },
  { key: 'discipline', light: '/screenshots/discipline-light.png', dark: '/screenshots/discipline-dark.png' },
] as const

export default function ShowcaseSection() {
  return (
    <section id="features" className="relative scroll-mt-20 overflow-hidden px-6 py-16 sm:py-28">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mx-auto mb-16 max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">
            {t('landing.showcase.kicker')}
          </p>
          <h2 className="mb-4 text-3xl font-semibold tracking-tight sm:text-4xl">{t('landing.showcase.heading')}</h2>
          <p className="text-muted-foreground">{t('landing.showcase.subheading')}</p>
        </Reveal>

        <div className="space-y-16 sm:space-y-24">
          {showcase.map((s, i) => {
            const reversed = i % 2 === 1
            const title = t(`landing.showcase.${s.key}.title`)
            return (
              <Reveal key={s.key} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
                {/* Screenshot */}
                <div className={`relative ${reversed ? 'lg:order-2' : ''}`}>
                  <Blob
                    className={`${reversed ? '-right-24' : '-left-24'} top-1/2 h-[24rem] w-[24rem] -translate-y-1/2`}
                    color="hsl(var(--primary) / 0.14)"
                  />
                  <div className="relative overflow-hidden rounded-xl border border-border shadow-2xl shadow-black/40">
                    {/* Theme-matched capture (toggled via the .dark class, like the Logo). */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.light}
                      alt={title}
                      loading="lazy"
                      decoding="async"
                      className="block w-full dark:hidden"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.dark}
                      alt={title}
                      loading="lazy"
                      decoding="async"
                      className="hidden w-full dark:block"
                    />
                  </div>
                </div>

                {/* Copy */}
                <div className={reversed ? 'lg:order-1' : ''}>
                  <h3 className="mb-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h3>
                  <p className="mb-5 leading-relaxed text-muted-foreground">{t(`landing.showcase.${s.key}.desc`)}</p>
                  <ul className="space-y-2.5">
                    {tList(`landing.showcase.${s.key}.points`).map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Check className="h-3 w-3" />
                        </span>
                        <span className="text-muted-foreground">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
