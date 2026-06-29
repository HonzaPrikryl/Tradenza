import { Suspense } from 'react'
import { getTradeStats } from '@/lib/actions/stats'
import StatsClient from '@/components/stats/StatsClient'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('meta.stats') }

export default async function StatsPage() {
  return (
    <div className="p-4 sm:p-6 w-full animate-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{t('stats.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('stats.subtitle')}</p>
      </div>
      <Suspense fallback={<StatsSkeleton />}>
        <StatsContent />
      </Suspense>
    </div>
  )
}

async function StatsContent() {
  const data = await getTradeStats()
  return <StatsClient data={data} />
}

function StatsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="skeleton h-10 w-52 rounded-lg" />
        <div className="skeleton h-10 w-44 rounded-md" />
      </div>
      <div className="skeleton h-9 w-60 rounded-lg" />
      <div className="rounded-xl border border-border bg-card px-5 py-2">
        <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="py-3.5">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton mt-2 h-5 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
