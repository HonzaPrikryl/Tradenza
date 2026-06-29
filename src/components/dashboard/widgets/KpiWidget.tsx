'use client'

import { memo } from 'react'
import { formatUnit, formatUnitWhole, formatPctSmart, cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { TopWidgetType, WidgetInstance } from '@/lib/dashboard/types'
import { useDashboardData } from '../DashboardDataContext'
import { useCountUp } from './shared'
import { AreaSparkline, ProfitFactorDonut, WinGauge, CountPills, WinLossBar } from '@/components/stats/StatVisuals'

function toneClass(v: number) {
  if (v > 0) return 'text-profit'
  if (v < 0) return 'text-loss'
  return 'text-foreground'
}

const VISUAL_H = 'min-h-[72px]'

function Value({
  target,
  fmt,
  tone,
  currency,
}: {
  target: number
  fmt: (v: number, c: string) => string
  tone: number
  currency: string
}) {
  const v = useCountUp(target)
  return (
    <div className={cn('text-[21px] lg:text-[26px] leading-none font-semibold tabular shrink-0', toneClass(tone))}>
      {fmt(v, currency)}
    </div>
  )
}

function Card({ label, badge, children }: { label: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col bg-card border border-border rounded-xl px-4 py-3 h-full min-h-[124px]">
      <div className="flex items-center gap-1.5 text-muted-foreground pb-2 border-b border-border/60">
        <span className="text-[12px]">{label}</span>
        {badge}
      </div>
      <div className="flex-1 flex items-center justify-between gap-3 pt-2">{children}</div>
    </div>
  )
}

function KpiWidget({ instance }: { instance: WidgetInstance }) {
  const { data, currency, unit } = useDashboardData()
  const k = data.kpi
  const type = instance.type as TopWidgetType
  const label = t(`dashboard.kpi.labels.${type}`)
  const empty = k.totalTrades === 0

  if (empty) {
    return (
      <Card label={label}>
        <div className="text-[26px] leading-none font-semibold text-muted-foreground">—</div>
      </Card>
    )
  }

  const pfFraction = k.grossProfit + k.grossLoss > 0 ? k.grossProfit / (k.grossProfit + k.grossLoss) : 1

  switch (type) {
    case 'net-pnl':
      return (
        <Card
          label={label}
          badge={
            <span className="ml-auto text-[11px] tabular text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {k.totalTrades}
            </span>
          }
        >
          <Value target={k.netPnl} fmt={(v, c) => formatUnitWhole(v, unit, c)} tone={k.netPnl} currency={currency} />
          <div className={cn('flex items-center flex-1 max-w-[140px] ml-3', VISUAL_H)}>
            <AreaSparkline points={data.daily.map((d) => d.cumulative)} className="h-12 w-full" />
          </div>
        </Card>
      )

    case 'trade-win-rate':
      return (
        <Card label={label}>
          <Value target={k.tradeWinRate} fmt={(v) => formatPctSmart(v)} tone={0} currency={currency} />
          <div className={cn('flex flex-col items-center justify-start gap-1 shrink-0', VISUAL_H)}>
            <WinGauge
              win={k.winningTrades}
              be={k.breakevenTrades}
              loss={k.losingTrades}
              className="h-10 w-[76px] lg:h-12 lg:w-[92px]"
            />
            <CountPills win={k.winningTrades} be={k.breakevenTrades} loss={k.losingTrades} />
          </div>
        </Card>
      )

    case 'day-win-rate':
      return (
        <Card label={label}>
          <Value target={k.dayWinRate} fmt={(v) => `${v.toFixed(0)}%`} tone={0} currency={currency} />
          <div className={cn('flex flex-col items-center justify-start gap-1 shrink-0', VISUAL_H)}>
            <WinGauge
              win={k.winningDays}
              be={k.breakevenDays}
              loss={k.losingDays}
              className="h-10 w-[76px] lg:h-12 lg:w-[92px]"
            />
            <CountPills win={k.winningDays} be={k.breakevenDays} loss={k.losingDays} />
          </div>
        </Card>
      )

    case 'profit-factor':
      return (
        <Card label={label}>
          <Value
            target={isFinite(k.profitFactor) ? k.profitFactor : 0}
            fmt={(v) => (v === 0 ? '∞' : v.toFixed(2))}
            tone={0}
            currency={currency}
          />
          <div className={cn('flex items-start justify-center shrink-0', VISUAL_H)}>
            <ProfitFactorDonut fraction={pfFraction} />
          </div>
        </Card>
      )

    case 'avg-win-loss':
      return (
        <Card label={label}>
          <Value
            target={isFinite(k.avgWinLossRatio) ? k.avgWinLossRatio : 0}
            fmt={(v) => (v === 0 ? '∞' : v.toFixed(2))}
            tone={0}
            currency={currency}
          />
          <div className={cn('flex items-center flex-1 ml-3', VISUAL_H)}>
            <WinLossBar win={k.avgWin} loss={k.avgLoss} currency={currency} unit={unit} />
          </div>
        </Card>
      )

    case 'expectancy':
      return (
        <Card label={label}>
          <div>
            <Value target={k.expectancy} fmt={(v, c) => formatUnit(v, unit, c)} tone={0} currency={currency} />
            <div className="text-[11px] text-muted-foreground mt-1">{t('dashboard.kpi.expectancySub')}</div>
          </div>
        </Card>
      )

    case 'max-drawdown':
      return (
        <Card label={label}>
          <div>
            <Value
              target={k.maxDrawdown}
              fmt={(v, c) => formatUnit(-Math.abs(v), unit, c)}
              tone={0}
              currency={currency}
            />
            <div className="text-[11px] text-muted-foreground mt-1">{t('dashboard.kpi.maxDrawdownSub')}</div>
          </div>
        </Card>
      )

    case 'avg-rr':
      return (
        <Card label={label}>
          <div>
            <Value target={k.avgRR} fmt={(v) => `${v.toFixed(2)}R`} tone={0} currency={currency} />
            <div className="text-[11px] text-muted-foreground mt-1">{t('dashboard.kpi.avgRrSub')}</div>
          </div>
        </Card>
      )

    case 'total-trades':
      return (
        <Card label={label}>
          <div>
            <Value target={k.totalTrades} fmt={(v) => `${Math.round(v)}`} tone={0} currency={currency} />
            <div className="text-[11px] text-muted-foreground mt-1">
              {t('dashboard.kpi.tradingDays', { count: k.tradingDays })}
            </div>
          </div>
        </Card>
      )

    case 'current-streak':
      return (
        <Card label={label}>
          <div>
            <Value
              target={k.currentStreak}
              fmt={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`}
              tone={0}
              currency={currency}
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              {k.currentStreak >= 0 ? t('dashboard.kpi.streakWin') : t('dashboard.kpi.streakLoss')}
            </div>
          </div>
        </Card>
      )
  }
}

export default memo(KpiWidget)
