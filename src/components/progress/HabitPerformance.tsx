'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { t } from '@/i18n'
import { getHabitPerformance, type HabitPerformanceData } from '@/lib/actions/progress'
import { HABIT_PERF_SOLID_SAMPLE } from '@/lib/progress-compute'
import Tooltip from '@/components/ui/Tooltip'
import WidgetInfo from './WidgetInfo'

// Habit → trading-performance correlation. Lazy-loaded on mount so its trade query
// never blocks the habits panel's first paint. Shows, per habit, the average
// trading-day P&L on days the habit was kept vs. missed. `refreshKey` re-runs the
// query after a habit is toggled (a completion moves a trading day between buckets).
export default function HabitPerformance({
  refreshKey = 0,
  currency,
}: {
  refreshKey?: number
  /** Display currency for money figures — see the note in progress/page.tsx. */
  currency: string
}) {
  const [data, setData] = useState<HabitPerformanceData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    getHabitPerformance()
      .then((d) => alive && setData(d))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [refreshKey])

  if (failed) return null

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('progress.habits.perf.title')}</h3>
        <WidgetInfo text={t('progress.habits.perf.info')} />
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{t('progress.habits.perf.sub')}</p>

      {data === null ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : !data.anySignal ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('progress.habits.perf.noData')}</p>
      ) : (
        <div className="space-y-2">
          {data.habits
            .filter((h) => h.enoughData)
            .map((h) => {
              const up = h.pnlDelta >= 0
              // Cleared the minimum but not yet on firm ground — flag it rather than
              // presenting a two-week coincidence as a finding. Mirrors the trading
              // payoff widget's tiers.
              const indicative = Math.min(h.doneDays, h.missedDays) < HABIT_PERF_SOLID_SAMPLE
              return (
                <div
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                        up ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss',
                      )}
                    >
                      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">{h.name}</span>
                    {indicative && (
                      <Tooltip label={t('progress.stats.perfIndicativeHint', { solid: HABIT_PERF_SOLID_SAMPLE })}>
                        <span
                          tabIndex={0}
                          className="shrink-0 cursor-help rounded bg-muted px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus:outline-none"
                        >
                          {t('progress.stats.perfIndicative')}
                        </span>
                      </Tooltip>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <Bucket
                      label={t('progress.habits.perf.done')}
                      avgPnl={h.doneAvgPnl}
                      winRate={h.doneWinRate}
                      days={h.doneDays}
                      currency={currency}
                    />
                    <span className="text-muted-foreground/40">→</span>
                    <Bucket
                      label={t('progress.habits.perf.missed')}
                      avgPnl={h.missedAvgPnl}
                      winRate={h.missedWinRate}
                      days={h.missedDays}
                      currency={currency}
                      muted
                    />
                    <div
                      className={cn(
                        'w-24 text-right text-sm font-bold tabular',
                        up ? 'text-profit' : 'text-loss',
                        indicative && 'opacity-80',
                      )}
                    >
                      {t('progress.habits.perf.delta', {
                        sign: up ? '+' : '−',
                        amount: formatCurrency(Math.abs(h.pnlDelta), currency),
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

function Bucket({
  label,
  avgPnl,
  winRate,
  days,
  currency,
  muted = false,
}: {
  label: string
  avgPnl: number
  winRate: number
  days: number
  currency: string
  muted?: boolean
}) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label} · {t('progress.habits.perf.days', { count: days })}
      </div>
      <div
        className={cn(
          'text-sm font-semibold tabular',
          muted ? 'text-muted-foreground' : avgPnl >= 0 ? 'text-profit' : 'text-loss',
        )}
      >
        {formatCurrency(avgPnl, currency)}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {t('progress.habits.perf.winRate', { pct: Math.round(winRate * 100) })}
      </div>
    </div>
  )
}
