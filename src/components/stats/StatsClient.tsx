'use client'

import { useState } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import Select from '@/components/ui/Select'
import type { StatsData, StatsBundle, PlType } from '@/types'
import { t } from '@/i18n'

interface Props {
  data: StatsData
}

type PrimaryTab = 'performance' | 'overview'
type PerfTab = 'summary' | 'days' | 'trades'

const fmtMoney = (n: number, currency: string) => formatCurrency(n, currency)
const fmtPct = (n: number) => `${n.toFixed(2)}%`
const fmtRatio = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '∞')
const fmtR = (n: number) => `${n.toFixed(2)}R`
const fmtNum = (n: number) => n.toFixed(2)
const fmtCount = (n: number) => String(n)

function fmtDuration(min: number | null): string {
  if (min === null) return '—'
  const total = Math.round(min)
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

const pnlTone = (n: number) => (n > 0 ? 'text-profit' : n < 0 ? 'text-loss' : 'text-foreground')

function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  size = 'md',
}: {
  tabs: { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
  size?: 'md' | 'sm'
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'rounded-md font-medium transition-colors',
            size === 'md' ? 'px-4 py-1.5 text-sm' : 'px-3 py-1 text-xs',
            active === tab.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

interface Metric {
  label: string
  value: string
  sub?: string
  tone?: 'pnl'
  raw?: number
}

function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-2">
      <div className="columns-2 gap-8 sm:columns-3 lg:columns-4 [column-rule:1px_solid_hsl(var(--border))]">
        {metrics.map((m) => (
          <div key={m.label} className="break-inside-avoid py-3.5">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p
              className={cn(
                'mt-1 text-lg font-semibold tabular',
                m.tone === 'pnl' && m.raw !== undefined ? pnlTone(m.raw) : 'text-foreground',
              )}
            >
              {m.value}
            </p>
            {m.sub && <p className="mt-0.5 text-xs text-muted-foreground tabular">{m.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function StatsClient({ data }: Props) {
  const [primary, setPrimary] = useState<PrimaryTab>('performance')
  const [perfTab, setPerfTab] = useState<PerfTab>('summary')
  const [plType, setPlType] = useState<PlType>('net')

  const b: StatsBundle = plType === 'gross' ? data.gross : data.net
  const cur = data.currency
  const plCap = plType === 'gross' ? 'Gross' : 'Net'
  const plLow = plType === 'gross' ? 'gross' : 'net'

  if (!b.hasData) {
    return (
      <div className="rounded-lg border border-border bg-card p-16 text-center">
        <p className="text-sm text-muted-foreground">{t('stats.empty')}</p>
      </div>
    )
  }

  const dayCounts = `(${b.winningDays}/${b.breakevenDays}/${b.losingDays})`

  // ── Performance → Summary ──
  const summaryMetrics: Metric[] = [
    { label: t('stats.m.pnl', { pl: plCap }), value: fmtMoney(b.totalPnl, cur), tone: 'pnl', raw: b.totalPnl },
    { label: t('stats.m.winPct'), value: fmtPct(b.winPct) },
    { label: t('stats.m.avgDailyWinPct'), value: fmtPct(b.avgDailyWinPct), sub: dayCounts },
    { label: t('stats.m.profitFactor'), value: fmtRatio(b.profitFactor) },
    {
      label: t('stats.m.tradeExpectancy'),
      value: fmtMoney(b.tradeExpectancy, cur),
      tone: 'pnl',
      raw: b.tradeExpectancy,
    },
    { label: t('stats.m.avgDailyWinLoss'), value: fmtRatio(b.avgDailyWinLoss) },
    { label: t('stats.m.avgTradeWinLoss'), value: fmtRatio(b.avgTradeWinLoss) },
    { label: t('stats.m.avgHoldTime'), value: fmtDuration(b.avgHoldAll) },
    {
      label: t('stats.m.avgTradePnl', { pl: plLow }),
      value: fmtMoney(b.avgTradePnl, cur),
      tone: 'pnl',
      raw: b.avgTradePnl,
    },
    {
      label: t('stats.m.avgDailyPnl', { pl: plLow }),
      value: fmtMoney(b.avgDailyPnl, cur),
      tone: 'pnl',
      raw: b.avgDailyPnl,
    },
    { label: t('stats.m.avgPlannedR'), value: fmtR(b.avgPlannedR) },
    { label: t('stats.m.avgRealizedR'), value: fmtR(b.avgRealizedR) },
    { label: t('stats.m.avgDailyVolume'), value: fmtNum(b.avgDailyVolume) },
    { label: t('stats.m.loggedDays'), value: fmtCount(b.loggedDays) },
    {
      label: t('stats.m.maxDailyDrawdown', { pl: plLow }),
      value: fmtMoney(b.maxDailyDrawdown, cur),
      tone: 'pnl',
      raw: b.maxDailyDrawdown,
    },
    {
      label: t('stats.m.avgDailyDrawdown', { pl: plLow }),
      value: fmtMoney(b.avgDailyDrawdown, cur),
      tone: 'pnl',
      raw: b.avgDailyDrawdown,
    },
  ]

  // ── Performance → Days ──
  const daysMetrics: Metric[] = [
    { label: t('stats.m.avgDailyWinPct'), value: fmtPct(b.avgDailyWinPct), sub: dayCounts },
    {
      label: t('stats.m.largestLosingDay'),
      value: fmtMoney(b.largestLosingDay, cur),
      tone: 'pnl',
      raw: b.largestLosingDay,
    },
    { label: t('stats.m.avgDailyWinLoss'), value: fmtRatio(b.avgDailyWinLoss) },
    { label: t('stats.m.avgTradingDayDuration'), value: fmtDuration(b.avgTradingDayDuration) },
    {
      label: t('stats.m.largestProfitableDay'),
      value: fmtMoney(b.largestProfitableDay, cur),
      tone: 'pnl',
      raw: b.largestProfitableDay,
    },
    {
      label: t('stats.m.avgDailyPnl', { pl: plLow }),
      value: fmtMoney(b.avgDailyPnl, cur),
      tone: 'pnl',
      raw: b.avgDailyPnl,
    },
  ]

  // ── Performance → Trades ──
  const tradesMetrics: Metric[] = [
    { label: t('stats.m.winPct'), value: fmtPct(b.winPct) },
    { label: t('stats.m.longsWinPct'), value: fmtPct(b.longsWinPct) },
    {
      label: t('stats.m.avgTradePnl', { pl: plLow }),
      value: fmtMoney(b.avgTradePnl, cur),
      tone: 'pnl',
      raw: b.avgTradePnl,
    },
    { label: t('stats.m.avgTradeWinLoss'), value: fmtRatio(b.avgTradeWinLoss) },
    {
      label: t('stats.m.tradeExpectancy'),
      value: fmtMoney(b.tradeExpectancy, cur),
      tone: 'pnl',
      raw: b.tradeExpectancy,
    },
    { label: t('stats.m.avgTradingDayDuration'), value: fmtDuration(b.avgTradingDayDuration) },
    {
      label: t('stats.m.largestProfitableTrade'),
      value: fmtMoney(b.largestProfit, cur),
      tone: 'pnl',
      raw: b.largestProfit,
    },
    { label: t('stats.m.largestLosingTrade'), value: fmtMoney(b.largestLoss, cur), tone: 'pnl', raw: b.largestLoss },
    { label: t('stats.m.longestTradeDuration'), value: fmtDuration(b.longestTradeDuration) },
    { label: t('stats.m.shortsWinPct'), value: fmtPct(b.shortsWinPct) },
  ]

  // ── Overview → list ──
  const overviewRows: { label: string; value: string; tone?: 'pnl'; raw?: number }[] = [
    { label: t('stats.o.totalPnl'), value: fmtMoney(b.totalPnl, cur), tone: 'pnl', raw: b.totalPnl },
    { label: t('stats.o.avgDailyVolume'), value: fmtNum(b.avgDailyVolume) },
    { label: t('stats.o.avgWinningTrade'), value: fmtMoney(b.avgWin, cur), tone: 'pnl', raw: b.avgWin },
    { label: t('stats.o.avgLosingTrade'), value: fmtMoney(b.avgLoss, cur), tone: 'pnl', raw: b.avgLoss },
    { label: t('stats.o.totalTrades'), value: fmtCount(b.totalTrades) },
    { label: t('stats.o.winningTrades'), value: fmtCount(b.winningTrades) },
    { label: t('stats.o.losingTrades'), value: fmtCount(b.losingTrades) },
    { label: t('stats.o.breakEvenTrades'), value: fmtCount(b.breakEvenTrades) },
    { label: t('stats.o.maxConsecWins'), value: fmtCount(b.maxConsecutiveWins) },
    { label: t('stats.o.maxConsecLosses'), value: fmtCount(b.maxConsecutiveLosses) },
    { label: t('stats.o.totalCommissions'), value: fmtMoney(b.totalCommissions, cur) },
    { label: t('stats.o.totalFees'), value: fmtMoney(b.totalFees, cur) },
    { label: t('stats.o.totalSwap'), value: fmtMoney(b.totalSwap, cur) },
    { label: t('stats.o.largestProfit'), value: fmtMoney(b.largestProfit, cur), tone: 'pnl', raw: b.largestProfit },
    { label: t('stats.o.largestLoss'), value: fmtMoney(b.largestLoss, cur), tone: 'pnl', raw: b.largestLoss },
    { label: t('stats.o.avgHoldAll'), value: fmtDuration(b.avgHoldAll) },
    { label: t('stats.o.avgHoldWin'), value: fmtDuration(b.avgHoldWin) },
    { label: t('stats.o.avgHoldLoss'), value: fmtDuration(b.avgHoldLoss) },
    { label: t('stats.o.avgHoldScratch'), value: fmtDuration(b.avgHoldScratch) },
    { label: t('stats.o.avgTradePnl'), value: fmtMoney(b.avgTradePnl, cur), tone: 'pnl', raw: b.avgTradePnl },
    { label: t('stats.o.profitFactor'), value: fmtRatio(b.profitFactor) },
    { label: t('stats.o.openTrades'), value: fmtCount(data.openTrades) },
    { label: t('stats.o.totalTradingDays'), value: fmtCount(b.tradingDays) },
    { label: t('stats.o.winningDays'), value: fmtCount(b.winningDays) },
    { label: t('stats.o.losingDays'), value: fmtCount(b.losingDays) },
    { label: t('stats.o.breakevenDays'), value: fmtCount(b.breakevenDays) },
    { label: t('stats.o.loggedDays'), value: fmtCount(b.loggedDays) },
    { label: t('stats.o.maxConsecWinDays'), value: fmtCount(b.maxConsecutiveWinningDays) },
    { label: t('stats.o.maxConsecLossDays'), value: fmtCount(b.maxConsecutiveLosingDays) },
    { label: t('stats.o.avgDailyPnl'), value: fmtMoney(b.avgDailyPnl, cur), tone: 'pnl', raw: b.avgDailyPnl },
    {
      label: t('stats.o.avgWinningDay'),
      value: fmtMoney(b.avgWinningDayPnl, cur),
      tone: 'pnl',
      raw: b.avgWinningDayPnl,
    },
    { label: t('stats.o.avgLosingDay'), value: fmtMoney(b.avgLosingDayPnl, cur), tone: 'pnl', raw: b.avgLosingDayPnl },
    {
      label: t('stats.o.largestProfitableDay'),
      value: fmtMoney(b.largestProfitableDay, cur),
      tone: 'pnl',
      raw: b.largestProfitableDay,
    },
    {
      label: t('stats.o.largestLosingDay'),
      value: fmtMoney(b.largestLosingDay, cur),
      tone: 'pnl',
      raw: b.largestLosingDay,
    },
    { label: t('stats.o.avgPlannedR'), value: fmtR(b.avgPlannedR) },
    { label: t('stats.o.avgRealizedR'), value: fmtR(b.avgRealizedR) },
    {
      label: t('stats.o.tradeExpectancy'),
      value: fmtMoney(b.tradeExpectancy, cur),
      tone: 'pnl',
      raw: b.tradeExpectancy,
    },
    { label: t('stats.o.maxDrawdown'), value: fmtMoney(b.maxDrawdown, cur), tone: 'pnl', raw: b.maxDrawdown },
    { label: t('stats.o.maxDrawdownPct'), value: fmtPct(b.maxDrawdownPct) },
    { label: t('stats.o.avgDrawdown'), value: fmtMoney(b.avgDrawdown, cur), tone: 'pnl', raw: b.avgDrawdown },
    { label: t('stats.o.avgDrawdownPct'), value: fmtPct(b.avgDrawdownPct) },
  ]

  const monthCards = [
    {
      label: t('stats.o.bestMonth'),
      value: b.bestMonth ? fmtMoney(b.bestMonth.value, cur) : '—',
      sub: b.bestMonth ? t('stats.monthIn', { month: b.bestMonth.key }) : undefined,
      raw: b.bestMonth?.value ?? 0,
    },
    {
      label: t('stats.o.lowestMonth'),
      value: b.lowestMonth ? fmtMoney(b.lowestMonth.value, cur) : '—',
      sub: b.lowestMonth ? t('stats.monthIn', { month: b.lowestMonth.key }) : undefined,
      raw: b.lowestMonth?.value ?? 0,
    },
    {
      label: t('stats.o.average'),
      value: fmtMoney(b.avgMonth, cur),
      sub: t('stats.perMonth'),
      raw: b.avgMonth,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabBar
          tabs={[
            { id: 'performance', label: t('stats.tabs.performance') },
            { id: 'overview', label: t('stats.tabs.overview') },
          ]}
          active={primary}
          onChange={setPrimary}
        />
        <div className="w-44">
          <Select
            value={plType}
            onValueChange={(v) => setPlType(v as PlType)}
            options={[
              { value: 'net', label: t('stats.plType.net') },
              { value: 'gross', label: t('stats.plType.gross') },
            ]}
          />
        </div>
      </div>

      {primary === 'performance' && (
        <div className="space-y-4">
          <TabBar
            tabs={[
              { id: 'summary', label: t('stats.subtabs.summary') },
              { id: 'days', label: t('stats.subtabs.days') },
              { id: 'trades', label: t('stats.subtabs.trades') },
            ]}
            active={perfTab}
            onChange={setPerfTab}
            size="sm"
          />
          {perfTab === 'summary' && <MetricGrid metrics={summaryMetrics} />}
          {perfTab === 'days' && <MetricGrid metrics={daysMetrics} />}
          {perfTab === 'trades' && <MetricGrid metrics={tradesMetrics} />}
        </div>
      )}

      {primary === 'overview' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{t('stats.yourStats')}</h2>
            <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground">
              {data.dateRangeLabel ?? t('stats.allDates')}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {monthCards.map((c) => (
              <div key={c.label} className="rounded-xl border border-border bg-card px-4 py-3.5">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={cn('mt-1 text-lg font-semibold tabular', pnlTone(c.raw))}>{c.value}</p>
                {c.sub && <p className="mt-0.5 text-xs text-muted-foreground">{c.sub}</p>}
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card px-5 py-2">
            <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
              {overviewRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-b-0"
                >
                  <span className="text-sm text-muted-foreground">{row.label}</span>
                  <span
                    className={cn(
                      'text-sm font-medium tabular',
                      row.tone === 'pnl' && row.raw !== undefined ? pnlTone(row.raw) : 'text-foreground',
                    )}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
