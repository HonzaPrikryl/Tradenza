'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Sparkles, Loader2, Flame, Trophy, Gauge } from 'lucide-react'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { t, tList } from '@/i18n'
import { aggregateHabitDayStatus, avoidanceState, type AwayScope, type DayStatus } from '@/lib/progress-compute'
import { heatCellLabel, prettyDate, type HeatDaySummary } from '@/lib/progress-format'
import {
  getHabitsReview,
  getHabitDay,
  toggleRuleCompletion,
  markAllHabitsDone,
  setDayAway,
  createStarterHabits,
  type HabitYearData,
  type HabitYearCell,
  type HabitDayData,
  type HabitsData,
  type ProgressRule,
} from '@/lib/actions/progress'
import YearHeatmap from './YearHeatmap'
import HeatCellTooltip from './HeatCellTooltip'
import HeatLegend from './HeatLegend'
import WidgetInfo from './WidgetInfo'
import { StatCard, StreakCard } from './StatCards'
import { HabitsLayoutSkeleton } from './DisciplineSkeletons'
import HabitDayPanel from './HabitDayPanel'
import HabitPerformance from './HabitPerformance'
import HabitStatsView from './HabitStatsView'
import RuleDialog from './RuleDialog'
import AwayRangeDialog from './AwayRangeDialog'

// A habit day in the shape the shared tooltip describes: building habits are the tasks,
// avoidance habits the constraints.
const summarise = (c: HabitYearCell | undefined): HeatDaySummary | undefined =>
  c && {
    status: c.status,
    away: c.away,
    taskTotal: c.scheduled,
    taskDone: c.done,
    constraintTotal: c.avoidTotal,
    constraintBreached: c.avoidTotal - c.avoidKept,
    tallyPath: 'progress.habits.year.tally',
  }

// Recompute a day's aggregate status + tallies from its items — the client mirror of the
// server's getHabitDay, so an optimistic toggle recolours the day instantly. Task
// (building) and constraint (avoidance) tallies stay separate, exactly as on the server:
// a clean avoidance habit is never folded into `done`.
//
// It must agree with the server about whether the day is settled, or the cell flashes a
// colour and snaps back on the refetch. Only TODAY is unsettled now, so `isToday` carries
// that on its own — only today is unsettled, so there is no second flag to keep in sync.
function recomputeDay(
  items: HabitDayData['items'],
  isToday: boolean,
): { status: DayStatus; done: number; scheduled: number; avoidKept: number } {
  const building = items.filter((i) => i.type === 'soft')
  const buildingDone = building.filter((i) => i.completed).length
  const avoid = items.filter((i) => i.type === 'hard').map((i) => avoidanceState(!i.completed, i.prevSlip ?? false))
  const { status } = aggregateHabitDayStatus(building.length, buildingDone, avoid, isToday)
  return {
    status: items.length === 0 ? 'none' : status,
    done: buildingDone,
    scheduled: building.length,
    avoidKept: avoid.filter((s) => s === 'clean').length,
  }
}

// Habits tab orchestrator — mirrors the trading overview: stat cards, a selectable
// year heatmap, a day panel for back-filling any day, the habit→performance widget,
// and habit management. Data is fetched lazily (the tab only mounts when opened).
export default function HabitsTab({
  rules,
  years,
  initialYear,
  today,
  currency,
  awayVersion = 0,
  onAwayChanged,
}: {
  rules: ProgressRule[]
  years: number[]
  initialYear: number
  today: string
  /** Display currency for money figures — see the note in progress/page.tsx. */
  currency: string
  /**
   * Bumped when the OTHER tab writes the shared away flag. This tab stays mounted while
   * hidden and otherwise only refetches after its own mutations, so without it a day
   * excused from Trading stayed an ordinary blank on the habit heatmap.
   */
  awayVersion?: number
  /** Tell the parent this tab wrote the flag, so the trading side redraws too. */
  onAwayChanged?: () => void
}) {
  const [year, setYear] = useState(initialYear)
  const [selectedDate, setSelectedDate] = useState(today)
  const [yearData, setYearData] = useState<HabitYearData | null>(null)
  const [dayData, setDayData] = useState<HabitDayData | null>(null)
  const [statsData, setStatsData] = useState<HabitsData | null>(null)
  const [failed, setFailed] = useState(false)
  const [version, setVersion] = useState(0) // bumps to refresh the correlation widget
  const [yearPending, startYear] = useTransition()
  const [dayPending, startDay] = useTransition()
  const [busy, startToggle] = useTransition()
  const [starterPending, startStarter] = useTransition()
  const [showNew, setShowNew] = useState(false)
  const [showAwayRange, setShowAwayRange] = useState(false)

  const hasHabits = rules.some((r) => r.category === 'habit')
  // Year-scoped cards read "this year" for the live year, the bare number for a past one.
  const currentYear = Number(today.slice(0, 4))
  const yearSub = year === currentYear ? t('progress.stats.thisYear') : String(year)

  // Heatmap year cells + rolling stats come from ONE action (getHabitsReview), so a
  // year change or any mutation re-fetches the shared habit data once, not twice.
  useEffect(() => {
    let alive = true
    startYear(async () => {
      try {
        const { year: y, stats } = await getHabitsReview(year)
        if (alive) {
          setYearData(y)
          setStatsData(stats)
          setFailed(false)
        }
      } catch {
        if (!alive) return
        setFailed(true)
        // Once there's data on screen the `failed` card never renders, so a refresh that
        // dies after the first load used to leave stale numbers with nothing to say so.
        // The toast is the only signal in that case.
        if (yearData) toast.error(t('progress.stats.staleWarning'))
      }
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, version, awayVersion])

  // Selected-day panel data — re-fetched on selection change or any mutation.
  useEffect(() => {
    let alive = true
    startDay(async () => {
      try {
        const d = await getHabitDay(selectedDate)
        if (alive) setDayData(d)
      } catch {
        // Surface as an error rather than hang the first-load skeleton forever.
        if (alive && !dayData) setFailed(true)
      }
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, version, awayVersion])

  const cells = useMemo(
    () => new Map<string, HabitYearCell>((yearData?.days ?? []).map((c) => [c.date, c])),
    [yearData],
  )

  const bump = () => setVersion((v) => v + 1)

  // The habit→P&L correlation scans a year of trades, and a toggle can only ever move ONE
  // day between buckets — so it does not need to re-run on every tick. It trails the
  // version behind a debounce: ticking six habits refreshes it once, when the user stops.
  const [perfKey, setPerfKey] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => setPerfKey(version), 800)
    return () => clearTimeout(id)
  }, [version])

  // Habit CRUD now lives in the Manage tab, not here — so when a habit is added,
  // edited, reordered or deleted there, the mutation's revalidate re-renders this
  // component with a fresh `rules` prop. Refetch the dashboards off that signature so
  // the heatmap, cards and day panel reflect the change without the user reopening the
  // tab. Skips the first run (initial mount already fetches via the effects above).
  const habitSig = JSON.stringify(
    rules
      .filter((r) => r.category === 'habit')
      .map((r) => [r.id, r.name, r.active, r.description, r.type, r.sortOrder, r.activeDays, r.scheduleSince]),
  )
  const firstHabitSync = useRef(true)
  useEffect(() => {
    if (firstHabitSync.current) {
      firstHabitSync.current = false
      return
    }
    bump()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitSig])

  const toggleHabit = (habitId: string, next: boolean) => {
    // Optimistic day-panel update. `next` is the good state (building: done; avoidance:
    // respected/no-slip) — exactly RuleRow's `completed`.
    setDayData((d) => {
      if (!d) return d
      const items = d.items.map((i) => (i.id === habitId ? { ...i, completed: next } : i))
      return { ...d, items, ...recomputeDay(items, d.isToday) }
    })
    startToggle(async () => {
      try {
        if (handleRateLimit(await toggleRuleCompletion(habitId, selectedDate, next))) {
          bump()
          return
        }
        bump() // re-fetch day + year (+ correlation) from source of truth
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.habits.toast.updated'))
        bump()
      }
    })
  }

  const markAll = () => {
    // Only building (soft) habits get marked done; avoidance habits are left as-is.
    setDayData((d) => {
      if (!d) return d
      const items = d.items.map((i) => (i.type === 'soft' ? { ...i, completed: true } : i))
      return { ...d, items, ...recomputeDay(items, d.isToday) }
    })
    startToggle(async () => {
      try {
        if (handleRateLimit(await markAllHabitsDone(selectedDate))) {
          bump()
          return
        }
        bump()
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.habits.toast.updated'))
        bump()
      }
    })
  }

  // "Away" is a fact about the calendar day, not about one domain, so this writes the
  // same flag the trading panel does — the trading heatmap and stats pick it up on their
  // own next refresh (both read it from daily_checkins).
  const toggleAway = () => {
    if (!dayData) return
    // Toggles the RAW flag; `away` (post self-negation) follows from the refetch.
    const next = !dayData.awayFlag
    setDayData((d) => (d ? { ...d, awayFlag: next, away: next, status: next ? 'none' : d.status } : d))
    startToggle(async () => {
      try {
        if (handleRateLimit(await setDayAway(selectedDate, next, dayData.awayScope))) {
          bump()
          return
        }
        bump()
        onAwayChanged?.()
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.habits.toast.updated'))
        bump()
      }
    })
  }

  // Narrow or widen an existing excuse — the flag stays on, only the scope moves.
  const setAwayScope = (scope: AwayScope) => {
    setDayData((d) => (d ? { ...d, awayScope: scope } : d))
    startToggle(async () => {
      try {
        if (handleRateLimit(await setDayAway(selectedDate, true, scope))) {
          bump()
          return
        }
        bump()
        onAwayChanged?.()
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.habits.toast.updated'))
        bump()
      }
    })
  }

  const addStarter = () =>
    startStarter(async () => {
      try {
        if (handleRateLimit(await createStarterHabits())) return
        toast.success(t('progress.habits.starterAdded'))
        bump()
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.habits.toast.created'))
      }
    })

  // Empty state — no habits at all yet.
  if (!hasHabits) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Flame className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-base font-semibold">{t('progress.habits.emptyTitle')}</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t('progress.habits.emptyExplain')}
        </p>

        <div className="mt-4 w-full max-w-md space-y-2 text-left">
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-background/40 px-3.5 py-2.5">
            <span className="mt-0.5 shrink-0 rounded bg-loss/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-loss">
              {t('progress.mode.name.avoidance')}
            </span>
            <span className="text-pretty text-sm leading-relaxed text-muted-foreground">
              {t('progress.habits.emptyExplain2')}
            </span>
          </div>
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-background/40 px-3.5 py-2.5">
            <span className="mt-0.5 shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {t('progress.mode.name.building')}
            </span>
            <span className="text-pretty text-sm leading-relaxed text-muted-foreground">
              {t('progress.habits.emptyExplain3')}
            </span>
          </div>
        </div>

        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t('progress.habits.emptyExplain4')}
        </p>
        <div className="mt-6 flex flex-col items-center gap-2.5 sm:flex-row">
          <button
            onClick={addStarter}
            disabled={starterPending}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {starterPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t('progress.habits.addStarter')}
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="rounded-md border border-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t('progress.habits.addOwn')}
          </button>
        </div>
        <p className="mt-2.5 text-xs text-muted-foreground">
          {t('progress.habits.addStarterHint', { count: tList('progress.habits.starter').length })}
        </p>
        {showNew && <RuleDialog mode="new" category="habit" onClose={() => setShowNew(false)} onSaved={bump} />}
      </div>
    )
  }

  // Until every piece of the first load has arrived, show the layout skeleton — just
  // like the overview streams its skeleton via Suspense. On later re-fetches the
  // previous data stays on screen (never reset to null), so this shows only once. If
  // the first load errored with nothing to show, a clean error card instead.
  if (!yearData || !statsData || !dayData) {
    return failed ? (
      <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        {t('progress.habits.year.error')}
      </div>
    ) : (
      <HabitsLayoutSkeleton />
    )
  }

  return (
    <div className="space-y-5">
      {/* Stat cards — identical to the trading overview, habit values. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StreakCard
          streak={statsData.currentStreak}
          info={t('progress.habits.cards.streakInfo')}
          label={t('progress.habits.cards.streak')}
        />
        <StatCard
          icon={<Trophy className="h-3.5 w-3.5 text-amber-400" />}
          label={t('progress.habits.cards.best')}
          value={String(yearData.bestStreak)}
          sub={yearSub}
          info={t('progress.habits.cards.bestInfo')}
        />
        <StatCard
          icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
          label={t('progress.habits.cards.green')}
          value={String(yearData.greenDays)}
          sub={yearSub}
          info={t('progress.habits.cards.greenInfo')}
        />
        <StatCard
          icon={<Gauge className="h-3.5 w-3.5 text-sky-400" />}
          label={t('progress.habits.cards.completion')}
          value={`${Math.round(statsData.avg30 * 100)}%`}
          // Same as the trading card: the average covers recorded days only, so show how
          // many of the scheduled days that actually is.
          sub={t('progress.stats.coverage', {
            logged: statsData.loggedDays30,
            scheduled: statsData.scheduledDays30,
          })}
          info={t('progress.habits.cards.completionInfo')}
        />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <YearHeatmap<HabitYearCell>
            year={year}
            years={years}
            cells={cells}
            today={today}
            selectedDate={selectedDate}
            pending={yearPending}
            onYearChange={setYear}
            onSelect={setSelectedDate}
            headerCenter={<span className="text-sm text-muted-foreground">{prettyDate(selectedDate)}</span>}
            headerRight={
              <>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                  {yearData.greenDays} {t('progress.calendar.green')}
                </span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                  {yearData.loggedDays} {t('progress.calendar.logged')}
                </span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                  {Math.round(yearData.avgRatio * 100)}% {t('progress.calendar.avg')}
                </span>
                <WidgetInfo text={t('progress.habits.year.info')} />
              </>
            }
            legend={<HeatLegend />}
            cellLabel={(date, cell) => heatCellLabel(date, summarise(cell))}
            renderTooltip={(date, cell) => <HeatCellTooltip date={date} day={summarise(cell)} />}
          />
          <HabitStatsView data={statsData} section="trend" />
        </div>

        <div className="relative min-w-0">
          <div className="xl:absolute xl:inset-0">
            <HabitDayPanel
              data={dayData}
              loading={dayPending}
              busy={busy}
              onToggle={toggleHabit}
              onMarkAll={markAll}
              onToggleAway={toggleAway}
              onSetAwayScope={setAwayScope}
              onExcuseRange={() => setShowAwayRange(true)}
            />
          </div>
        </div>
      </div>

      {/* Excusing a range moves this tab's heatmap and cards AND the trading side, since
          the flag is shared — so it refreshes both. */}
      {showAwayRange && (
        <AwayRangeDialog
          today={today}
          onClose={() => setShowAwayRange(false)}
          onSaved={() => {
            bump()
            onAwayChanged?.()
          }}
        />
      )}

      <HabitPerformance refreshKey={perfKey} currency={currency} />

      <HabitStatsView data={statsData} section="breakdown" />
    </div>
  )
}
