import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { getStrategyDetail } from '@/lib/actions/strategies'
import StrategyEquityChart from '@/components/strategies/StrategyEquityChart'
import StrategyDetailActions from '@/components/strategies/StrategyDetailActions'
import StrategyImageGallery from '@/components/strategies/StrategyImageGallery'
import SortableTradesTable from '@/components/trades/SortableTradesTable'
import { formatCurrency, cn } from '@/lib/utils'
import { t } from '@/i18n'

export const metadata: Metadata = { title: t('strategies.title') }
export const dynamic = 'force-dynamic'

function pnlClass(v: number): string | undefined {
  if (v === 0) return undefined
  return v > 0 ? 'text-profit' : 'text-loss'
}

export default async function StrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getStrategyDetail(id)
  if (!detail) notFound()

  const { strategy, stats, curve, recentTrades } = detail
  const hasData = stats.totalTrades > 0

  return (
    <div className="p-4 sm:p-6 w-full animate-in">
      <Link
        href="/strategies"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('strategies.detail.back')}
      </Link>

      <div className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="min-w-0 text-xl font-semibold tracking-tight">{strategy.name}</h1>
          <StrategyDetailActions strategy={strategy} />
        </div>
        {strategy.description && (
          <div className="bg-card rounded-lg mt-4 p-4">
            <div
              className="rte mt-2 w-full text-sm text-foreground"
              dangerouslySetInnerHTML={{ __html: strategy.description }}
            />
          </div>
        )}
      </div>

      {/* Playbook definition */}
      {(strategy.checklist.length > 0 || strategy.imageUrls.length > 0) && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          {strategy.checklist.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">{t('strategies.detail.checklistTitle')}</h2>
              <ul className="space-y-2">
                {strategy.checklist.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {strategy.imageUrls.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">{t('strategies.detail.referenceTitle')}</h2>
              <StrategyImageGallery images={strategy.imageUrls} />
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label={t('strategies.stats.trades')} value={String(stats.totalTrades)} />
        <Tile
          label={t('strategies.stats.netPnl')}
          value={formatCurrency(stats.totalPnl)}
          valueClass={pnlClass(stats.totalPnl)}
        />
        <Tile label={t('strategies.stats.winRate')} value={hasData ? `${Math.round(stats.winPct)}%` : '—'} />
        <Tile label={t('strategies.stats.expectancy')} value={hasData ? formatCurrency(stats.tradeExpectancy) : '—'} />
        <Tile label={t('strategies.stats.avgR')} value={hasData ? `${stats.avgRealizedR.toFixed(2)}R` : '—'} />
        <Tile
          label={t('strategies.stats.profitFactor')}
          value={hasData && Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '—'}
        />
      </div>

      {/* Equity curve */}
      {curve.length > 1 && (
        <div className="mb-4">
          <h2 className="mb-3 text-sm font-semibold">{t('strategies.detail.equity')}</h2>
          <div className="h-64 rounded-xl border border-border bg-card p-3">
            <StrategyEquityChart data={curve} />
          </div>
        </div>
      )}

      {/* Recent trades */}
      <div className="mb-4">
        <h2 className="mb-3 text-sm font-semibold">{t('strategies.detail.recent')}</h2>
        {recentTrades.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {t('strategies.detail.noTrades')}
          </div>
        ) : (
          <SortableTradesTable
            trades={recentTrades}
            storageKey="tradenza-strategy-trades-sort"
            columnsKey="strategies.detail.columns"
            rowBasePath="/trades"
          />
        )}
      </div>
    </div>
  )
}

function Tile({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className={cn('text-lg font-semibold tabular-nums', valueClass)}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
