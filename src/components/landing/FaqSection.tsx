import { ChevronDown } from 'lucide-react'
import { t } from '@/i18n'
import Blob from './Blob'
import Reveal from './Reveal'

type FaqItem = {
  q: string
  a: string
}

export default function FaqSection({ faqs }: { faqs: FaqItem[] }) {
  return (
    <section id="faq" className="relative scroll-mt-20 overflow-hidden border-t border-border px-6 py-16 sm:py-28">
      <div className="relative mx-auto w-full max-w-3xl">
        <Blob className="-right-32 top-1/3 h-[22rem] w-[22rem] -translate-y-1/2" color="hsl(var(--primary) / 0.12)" />
        <Reveal className="mb-12 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">{t('landing.faq.kicker')}</p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('landing.faq.heading')}</h2>
        </Reveal>

        <div className="space-y-3">
          {faqs.map((f, i) => (
            <Reveal key={f.q} delay={(i % 3) * 70}>
              <details className="group rounded-xl border border-border bg-card px-5 transition-colors hover:border-primary/40 open:border-primary/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
                </summary>
                <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
