'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Flame, Trophy, Sparkles, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t, tList } from '@/i18n'
import type { ProgressStats as Stats } from '@/lib/actions/progress'
import { useChartColors, makeTooltipStyle } from '@/components/dashboard/widgets/shared'

const WD = tList('datepicker.weekdaysMin')
const WD_FULL = tList('datepicker.weekdays')

interface WeekdayTip {
  label: string
  pct: number
  x: number
  y: number
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: string
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl border bg-card p-4',
        accent ? 'border-primary/30' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tabular text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

export default function ProgressStats({
  stats,
  section = 'all',
}: {
  stats: Stats
  section?: 'all' | 'cards' | 'trend' | 'breakdown'
}) {
  const C = useChartColors()
  const showCards = section === 'all' || section === 'cards'
  const showTrend = section === 'all' || section === 'trend'
  const showBreakdown = section === 'all' || section === 'breakdown'
  const [wdTip, setWdTip] = useState<WeekdayTip | null>(null)

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      {showCards && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={<Flame className="h-3.5 w-3.5 text-orange-400" />}
            label={t('progress.stats.currentStreak')}
            value={stats.currentStreak}
            sub={`${stats.currentStreak === 1 ? t('progress.stats.day') : t('progress.stats.days')}`}
            accent={stats.currentStreak > 0}
          />
          <StatCard
            icon={<Trophy className="h-3.5 w-3.5 text-amber-400" />}
            label={t('progress.stats.bestStreak')}
            value={stats.bestStreak}
            sub={t('progress.stats.days')}
          />
          <StatCard
            icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
            label={t('progress.stats.perfectDays')}
            value={stats.perfectDaysTotal}
          />
          <StatCard
            icon={<Gauge className="h-3.5 w-3.5 text-sky-400" />}
            label={t('progress.stats.discipline30')}
            value={`${Math.round(stats.avgDiscipline30 * 100)}%`}
            sub={`${stats.loggedDays30} ${t('progress.stats.days')}`}
          />
        </div>
      )}

      {/* Trend */}
      {showTrend && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">{t('progress.stats.trendTitle')}</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{t('progress.stats.trendSub')}</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.trend} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="discGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.primary} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: C.axis }}
                  tickFormatter={(v) => v.slice(5)}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fontSize: 10, fill: C.axis }}
                  tickFormatter={(v) => `${Math.round(v * 100)}%`}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  contentStyle={makeTooltipStyle(C)}
                  formatter={
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ((v: number, _n: unknown, item: any) => {
                      const d = item?.payload as Stats['trend'][number]
                      return [`${Math.round(v * 100)}% · ${d.completed}/${d.total}`, 'Discipline']
                    }) as never
                  }
                  labelFormatter={(l) => l}
                />
                <Area
                  type="monotone"
                  dataKey="ratio"
                  stroke={C.primary}
                  strokeWidth={2}
                  fill="url(#discGrad)"
                  dot={false}
                  animationDuration={600}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {showBreakdown && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Per-rule consistency */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">{t('progress.stats.perRuleTitle')}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{t('progress.stats.perRuleSub')}</p>
            {stats.perRule.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('progress.stats.noData')}</p>
            ) : (
              <div className="space-y-2.5">
                {stats.perRule.map((r) => (
                  <div key={r.id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate text-foreground/90">{r.name}</span>
                      <span className="shrink-0 tabular font-semibold text-muted-foreground">
                        {Math.round(r.rate * 100)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${Math.round(r.rate * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Weekday */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">{t('progress.stats.weekdayTitle')}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{t('progress.stats.weekdaySub')}</p>
            <div className="flex h-60 flex-col">
              <div className="flex flex-1 items-end gap-2">
                {stats.weekday.map((w) => {
                  const pct = Math.round(w.ratio * 100)
                  return (
                    <div
                      key={w.dow}
                      className="flex h-full flex-1 cursor-default flex-col justify-end"
                      onMouseMove={(e) => setWdTip({ label: WD_FULL[w.dow], pct, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setWdTip(null)}
                    >
                      <div
                        className="w-full rounded-t-md bg-primary transition-all duration-500"
                        style={{
                          height: `${w.ratio > 0 ? Math.max(6, Math.round(w.ratio * 100)) : 2}%`,
                          opacity: 0.4 + w.ratio * 0.6,
                        }}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="mt-1.5 flex gap-2">
                {stats.weekday.map((w) => (
                  <span key={w.dow} className="flex-1 text-center text-[10px] text-muted-foreground">
                    {WD[w.dow]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {wdTip &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[70] -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-2xl"
            style={{ left: wdTip.x, top: wdTip.y - 8 }}
          >
            <div className="font-medium text-foreground">{wdTip.label}</div>
            <div className="mt-0.5 text-muted-foreground">{t('progress.stats.weekdayTip', { pct: wdTip.pct })}</div>
          </div>,
          document.body,
        )}
    </div>
  )
}
