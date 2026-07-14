import { ClipboardCheck, Download, MonitorSmartphone, SlidersHorizontal, Tags, Wallet } from 'lucide-react'
import { t } from '@/i18n'
import Blob from './Blob'
import Reveal from './Reveal'

const features = [
  { icon: ClipboardCheck, key: 'strategies' },
  { icon: Download, key: 'import' },
  { icon: Wallet, key: 'accounts' },
  { icon: Tags, key: 'tags' },
  { icon: MonitorSmartphone, key: 'responsibility' },
  { icon: SlidersHorizontal, key: 'filters' },
] as const

export default function FeaturesSection() {
  return (
    <section className="relative overflow-hidden border-t border-border px-6 py-16 sm:py-28">
      <div className="relative mx-auto w-full max-w-6xl">
        <Blob className="-left-60 top-10 h-[26rem] w-[26rem]" color="hsl(var(--primary) / 0.15)" />
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">
            {t('landing.features.kicker')}
          </p>
          <h2 className="mb-4 text-3xl font-semibold tracking-tight sm:text-4xl">{t('landing.features.heading')}</h2>
          <p className="text-muted-foreground">{t('landing.features.subheading')}</p>
        </Reveal>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, key }, i) => (
            <Reveal
              key={key}
              delay={(i % 3) * 90}
              className="group rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-black/20"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 font-medium">{t(`landing.features.${key}.title`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{t(`landing.features.${key}.desc`)}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
