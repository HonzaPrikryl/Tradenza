import { t } from '@/i18n'
import Blob from './Blob'
import Reveal from './Reveal'

const steps = ['step1', 'step2', 'step3'] as const

export default function HowItWorksSection() {
  return (
    <section id="how" className="relative scroll-mt-20 overflow-hidden border-t border-border bg-card/30">
      <div className="relative mx-auto w-full max-w-5xl px-6 py-16 sm:py-28">
        <Blob className="-right-36 top-1/2 h-[24rem] w-[24rem] -translate-y-1/2" color="hsl(var(--primary) / 0.16)" />
        <Reveal className="mb-14 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">{t('landing.how.kicker')}</p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('landing.how.heading')}</h2>
        </Reveal>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map((step, i) => (
            <Reveal
              key={step}
              delay={i * 110}
              className="rounded-xl border border-border bg-background/50 p-6 transition-colors hover:border-primary/40"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-base font-semibold text-primary">
                {i + 1}
              </div>
              <h3 className="mb-2 font-medium">{t(`landing.how.${step}.title`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{t(`landing.how.${step}.desc`)}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
