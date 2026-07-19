'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Flame, Trophy, Sparkles, Gauge } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { t, tList } from '@/i18n'
import type { ProgressStats as Stats } from '@/lib/actions/progress'
import { useChartColors } from '@/components/dashboard/widgets/shared'
import WidgetInfo from './WidgetInfo'

const WD = tList('datepicker.weekdaysMin')
const WD_FULL = tList('datepicker.weekdays')

interface WeekdayTip {
  label: string
  pct: number
  /** No in-scope samples fed this weekday's average. */
  noData: boolean
  /** At least one live rule runs on this weekday (drives no-data wording). */
  scheduled: boolean
  x: number
  y: number
}

// Custom discipline-trend tooltip: the % is coloured by the day's status and a
// hard-rule break is called out on its own line under the discipline figure.
function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as Stats['trend'][number]
  // Day with no rule scheduled (day off / before any rule existed): the line just
  // bridges it, so label it plainly rather than as a discipline reading.
  if (!d.scheduled) {
    return (
      <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-2xl">
        <div className="font-medium text-foreground">{d.date}</div>
        <div className="mt-0.5 text-muted-foreground">{t('progress.stats.trendDayOff')}</div>
      </div>
    )
  }
  // Scheduled but never logged: a genuine dip to 0, called out as a missed record
  // rather than a silent "No record".
  if (d.status === 'none') {
    return (
      <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-2xl">
        <div className="font-medium text-foreground">{d.date}</div>
        <div className="mt-0.5 text-muted-foreground">{t('progress.stats.trendMissed')}</div>
      </div>
    )
  }
  const color = d.status === 'green' ? 'text-primary' : d.status === 'yellow' ? 'text-amber-500' : 'text-loss'
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-2xl">
      <div className="font-medium text-foreground">{d.date}</div>
      <div className={cn('mt-0.5 font-semibold', color)}>
        {t('progress.stats.trendDiscipline')} {Math.round((d.ratio ?? 0) * 100)}%
      </div>
      {d.hardViolations > 0 ? (
        <div className="mt-0.5 font-medium text-muted-foreground">
          {d.hardViolations === 1
            ? t('progress.hardBroken.one')
            : t('progress.hardBroken.other', { count: d.hardViolations })}
        </div>
      ) : d.cleanNoTrade ? (
        <div className="mt-0.5 text-muted-foreground">{t('progress.calendar.tipNoTrade')}</div>
      ) : (
        <div className="mt-0.5 text-muted-foreground">
          {d.completed}/{d.total} {t('progress.stats.trendHabits')}
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
  info,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: string
  accent?: boolean
  info?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl border bg-card p-4',
        accent ? 'border-primary/30' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        {info && <WidgetInfo text={info} />}
      </div>
      <div className="text-2xl font-bold tabular text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

// Ember-glow intensity per streak tier: the longer the run, the more flames and the
// brighter the pulse. Purely decorative — driven off the streak count.
const STREAK_GLOW = [
  { min: 0, max: 0 },
  { min: 0.12, max: 0.24 },
  { min: 0.2, max: 0.4 },
  { min: 0.32, max: 0.56 },
  { min: 0.46, max: 0.72 },
]

function streakTier(streak: number): number {
  if (streak <= 0) return 0
  if (streak >= 100) return 4
  if (streak >= 30) return 3
  if (streak >= 7) return 2
  return 1
}

// The Clean-streak card, gamified: flickering flames and a pulsing ember glow that
// grow with the streak. The flame count itself marks the milestones (a 3rd flame at
// 30 days, etc.), so no separate badge is needed next to the count.
function StreakCard({ streak, info }: { streak: number; info: string }) {
  const tier = streakTier(streak)
  const flames = Math.min(tier, 3)
  const glow = STREAK_GLOW[tier]
  const glowStyle = {
    background: 'radial-gradient(120% 100% at 50% 100%, rgba(251,146,60,0.9), transparent 70%)',
    '--streak-glow-min': `${glow.min}`,
    '--streak-glow-max': `${glow.max}`,
  } as React.CSSProperties

  return (
    <div
      className={cn(
        'relative flex flex-col gap-1 overflow-hidden rounded-xl border bg-card p-4',
        tier > 0 ? 'border-orange-400/30' : 'border-border',
      )}
    >
      {tier > 0 && (
        <div className="streak-glow pointer-events-none absolute inset-x-0 bottom-0 h-2/3" style={glowStyle} />
      )}
      {flames > 0 && (
        <div className="pointer-events-none absolute bottom-1.5 right-2 flex items-end gap-0.5" aria-hidden>
          {Array.from({ length: flames }).map((_, i) => (
            <Flame
              key={i}
              className={cn('streak-flame text-orange-500/70', tier >= 4 ? 'h-5 w-5' : 'h-4 w-4')}
              style={{ animationDelay: `${i * 0.25}s` }}
              strokeWidth={2}
            />
          ))}
        </div>
      )}
      <div className="relative flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <Flame className="h-3.5 w-3.5 text-orange-400" />
          <span className="truncate">{t('progress.stats.currentStreak')}</span>
        </span>
        <WidgetInfo text={info} />
      </div>
      <div className="relative text-2xl font-bold tabular text-foreground">{streak}</div>
      <div className="relative text-[11px] text-muted-foreground">
        {streak === 1 ? t('progress.stats.day') : t('progress.stats.days')}
      </div>
    </div>
  )
}

// One rule's consistency bar. The fill is always the "performance" colour (green):
// a longer bar means better compliance for BOTH tiers — a respected hard rule and a
// completed soft habit both read as "good". The tier is conveyed by the badge, not
// the bar colour, so a well-respected hard rule no longer paints a misleading red
// bar. Rules with no tracked days show "no data" instead of a phantom 0%.
function PerRuleRow({ rule }: { rule: Stats['perRule'][number] }) {
  const pct = Math.round(rule.rate * 100)
  const noData = rule.tracked === 0
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
              rule.type === 'hard' ? 'bg-loss/15 text-loss' : 'bg-primary/15 text-primary',
            )}
          >
            {t(`progress.rules.type.${rule.type}`)}
          </span>
          <span className="min-w-0 truncate text-foreground/90">{rule.name}</span>
        </span>
        <span
          className={cn(
            'shrink-0 tabular font-semibold',
            noData ? 'text-muted-foreground/60' : 'text-muted-foreground',
          )}
        >
          {noData ? t('progress.stats.perRuleNoTrackedDays') : `${pct}%`}
        </span>
      </div>
      {!noData && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary opacity-60 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

// A titled block of consistency rows (Hard rules / Soft habits) with its own
// scale label ("Respect rate" vs "Completion rate") so the inverted semantics of
// the two tiers are spelled out instead of silently mixed in one list.
function PerRuleGroup({
  title,
  sub,
  accent,
  children,
}: {
  title: string
  sub: string
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h4
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wide',
            accent ? 'text-loss/80' : 'text-muted-foreground',
          )}
        >
          {title}
        </h4>
        <span className="shrink-0 text-[10px] text-muted-foreground/70">{sub}</span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

// Identical expand/collapse control shared by both consistency columns.
function ShowMoreButton({ expanded, hidden, onToggle }: { expanded: boolean; hidden: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-1 w-full rounded-md border border-dashed border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
    >
      {expanded ? t('progress.stats.showLess') : t('progress.stats.showMore', { count: hidden })}
    </button>
  )
}

export default function ProgressStats({
  stats,
  section = 'all',
  year,
}: {
  stats: Stats
  section?: 'all' | 'cards' | 'trend' | 'breakdown'
  /** Calendar year the year-scoped cards (best streak, clean days) reflect. */
  year?: number
}) {
  const C = useChartColors()
  const showCards = section === 'all' || section === 'cards'
  const showTrend = section === 'all' || section === 'trend'
  const showBreakdown = section === 'all' || section === 'breakdown'
  const [wdTip, setWdTip] = useState<WeekdayTip | null>(null)
  // Both columns are capped to the same length and each gets its own show more/less
  // toggle, so neither column can grow the widget on its own.
  const [showAllHard, setShowAllHard] = useState(false)
  const [showAllSoft, setShowAllSoft] = useState(false)
  const RULE_LIMIT = 4
  const hardRules = stats.perRule.filter((r) => r.type === 'hard')
  const softRules = stats.perRule.filter((r) => r.type === 'soft')
  const hardShown = showAllHard ? hardRules : hardRules.slice(0, RULE_LIMIT)
  const hardHidden = hardRules.length - hardShown.length
  const softShown = showAllSoft ? softRules : softRules.slice(0, RULE_LIMIT)
  const softHidden = softRules.length - softShown.length
  // Only split the consistency card into two columns when BOTH tiers exist; with a
  // single tier the one group spans the full width instead of leaving a dead column.
  const bothTiers = hardRules.length > 0 && softRules.length > 0

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      {showCards && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StreakCard streak={stats.currentStreak} info={t('progress.stats.info.currentStreak')} />
          <StatCard
            icon={<Trophy className="h-3.5 w-3.5 text-amber-400" />}
            label={t('progress.stats.bestStreak')}
            value={stats.bestStreak}
            sub={year != null ? String(year) : t('progress.stats.thisYear')}
            info={t('progress.stats.info.bestStreak')}
          />
          <StatCard
            icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
            label={t('progress.stats.greenDays')}
            value={stats.greenDaysTotal}
            sub={year != null ? String(year) : t('progress.stats.thisYear')}
            info={t('progress.stats.info.greenDays')}
          />
          <StatCard
            icon={<Gauge className="h-3.5 w-3.5 text-sky-400" />}
            label={t('progress.stats.discipline30')}
            value={`${Math.round(stats.avgDiscipline30 * 100)}%`}
            sub={`${stats.loggedDays30} ${t('progress.stats.days')}`}
            info={t('progress.stats.info.discipline30')}
          />
        </div>
      )}

      {/* Trend */}
      {showTrend && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">{t('progress.stats.trendTitle')}</h3>
            <WidgetInfo text={t('progress.stats.info.trend')} />
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
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: C.grid }} />
                <Area
                  type="monotone"
                  dataKey="ratio"
                  stroke={C.primary}
                  strokeWidth={2}
                  fill="url(#discGrad)"
                  dot={false}
                  connectNulls
                  animationDuration={600}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {showBreakdown && (
        <div className="space-y-4">
          {/* Discipline → performance: does following the plan pay off? */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">{t('progress.stats.perfTitle')}</h3>
              <WidgetInfo text={t('progress.stats.info.perf')} />
            </div>
            <p className="mb-3 text-xs text-muted-foreground">{t('progress.stats.perfSub')}</p>
            {stats.performance.green.days + stats.performance.yellow.days + stats.performance.red.days === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('progress.stats.perfNoData')}</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    {
                      key: 'green',
                      label: t('progress.stats.perfGreen'),
                      dot: 'bg-primary',
                      b: stats.performance.green,
                    },
                    {
                      key: 'yellow',
                      label: t('progress.stats.perfYellow'),
                      dot: 'bg-amber-500',
                      b: stats.performance.yellow,
                    },
                    { key: 'red', label: t('progress.stats.perfRed'), dot: 'bg-loss', b: stats.performance.red },
                  ] as const
                ).map(({ key, label, dot, b }) => (
                  <div key={key} className="rounded-lg border border-border bg-background/40 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
                      <span className="truncate">{label}</span>
                    </div>
                    <div
                      className={cn(
                        'mt-1 text-lg font-bold tabular',
                        b.days === 0 ? 'text-muted-foreground' : b.avgPnl >= 0 ? 'text-profit' : 'text-loss',
                      )}
                    >
                      {b.days === 0 ? '—' : formatCurrency(b.avgPnl)}
                    </div>
                    {b.days > 0 && b.avgR !== null && (
                      <div className={cn('text-[11px] font-medium tabular', b.avgR >= 0 ? 'text-profit' : 'text-loss')}>
                        {t('progress.stats.perfAvgR', { r: `${b.avgR >= 0 ? '+' : ''}${b.avgR.toFixed(2)}` })}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      {b.days === 0
                        ? t('progress.stats.perfNoBucket')
                        : t('progress.stats.perfDaysUp', { pct: Math.round(b.winRate * 100), days: b.days })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Per-rule consistency */}
            <div className="flex flex-col rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{t('progress.stats.perRuleTitle')}</h3>
                <WidgetInfo text={t('progress.stats.info.perRule')} />
              </div>
              <p className="mb-3 text-xs text-muted-foreground">{t('progress.stats.perRuleSub')}</p>
              {stats.perRule.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('progress.stats.noData')}</p>
              ) : (
                // Hard rules and soft habits sit side by side when both exist; a lone
                // tier takes the full width. Stacks on narrow screens either way.
                <div className={cn('grid grid-cols-1 gap-x-5 gap-y-4', bothTiers && 'sm:grid-cols-2')}>
                  {hardRules.length > 0 && (
                    <PerRuleGroup
                      title={t('progress.stats.perRuleHardTitle')}
                      sub={t('progress.stats.perRuleHardSub')}
                      accent
                    >
                      {hardShown.map((r) => (
                        <PerRuleRow key={r.id} rule={r} />
                      ))}
                      {(hardHidden > 0 || showAllHard) && (
                        <ShowMoreButton
                          expanded={showAllHard}
                          hidden={hardHidden}
                          onToggle={() => setShowAllHard((v) => !v)}
                        />
                      )}
                    </PerRuleGroup>
                  )}
                  {softRules.length > 0 && (
                    <PerRuleGroup title={t('progress.stats.perRuleSoftTitle')} sub={t('progress.stats.perRuleSoftSub')}>
                      {softShown.map((r) => (
                        <PerRuleRow key={r.id} rule={r} />
                      ))}
                      {(softHidden > 0 || showAllSoft) && (
                        <ShowMoreButton
                          expanded={showAllSoft}
                          hidden={softHidden}
                          onToggle={() => setShowAllSoft((v) => !v)}
                        />
                      )}
                    </PerRuleGroup>
                  )}
                </div>
              )}
            </div>

            {/* Weekday */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{t('progress.stats.weekdayTitle')}</h3>
                <WidgetInfo text={t('progress.stats.info.weekday')} className="translate-x-[-100%]" />
              </div>
              <p className="mb-3 text-xs text-muted-foreground">{t('progress.stats.weekdaySub')}</p>
              <div className="flex h-60 flex-col">
                <div className="flex flex-1 items-end gap-2">
                  {stats.weekday.map((w) => {
                    const pct = Math.round(w.ratio * 100)
                    const noData = w.samples === 0
                    // Empty state wording: a weekday no rule runs on is "not tracked";
                    // a scheduled one with no logged days yet is "no data yet".
                    const aria = noData
                      ? `${WD_FULL[w.dow]}: ${w.scheduled ? t('progress.stats.weekdayNoData') : t('progress.stats.weekdayNotTracked')}`
                      : `${WD_FULL[w.dow]}: ${t('progress.stats.weekdayTip', { pct })}`
                    // Anchor the tooltip to the bar's top-centre — works for both a
                    // hover (mouse) and a keyboard/touch focus, where there are no
                    // cursor coords to read.
                    const tip = (x: number, y: number): WeekdayTip => ({
                      label: WD_FULL[w.dow],
                      pct,
                      noData,
                      scheduled: w.scheduled,
                      x,
                      y,
                    })
                    const showTip = (el: HTMLElement) => {
                      const r = el.getBoundingClientRect()
                      setWdTip(tip(r.left + r.width / 2, r.top))
                    }
                    return (
                      <div
                        key={w.dow}
                        role="img"
                        tabIndex={0}
                        aria-label={aria}
                        className="flex h-full flex-1 cursor-default flex-col justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        onMouseMove={(e) => setWdTip(tip(e.clientX, e.clientY))}
                        onMouseLeave={() => setWdTip(null)}
                        onFocus={(e) => showTip(e.currentTarget)}
                        onBlur={() => setWdTip(null)}
                      >
                        {noData ? (
                          // No samples: a short dashed stub reads "empty", clearly
                          // distinct from a real low bar sitting near the baseline.
                          <div className="h-2 w-full rounded-sm border border-dashed border-muted-foreground/30" />
                        ) : (
                          <div
                            className="w-full rounded-t-md bg-primary transition-all duration-500"
                            style={{ height: `${Math.max(6, Math.round(w.ratio * 100))}%`, opacity: 0.5 }}
                          />
                        )}
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
            <div className="mt-0.5 text-muted-foreground">
              {wdTip.noData
                ? wdTip.scheduled
                  ? t('progress.stats.weekdayNoData')
                  : t('progress.stats.weekdayNotTracked')
                : t('progress.stats.weekdayTip', { pct: wdTip.pct })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
