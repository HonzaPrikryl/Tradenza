import { Suspense } from 'react'
import Link from 'next/link'
import { getTrades, hasAnyTrades } from '@/lib/actions/trades'
import { getAccounts } from '@/lib/actions/accounts'
import { getTagGroups } from '@/lib/actions/tags'
import { getStrategies } from '@/lib/actions/strategies'
import { getDashboardStats, getPnlCurve } from '@/lib/actions/stats'
import { readGlobalSettings } from '@/lib/global-settings'
import TradesTableClient from '@/components/trades/TradesTableClient'
import TradesHeader from '@/components/trades/TradesHeader'
import TradesStatsCards from '@/components/trades/TradesStatsCards'
import DemoNotice from '@/components/onboarding/DemoNotice'
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
    strategyId: sp.strategyId,
    sortBy: sp.sortBy as TradeFilters['sortBy'],
    sortOrder: sp.sortOrder as TradeFilters['sortOrder'],
  }

  const [result, accounts, tagGroups, strategies, stats, curve, settings, hasTrades] = await Promise.all([
    getTrades(filters),
    getAccounts(),
    getTagGroups(),
    getStrategies(),
    getDashboardStats(),
    getPnlCurve(),
    readGlobalSettings(),
    hasAnyTrades(),
  ])

  const activeStrategy = filters.strategyId ? strategies.find((s) => s.id === filters.strategyId) : undefined

  return (
    <div className="p-4 sm:p-6 animate-in">
      <TradesHeader total={result.total} />
      {!hasTrades && <DemoNotice context="trades" />}
      {activeStrategy && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeStrategy.color }} />
            {activeStrategy.name}
          </span>
          <Link href="/trades" className="text-muted-foreground transition-colors hover:text-foreground">
            {t('common.clear')}
          </Link>
        </div>
      )}
      <TradesStatsCards stats={stats} curve={curve} />
      <Suspense fallback={null}>
        <TradesTableClient
          trades={result.trades}
          total={result.total}
          page={result.page}
          totalPages={result.totalPages}
          pageSize={result.pageSize}
          timezone={settings.timezone}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          tagGroups={tagGroups}
          strategies={strategies}
          listFilters={filters}
          breakeven={settings.breakeven}
        />
      </Suspense>
    </div>
  )
}
