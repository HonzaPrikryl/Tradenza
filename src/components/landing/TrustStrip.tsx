import { Github, Heart, Lock, Server } from 'lucide-react'
import { t } from '@/i18n'

const trust = [
  { icon: Github, key: 'openSource' },
  { icon: Server, key: 'selfHost' },
  { icon: Lock, key: 'ownData' },
  { icon: Heart, key: 'free' },
] as const

export default function TrustStrip() {
  return (
    <section className="relative overflow-hidden border-y border-border bg-card/30">
      <div className="relative mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-3 px-6 py-8">
        {trust.map(({ icon: Icon, key }) => (
          <span
            key={key}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground sm:text-sm"
          >
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            {t(`landing.trust.${key}`)}
          </span>
        ))}
      </div>
    </section>
  )
}
