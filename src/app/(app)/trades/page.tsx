import { Suspense } from 'react'
import { getTrades } from '@/lib/actions/trades'
import { getAccounts } from '@/lib/actions/accounts'
import { getTagGroups } from '@/lib/actions/tags'
import { getDashboardStats, getPnlCurve } from '@/lib/actions/stats'
import { readGlobalSettings } from '@/lib/global-settings'
import TradesTable from '@/components/trades/TradesTable'
import TradesHeader from '@/components/trades/TradesHeader'
import TradesStatsCards from '@/components/trades/TradesStatsCards'
import type { TradeFilters } from '@/types'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('meta.trades') }

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>
}) {
  const sp = await searchParams

  const num = (v: string | undefined) => {
    if (v === undefined || v.trim() === '') return undefined
    const n = Number(v)
    return Number.isNaN(n) ? undefined : n
  }

  const allowedSizes = [10, 25, 50, 100]
  const sizeRaw = num(sp.size)
  const pageSize = sizeRaw && allowedSizes.includes(sizeRaw) ? sizeRaw : 25

  const filters: TradeFilters = {
    page: num(sp.page) ?? 1,
    pageSize,
    search: sp.search,
    minPnl: num(sp.minPnl),
    maxPnl: num(sp.maxPnl),
    sortBy: sp.sortBy as TradeFilters['sortBy'],
    sortOrder: sp.sortOrder as TradeFilters['sortOrder'],
  }

  const [result, accounts, tagGroups, stats, curve, settings] = await Promise.all([
    getTrades(filters),
    getAccounts(),
    getTagGroups(),
    getDashboardStats(),
    getPnlCurve(),
    readGlobalSettings(),
  ])

  return (
    <div className="p-4 sm:p-6 animate-in">
      <TradesHeader total={result.total} />
      <TradesStatsCards stats={stats} curve={curve} />
      {/* Boundary required for useSearchParams in TradesTable. The route-level
          loading.tsx already covers the initial skeleton, so this renders null
          to avoid a second, stacked skeleton; filter/pagination changes show
          their pending state on the toolbar controls instead. */}
      <Suspense fallback={null}>
        <TradesTable
          trades={result.trades}
          total={result.total}
          page={result.page}
          totalPages={result.totalPages}
          pageSize={result.pageSize}
          timezone={settings.timezone}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          tagGroups={tagGroups}
          listFilters={filters}
          breakeven={settings.breakeven}
        />
      </Suspense>
    </div>
  )
}
