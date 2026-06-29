'use client'

import { cn, formatCurrency, formatPctSmart } from '@/lib/utils'
import { t } from '@/i18n'
import type { DashboardStats, PnlDataPoint } from '@/types'
import { AreaSparkline, ProfitFactorDonut, WinGauge, CountPills, WinLossBar } from '@/components/stats/StatVisuals'

const VISUAL_H = 'min-h-[72px]'

function toneClass(v: number) {
  if (v > 0) return 'text-profit'
  if (v < 0) return 'text-loss'
  return 'text-foreground'
}

function Card({ label, badge, children }: { label: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[124px] flex-col rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 border-b border-border/60 pb-2 text-muted-foreground">
        <span className="text-[12px]">{label}</span>
        {badge}
      </div>
      <div className="flex flex-1 items-center justify-between gap-3 pt-2">{children}</div>
    </div>
  )
}

function Value({ children, tone = 0 }: { children: React.ReactNode; tone?: number }) {
  return (
    <div className={cn('shrink-0 text-[21px] font-semibold leading-none tabular lg:text-[26px]', toneClass(tone))}>
      {children}
    </div>
  )
}

export default function TradesStatsCards({
  stats,
  curve,
  currency = 'USD',
}: {
  stats: DashboardStats
  curve: PnlDataPoint[]
  currency?: string
}) {
  const cumulative = curve.map((p) => p.cumulative)
  const breakEven = Math.max(0, stats.totalTrades - stats.winningTrades - stats.losingTrades)
  const grossProfit = stats.avgWin * stats.winningTrades
  const grossLoss = Math.abs(stats.avgLoss) * stats.losingTrades
  const pfFraction = grossProfit + grossLoss > 0 ? grossProfit / (grossProfit + grossLoss) : 1
  const winLoss = stats.avgLoss !== 0 ? stats.avgWin / Math.abs(stats.avgLoss) : stats.avgWin > 0 ? Infinity : 0

  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {/* Net cumulative P&L */}
      <Card
        label={t('trades.stats.netCumulative')}
        badge={
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[11px] tabular text-muted-foreground">
            {stats.totalTrades}
          </span>
        }
      >
        <Value tone={stats.totalNetPnl}>{formatCurrency(stats.totalNetPnl, currency)}</Value>
        <div className={cn('ml-3 flex max-w-[140px] flex-1 items-center', VISUAL_H)}>
          <AreaSparkline points={cumulative} className="h-12 w-full" />
        </div>
      </Card>

      {/* Profit factor */}
      <Card label={t('trades.stats.profitFactor')}>
        <Value>{Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'}</Value>
        <div className={cn('flex shrink-0 items-start justify-center', VISUAL_H)}>
          <ProfitFactorDonut fraction={pfFraction} />
        </div>
      </Card>

      {/* Trade win % */}
      <Card label={t('trades.stats.winRate')}>
        <Value>{formatPctSmart(stats.winRate)}</Value>
        <div className={cn('flex shrink-0 flex-col items-center justify-start gap-1', VISUAL_H)}>
          <WinGauge
            win={stats.winningTrades}
            be={breakEven}
            loss={stats.losingTrades}
            className="h-10 w-[76px] lg:h-12 lg:w-[92px]"
          />
          <CountPills win={stats.winningTrades} be={breakEven} loss={stats.losingTrades} />
        </div>
      </Card>

      {/* Avg win/loss trade */}
      <Card label={t('trades.stats.avgWinLoss')}>
        <Value>{Number.isFinite(winLoss) ? winLoss.toFixed(2) : '∞'}</Value>
        <div className={cn('ml-3 flex flex-1 items-center', VISUAL_H)}>
          <WinLossBar win={stats.avgWin} loss={stats.avgLoss} currency={currency} />
        </div>
      </Card>
    </div>
  )
}
