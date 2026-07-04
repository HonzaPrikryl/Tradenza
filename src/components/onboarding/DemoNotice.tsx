import Link from 'next/link'
import { Sparkles, Plus } from 'lucide-react'
import { t } from '@/i18n'

// Shown at the top of the dashboard/trades/stats pages while the user has no real
// trades yet. It frames the surrounding preview as demo data and points to the
// first action. Disappears automatically once a first trade exists.
export default function DemoNotice({ context }: { context: 'dashboard' | 'trades' | 'stats' }) {
  return (
    <div className="mb-5 flex flex-col gap-4 rounded-xl border border-primary/25 bg-primary/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <span className="inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
            {t('onboarding.demo.badge')}
          </span>
          <h2 className="mt-1.5 text-sm font-semibold text-foreground">{t(`onboarding.demo.${context}.title`)}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t(`onboarding.demo.${context}.subtitle`)}</p>
        </div>
      </div>
      <Link
        href="/add-trade"
        className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:self-auto"
      >
        <Plus className="h-4 w-4" />
        {t('onboarding.demo.addTrade')}
      </Link>
    </div>
  )
}
