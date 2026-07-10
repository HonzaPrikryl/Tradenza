import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getStrategyOverview } from '@/lib/actions/strategies'
import StrategiesClient from '@/components/strategies/StrategiesClient'
import { StrategiesListSkeleton } from '@/components/strategies/StrategiesSkeletons'
import { t } from '@/i18n'

export const metadata: Metadata = { title: t('strategies.title') }

export default function StrategiesPage() {
  return (
    <div className="p-4 sm:p-6 w-full animate-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{t('strategies.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">{t('strategies.subtitle')}</p>
      </div>
      <Suspense fallback={<StrategiesListSkeleton />}>
        <StrategiesContent />
      </Suspense>
    </div>
  )
}

async function StrategiesContent() {
  const strategies = await getStrategyOverview()
  return <StrategiesClient strategies={strategies} />
}
