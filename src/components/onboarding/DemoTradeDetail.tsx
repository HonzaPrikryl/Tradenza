import Link from 'next/link'
import { Sparkles, Plus, ArrowLeft } from 'lucide-react'
import { t } from '@/i18n'

export default function DemoTradeDetail() {
  return (
    <div className="p-4 sm:p-6 animate-in">
      <Link
        href="/trades"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('onboarding.demo.tradeDetail.back')}
      </Link>

      <div className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{t('onboarding.demo.tradeDetail.title')}</h1>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{t('onboarding.demo.tradeDetail.subtitle')}</p>
        <Link
          href="/add-trade"
          className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('onboarding.demo.addTrade')}
        </Link>
      </div>
    </div>
  )
}
