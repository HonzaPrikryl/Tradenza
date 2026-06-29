'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { X, ChevronRight, Loader2 } from 'lucide-react'
import { getDayDetail } from '@/lib/actions/dashboard'
import { formatCurrency, axisUnit, cn } from '@/lib/utils'
import { t } from '@/i18n'
import { getUiLocale } from '@/i18n/config'
import type { DayDetail } from '@/lib/dashboard/types'
import { useChartColors, makeTooltipStyle } from './shared'
import Dialog from '@/components/ui/Dialog'

function formatDateHeader(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(getUiLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const cls =
    tone === undefined ? 'text-foreground' : tone > 0 ? 'text-profit' : tone < 0 ? 'text-loss' : 'text-foreground'
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-semibold tabular leading-tight', cls)}>{value}</div>
    </div>
  )
}

export default function DayDetailDialog({
  date,
  currency,
  onClose,
}: {
  date: string
  currency: string
  onClose: () => void
}) {
  const router = useRouter()
  const c = useChartColors()
  const [detail, setDetail] = useState<DayDetail | null>(null)
  const [, start] = useTransition()

  useEffect(() => {
    start(async () => setDetail(await getDayDetail(date)))
  }, [date])

  function goTrade(id: string) {
    onClose()
    router.push(`/trades/${id}`)
  }

  const s = detail?.stats
  const color = (s?.netPnl ?? 0) >= 0 ? c.profit : c.loss

  return (
    <Dialog onClose={onClose} z="z-[200]" className="max-w-2xl max-h-[88vh] overflow-y-auto rounded-xl animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <h2 className="text-xl font-bold truncate">{formatDateHeader(date)}</h2>
          {s && (
            <span className={cn('text-lg tabular font-bold', s.netPnl >= 0 ? 'text-profit' : 'text-loss')}>
              {formatCurrency(s.netPnl, currency)}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label={t('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!detail ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Stat label={t('dashboard.dayDetail.totalTrades')} value={`${s!.totalTrades}`} />
            <Stat
              label={t('dashboard.dayDetail.grossPnl')}
              value={formatCurrency(s!.grossPnl, currency)}
              tone={s!.grossPnl}
            />
            <Stat label={t('dashboard.dayDetail.winnersLosers')} value={`${s!.wins} / ${s!.losses}`} />
            <Stat label={t('dashboard.dayDetail.commissions')} value={formatCurrency(s!.commissions, currency)} />
            <Stat label={t('dashboard.dayDetail.winRate')} value={`${s!.winRate.toFixed(1)}%`} />
            <Stat label={t('dashboard.dayDetail.volume')} value={`${Math.round(s!.volume)}`} />
            <Stat
              label={t('dashboard.dayDetail.profitFactor')}
              value={isFinite(s!.profitFactor) ? s!.profitFactor.toFixed(2) : '∞'}
            />
          </div>

          {/* Intraday cumulative net P&L */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              {t('dashboard.dayDetail.intradayCumulative')}
            </h3>
            <div className="h-48 rounded-lg border border-border bg-background/40 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={detail.cumulative} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="dayCum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: c.axis }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: c.axis }}
                    tickFormatter={(v) => axisUnit(v, 'dollar')}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <ReferenceLine y={0} stroke={c.axis} strokeOpacity={0.3} />
                  <Tooltip
                    contentStyle={makeTooltipStyle(c)}
                    itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    formatter={(v: number) => [formatCurrency(v, currency), t('dashboard.seriesCumulative')]}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke={color}
                    strokeWidth={1.75}
                    fill="url(#dayCum)"
                    dot={false}
                    animationDuration={500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Trades */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              {t('dashboard.dayDetail.tradesHeading', { count: detail.trades.length })}
            </h3>
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-background/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span className="w-7" />
                <span className="w-16">{t('dashboard.dayDetail.symbol')}</span>
                <span className="w-12">{t('dashboard.dayDetail.time')}</span>
                <span className="ml-auto w-24 text-right">{t('dashboard.dayDetail.realizedRMultiple')}</span>
                <span className="w-24 text-right">{t('dashboard.dayDetail.netPnl')}</span>
                <span className="w-4" />
              </div>
              <div className="divide-y divide-border">
                {detail.trades.map((tr) => (
                  <button
                    key={tr.id}
                    onClick={() => goTrade(tr.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                  >
                    <span
                      className={cn(
                        'w-7 text-center text-[10px] px-1 py-0.5 rounded font-medium uppercase',
                        tr.direction === 'long' ? 'badge-profit' : 'badge-loss',
                      )}
                    >
                      {tr.direction === 'long' ? t('dashboard.dayDetail.dirLong') : t('dashboard.dayDetail.dirShort')}
                    </span>
                    <span className="w-16 text-sm font-mono font-medium truncate">{tr.symbol}</span>
                    <span className="w-12 text-xs text-muted-foreground">{tr.time}</span>
                    <span
                      className={cn(
                        'ml-auto w-24 text-right text-sm tabular',
                        tr.rMultiple == null
                          ? 'text-muted-foreground'
                          : tr.rMultiple >= 0
                            ? 'text-profit'
                            : 'text-loss',
                      )}
                    >
                      {tr.rMultiple == null
                        ? '—'
                        : `${tr.rMultiple >= 0 ? '' : '-'}${Math.abs(tr.rMultiple).toFixed(2)}R`}
                    </span>
                    <span
                      className={cn(
                        'w-24 text-right text-sm tabular font-medium',
                        tr.netPnl >= 0 ? 'text-profit' : 'text-loss',
                      )}
                    >
                      {formatCurrency(tr.netPnl, currency)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
                {detail.trades.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {t('dashboard.dayDetail.noTrades')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
