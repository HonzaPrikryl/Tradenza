'use client'

import { useEffect, useState } from 'react'
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Trophy, Sparkles, Gauge, Plane, PenLine, Loader2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { t } from '@/i18n'
import type { ProgressStats as Stats } from '@/lib/actions/progress'
import { DAY_PERF_MIN_SAMPLE, DAY_PERF_SOLID_SAMPLE } from '@/lib/progress-compute'
import { prettyDayMonth } from '@/lib/progress-format'
import { useChartColors } from '@/components/dashboard/widgets/shared'
// Aliased: `Tooltip` is already taken by recharts' chart tooltip in this file.
import UiTooltip from '@/components/ui/Tooltip'
import Collapse from '@/components/ui/Collapse'
import WidgetInfo from './WidgetInfo'
import ConsistencyList from './ConsistencyList'
import { StatCard, StreakCard } from './StatCards'
import SharedTrendTooltip from './TrendTooltip'
import WeekdayBars from './WeekdayBars'

// Trading discipline-trend tooltip — the shared TrendTooltip with a trading-specific
// third line (hard-rule break / no-trade / soft X-Y).
function TrendTooltip(props: { active?: boolean; payload?: { payload: Stats['trend'][number] }[] }) {
  return (
    <SharedTrendTooltip
      {...props}
      disciplineLabel={t('progress.stats.trendDiscipline')}
      missedLabel={t('progress.stats.trendMissed')}
      renderExtra={(d) =>
        d.hardViolations > 0 ? (
          <div className="mt-0.5 font-medium text-muted-foreground">
            {d.hardViolations === 1
              ? t('progress.hardBroken.one')
              : t('progress.hardBroken.other', { count: d.hardViolations })}
          </div>
        ) : d.cleanNoTrade ? (
          <div className="mt-0.5 text-muted-foreground">{t('progress.tip.noTrade')}</div>
        ) : (
          <div className="mt-0.5 text-muted-foreground">
            {d.completed}/{d.total} {t('progress.stats.trendHabits')}
          </div>
        )
      }
    />
  )
}

/**
 * "Leave them" has to STICK, or it isn't a choice — a prompt that returns on every reload
 * is the nag this pair of buttons exists to avoid. It's remembered against the exact run
 * of days it was answered for, so a NEW gap asks again: the user declined to excuse *those*
 * days, not to ever be offered again.
 *
 * localStorage rather than the database: it's a UI preference about a prompt, it must not
 * cost a write, and losing it is harmless. Read in an effect so the server render and the
 * first client render agree.
 */
function useDismissedStreakGap(blockers: string[]): [boolean | null, (v: boolean) => void] {
  const key = blockers.join(',')
  // The answer is UNKNOWN (null) until the client has read storage, and the caller renders
  // nothing while it is. Starting at `false` instead meant "not dismissed" was asserted on
  // the server and on the first client render, so a dismissed prompt painted once and then
  // vanished — a flash on every reload. Nothing can flash if nothing is claimed yet.
  //
  // The stored answer is kept WITH the key it answers. If the gap changes, the remembered
  // value belongs to a different run of days, so it reads as unknown again rather than
  // briefly applying a stale decision to the new one.
  const [state, setState] = useState<{ key: string; dismissed: boolean } | null>(null)

  useEffect(() => {
    try {
      setState({ key, dismissed: window.localStorage.getItem(DISMISS_KEY) === key })
    } catch {
      setState({ key, dismissed: false }) // private mode / storage disabled — just show it
    }
  }, [key])

  const dismiss = (v: boolean) => {
    setState({ key, dismissed: v }) // synchronous: no frame where the card is still up
    try {
      if (v) window.localStorage.setItem(DISMISS_KEY, key)
      else window.localStorage.removeItem(DISMISS_KEY)
    } catch {
      /* non-fatal: the choice simply won't survive a reload */
    }
  }

  return [state?.key === key ? state.dismissed : null, dismiss]
}

const DISMISS_KEY = 'tradenza:streak-gap-dismissed'

export default function ProgressStats({
  stats,
  currency,
  section = 'all',
  year,
  currentYear,
  yearStats,
  onExcuseStreakBlockers,
  onFillIn,
  excusing = false,
}: {
  stats: Stats
  /** Display currency for money figures — see the note in progress/page.tsx. */
  currency: string
  section?: 'all' | 'cards' | 'trend' | 'breakdown'
  /**
   * Excuse the days that broke the streak (see ProgressStats.streakBlockers). Offered
   * here because this is where the loss is noticed — nobody marks absence in advance.
   */
  onExcuseStreakBlockers?: () => void
  /**
   * Jump to the first day of the gap so the user can record what actually happened. The
   * parent owns it because only it knows where the day panel lives and how to reveal it.
   */
  onFillIn?: () => void
  excusing?: boolean
  /** Calendar year the year-scoped cards (best streak, clean days) reflect. */
  year?: number
  /** Today's calendar year — when `year` matches it, cards read "this year". */
  currentYear?: number
  /**
   * The two YEAR-SCOPED card values, taken from the heatmap's year data rather than
   * from `stats` — they follow whichever year the user selected. Required by the
   * `cards` section; the other sections don't read them.
   */
  yearStats?: { bestStreak: number; greenDays: number }
}) {
  // Year-scoped cards read "this year" for the live year and the bare number for a
  // past year the user has scrolled to on the heatmap.
  const yearSub =
    year == null || (currentYear != null && year === currentYear) ? t('progress.stats.thisYear') : String(year)
  const C = useChartColors()
  const [streakPromptDismissed, setStreakPromptDismissed] = useDismissedStreakGap(stats.streakBlockers)
  const showCards = section === 'all' || section === 'cards'
  const showTrend = section === 'all' || section === 'trend'
  const showBreakdown = section === 'all' || section === 'breakdown'

  const blockers = stats.streakBlockers
  const streakPromptOpen =
    showCards && blockers.length > 0 && streakPromptDismissed === false && !!onExcuseStreakBlockers

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      {showCards && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StreakCard streak={stats.currentStreak} info={t('progress.stats.info.currentStreak')} />
          <StatCard
            icon={<Trophy className="h-3.5 w-3.5 text-amber-400" />}
            label={t('progress.stats.bestStreak')}
            value={yearStats?.bestStreak ?? 0}
            sub={yearSub}
            info={t('progress.stats.info.bestStreak')}
          />
          <StatCard
            icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
            label={t('progress.stats.greenDays')}
            value={yearStats?.greenDays ?? 0}
            sub={yearSub}
            info={t('progress.stats.info.greenDays')}
          />
          <StatCard
            icon={<Gauge className="h-3.5 w-3.5 text-sky-400" />}
            label={t('progress.stats.discipline30')}
            value={`${Math.round(stats.avgDiscipline30 * 100)}%`}
            // The average is computed over RECORDED days only, so the sub-line carries
            // its denominator: a flawless 100% off three logged days out of twenty is a
            // coverage problem, and the card has to admit that on its face.
            sub={t('progress.stats.coverage', {
              logged: stats.loggedDays30,
              scheduled: stats.scheduledDays30,
            })}
            info={t('progress.stats.info.discipline30')}
          />
        </div>
      )}

      {/* Streak repair. The server only fills `streakBlockers` when excusing that run would
          actually stitch a real streak back together — there has to be a clean run on the
          far side of the gap (see runBehindGap). So this can't greet a new user who simply
          hasn't logged much yet: it appears when a streak was genuinely lost, next to the
          number it affects, and never otherwise. */}
      {/* Collapsed rather than switched on and off. This card appears and disappears in
          response to things the user just did — excusing a run, dismissing the prompt,
          back-filling a day — and every one of those snapped the whole page up or down by
          its height. The gap lives on the CHILD (`mt-4`) so it collapses with the card;
          Collapse cancels its own outer margin for exactly that reason.

          `=== false`, not `!dismissed`: `null` means "we haven't read the user's answer
          yet" and must render nothing, or a dismissed prompt flashes on every load. */}
      {showCards && (
        <Collapse open={streakPromptOpen}>
          {/* Guarded, because JSX children are BUILT on every parent render whether or not
              the collapse shows them — reading `blockers[0]` off an empty array threw while
              the element was merely being constructed. Collapse replays the last open subtree
              during the exit, so returning null here doesn't blank the closing card. */}
          {blockers.length === 0 ? null : (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
              {/* `streakBlockers` is newest-first, so the run reads [to … from]. A single day
                  gets its own phrasing — "(21 Jul – 21 Jul)" is not a range. */}
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t(`progress.stats.streakBlocked.${blockers.length === 1 ? 'one' : 'other'}`, {
                  days: blockers.length,
                  from: prettyDayMonth(blockers[blockers.length - 1]),
                  to: prettyDayMonth(blockers[0]),
                })}
              </p>
              {/* THREE paths, because there are three — and the card used to admit only one.
                  Back-filling has no deadline (any past day is editable), yet the prompt never
                  said so, which left "excuse it" looking like the only way out of a gap.

                  Order runs from most to least honest: record what actually happened, excuse
                  it if you genuinely weren't there, or accept the gap. Only "Fill in" is
                  emphasised, and deliberately so — it is the option that produces DATA, and it
                  is not the flattering one (an honest back-fill may well turn the day red).
                  The other two are weighted identically, because nothing here can verify
                  whether you were away and the app must not lean on an answer it can't
                  check. */}
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {onFillIn && (
                  <button
                    type="button"
                    onClick={onFillIn}
                    disabled={excusing}
                    className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    {t(
                      blockers.length === 1
                        ? 'progress.stats.streakBlockedFillOne'
                        : 'progress.stats.streakBlockedFill',
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onExcuseStreakBlockers}
                  disabled={excusing}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                >
                  {excusing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plane className="h-3.5 w-3.5" />}
                  {t(`progress.stats.streakBlockedAction.${blockers.length === 1 ? 'one' : 'other'}`)}
                </button>
                <button
                  type="button"
                  onClick={() => setStreakPromptDismissed(true)}
                  disabled={excusing}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  {t('progress.stats.streakBlockedKeep')}
                </button>
              </div>
            </div>
          )}
        </Collapse>
      )}

      {/* Trend */}
      {showTrend && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">{t('progress.stats.trendTitle')}</h3>
            <WidgetInfo text={t('progress.stats.info.trend')} />
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{t('progress.stats.trendSub')}</p>
          {stats.trend.length === 0 ? (
            // The series now contains only days something was SCHEDULED, so it can be empty
            // — every rule paused, a brand-new user, a stretch entirely marked off. An empty
            // recharts area is a blank box with axes, which reads as broken rather than as
            // "nothing to plot yet".
            <p className="py-10 text-center text-sm text-muted-foreground">{t('progress.stats.noData')}</p>
          ) : (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.trend} margin={{ top: 6, right: 8, bottom: 0, left: -4 }}>
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
                    animationDuration={600}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
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
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
                ).map(({ key, label, dot, b }) => {
                  // Three confidence tiers, because daily P&L is fat-tailed enough that a
                  // small sample IS its own outlier:
                  //   < MIN   → withhold the number entirely, show the day count only.
                  //   < SOLID → show it, but visibly marked as an early read.
                  //   ≥ SOLID → show it plainly.
                  const lowSample = b.days > 0 && b.days < DAY_PERF_MIN_SAMPLE
                  const indicative = b.days >= DAY_PERF_MIN_SAMPLE && b.days < DAY_PERF_SOLID_SAMPLE
                  return (
                    <div key={key} className="min-w-0 rounded-lg border border-border bg-background/40 p-2 sm:p-3">
                      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
                        <span className="min-w-0 truncate">{label}</span>
                      </div>
                      <div
                        className={cn(
                          'mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-base font-bold tabular sm:text-lg',
                          b.days === 0 || lowSample
                            ? 'text-muted-foreground'
                            : b.avgPnl >= 0
                              ? 'text-profit'
                              : 'text-loss',
                        )}
                      >
                        <span className={cn(indicative && 'decoration-dotted underline-offset-4 underline opacity-80')}>
                          {b.days === 0 || lowSample ? '—' : formatCurrency(b.avgPnl, currency)}
                        </span>
                        {indicative && (
                          // "indicative" means nothing on its own, so the explanation has
                          // to be reachable — `title` is invisible on touch and to the
                          // keyboard, which is most of the people who'd need it.
                          <UiTooltip label={t('progress.stats.perfIndicativeHint', { solid: DAY_PERF_SOLID_SAMPLE })}>
                            <span
                              tabIndex={0}
                              className="shrink-0 cursor-help rounded bg-muted px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus:outline-none"
                            >
                              {t('progress.stats.perfIndicative')}
                            </span>
                          </UiTooltip>
                        )}
                      </div>
                      {!lowSample && b.days > 0 && b.avgR !== null && (
                        <div
                          className={cn('text-[11px] font-medium tabular', b.avgR >= 0 ? 'text-profit' : 'text-loss')}
                        >
                          {t('progress.stats.perfAvgR', { r: `${b.avgR >= 0 ? '+' : ''}${b.avgR.toFixed(2)}` })}
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground">
                        {b.days === 0
                          ? t('progress.stats.perfNoBucket')
                          : lowSample
                            ? t('progress.stats.perfLowSample', { days: b.days, min: DAY_PERF_MIN_SAMPLE })
                            : t('progress.stats.perfDaysUp', { pct: Math.round(b.winRate * 100), days: b.days })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {/* Say out loud why the sample is thinner than the trade count, instead of
                quietly under-reporting. */}
            {stats.performance.unconfirmedDays > 0 && (
              <p className="mt-3 text-[11px] text-muted-foreground/80">
                {t('progress.stats.perfUnconfirmed', { days: stats.performance.unconfirmedDays })}
              </p>
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
                <ConsistencyList
                  items={stats.perRule.map((r) => ({
                    id: r.id,
                    name: r.name,
                    type: r.type,
                    rate: r.rate,
                    tracked: r.tracked,
                    streak: r.streak,
                  }))}
                  constraintTitle={t('progress.stats.perRuleHardTitle')}
                  constraintSub={t('progress.stats.perRuleHardSub')}
                  taskTitle={t('progress.stats.perRuleSoftTitle')}
                  taskSub={t('progress.stats.perRuleSoftSub')}
                  noDataLabel={t('progress.stats.perRuleNoTrackedDays')}
                />
              )}
            </div>

            <WeekdayBars
              weekday={stats.weekday}
              title={t('progress.stats.weekdayTitle')}
              sub={t('progress.stats.weekdaySub')}
              info={t('progress.stats.info.weekday')}
            />
          </div>
        </div>
      )}
    </div>
  )
}
