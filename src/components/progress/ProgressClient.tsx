'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { Target, ListChecks, CalendarRange, CalendarCheck, Loader2, Sparkles } from 'lucide-react'
import { t, tList } from '@/i18n'
import { dayIsOpen, isCleanNoTrade, tallyDayRules, type AwayScope } from '@/lib/progress-compute'
import {
  getProgressYear,
  getProgressStats,
  getDayProgress,
  toggleRuleCompletion,
  markAllSoftDone,
  setDayCheckedIn,
  setDayAway,
  setDaysAway,
  createStarterRules,
  type ProgressRule,
  type ProgressYearData,
  type ProgressCalendarCell,
  type ProgressStats,
  type DayProgress,
} from '@/lib/actions/progress'
import ProgressYearHeatmap from './ProgressYearHeatmap'
import DaySummaryPanel from './DaySummaryPanel'
import ProgressStatsView from './ProgressStats'
import ManageRules from './ManageRules'
import RuleDialog from './RuleDialog'
import AwayRangeDialog from './AwayRangeDialog'
import HabitsTab from './HabitsTab'
import TabList, { tabPanelProps, type TabItem } from '@/components/ui/TabList'
import Collapse from '@/components/ui/Collapse'

type Tab = 'overview' | 'habits' | 'rules'

/** Namespace for the tab/panel id pairs — see TabList. */
const TAB_ID = 'discipline'

export default function ProgressClient({
  rules,
  today,
  years,
  initialYear,
  initialYearData,
  initialStats,
  initialDay,
  initialTab = 'overview',
  currency,
}: {
  rules: ProgressRule[]
  today: string
  years: number[]
  initialYear: number
  initialYearData: ProgressYearData
  initialStats: ProgressStats
  initialDay: DayProgress
  initialTab?: Tab
  /** Display currency for money figures — see the note in progress/page.tsx. */
  currency: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab)
  // Once the Habits tab has been opened we keep it mounted (hidden) so its widgets
  // don't re-fetch on every tab switch.
  const [habitsOpened, setHabitsOpened] = useState(initialTab === 'habits')
  const [showNewRule, setShowNewRule] = useState(false)
  const [showAwayRange, setShowAwayRange] = useState(false)
  const [year, setYear] = useState(initialYear)
  const [yearData, setYearData] = useState(initialYearData)
  const [stats, setStats] = useState(initialStats)
  const [day, setDay] = useState(initialDay)
  const [selectedDate, setSelectedDate] = useState(today)
  const [dayPending, startDayTransition] = useTransition()
  const [yearPending, startYearTransition] = useTransition()
  const [togglePending, startToggle] = useTransition()
  const [starterPending, startStarter] = useTransition()
  const [excusePending, startExcuse] = useTransition()
  // `away` is ONE calendar-day fact written from either tab, but each tab refetches only
  // after its own mutations — and both stay mounted. So excusing a day in Trading left the
  // Daily heatmap showing it as an ordinary blank until something else happened to refresh
  // it, and vice versa. This counter is the cross-tab signal: bumped by whoever writes the
  // flag, watched by whoever has to redraw because of it.
  const [awayVersion, setAwayVersion] = useState(0)
  const bumpAway = () => setAwayVersion((v) => v + 1)

  // Re-sync to the server snapshot ONLY when the rule set itself changes (add / edit /
  // delete / reorder). We deliberately do NOT depend on the initial* data props: a
  // completion toggle calls revalidatePath('/progress'), which re-renders this server
  // component with fresh initial* props — and if those were deps, this effect would
  // fire and yank the user back to today, discarding the past day they were editing.
  // Toggles update the visible day/stats through their own explicit re-fetch instead.
  // Scoped to TRADING rules only: editing one (tier, schedule, order…) re-syncs the
  // overview's heatmap / day panel / stats, while editing a daily habit in the Manage
  // tab leaves the trading overview untouched (habits never score trading days — the
  // Daily discipline tab refreshes itself off its own habit signature instead).
  const sig = JSON.stringify(
    rules
      .filter((r) => r.category !== 'habit')
      .map((r) => [r.id, r.name, r.active, r.description, r.type, r.sortOrder, r.activeDays, r.scheduleSince]),
  )
  useEffect(() => {
    setYear(initialYear)
    setYearData(initialYearData)
    setStats(initialStats)
    setDay(initialDay)
    setSelectedDate(today)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  const selectDay = (date: string) => {
    setSelectedDate(date)
    startDayTransition(async () => setDay(await getDayProgress(date)))
  }

  // Jump to the first day of the streak gap so it can be filled in. Selecting alone isn't
  // enough: on anything narrower than xl the day panel sits below the heatmap, off-screen,
  // so pressing the button would look like it did nothing. Scroll it into view.
  const dayPanelRef = useRef<HTMLDivElement | null>(null)
  const fillInStreakGap = () => {
    const oldest = stats.streakBlockers[stats.streakBlockers.length - 1]
    if (!oldest) return
    // The gap can predate the year being browsed — load that year first or the heatmap
    // would highlight a day it isn't showing.
    const gapYear = Number(oldest.slice(0, 4))
    if (gapYear !== year) changeYear(gapYear)
    selectDay(oldest)
    dayPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // The aggregate queries (breakdown stats AND the year heatmap) each scan a full
  // calendar; the day panel is the only thing the user needs back immediately. So both
  // are debounced together: rapid consecutive toggles — back-filling five rules on one
  // day — collapse into a single pair of fetches once the user pauses, instead of two
  // full-calendar scans per click.
  //
  // Nothing is lost in the meantime: the heatmap cell is patched optimistically below,
  // so it recolours instantly and the fetch only confirms it.
  const aggTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [aggFailed, setAggFailed] = useState(false)
  const refreshAggregatesDebounced = () => {
    if (aggTimer.current) clearTimeout(aggTimer.current)
    aggTimer.current = setTimeout(() => {
      Promise.all([getProgressStats(), getProgressYear(year)])
        .then(([s, y]) => {
          setStats(s)
          setYearData(y)
          setAggFailed(false)
        })
        // Swallowing this left the cards and the heatmap silently stale — the user saw
        // numbers that no longer matched what they'd just logged, with nothing to say so.
        .catch(() => setAggFailed(true))
    }, 500)
  }
  useEffect(() => () => void (aggTimer.current && clearTimeout(aggTimer.current)), [])

  // Optimistic heatmap patch: the client already computes the day's tally, and
  // heatStatusClass reads exactly these fields, so one cell can be recoloured without
  // waiting for a year scan. Everything else (streaks, averages, coverage) still comes
  // from the server on the debounced refresh.
  const patchYearCell = (d: DayProgress) => {
    setYearData((y) => {
      const cell: ProgressCalendarCell = {
        date: d.date,
        status: d.status,
        cleanNoTrade: isCleanNoTrade(d.checkedIn, d.hasTrades),
        away: d.away,
        hardTotal: d.hardTotal,
        hardViolations: d.hardViolations,
        softTotal: d.softTotal,
        softDone: d.softDone,
        ratio: d.softTotal > 0 ? d.softDone / d.softTotal : 0,
        hasNote: y.days.find((c) => c.date === d.date)?.hasNote ?? false,
      }
      const days = y.days.some((c) => c.date === d.date)
        ? y.days.map((c) => (c.date === d.date ? cell : c))
        : [...y.days, cell].sort((a, b) => a.date.localeCompare(b.date))
      return { ...y, days }
    })
  }

  // Shared "reaction" after any day mutation: refetch the day (cheap, and it's what the
  // user is looking at), patch its heatmap cell from the answer, and let the calendar-wide
  // queries catch up on the debounce. One place so the handlers below can't drift.
  const syncAfterDayMutation = async () => {
    const d = await getDayProgress(selectedDate)
    setDay(d)
    // Only the visible year owns this cell — patching while the user browses 2024 would
    // inject a 2026 date into it.
    if (d.date.startsWith(String(year))) patchYearCell(d)
    refreshAggregatesDebounced()
  }

  const changeYear = (y: number) => {
    setYear(y)
    startYearTransition(async () => setYearData(await getProgressYear(y)))
  }

  const toggleRule = (ruleId: string, next: boolean) => {
    const toggled = day.rules.find((r) => r.id === ruleId)
    const isHardViolation = toggled?.type === 'hard' && next === false

    setDay((d) => {
      const rules = d.rules.map((r) => (r.id === ruleId ? { ...r, completed: next } : r))
      const tally = tallyDayRules(rules, {
        hasTrades: d.hasTrades,
        checkedIn: d.checkedIn,
        isOpen: dayIsOpen(selectedDate, today),
      })
      return { ...d, rules, ...tally, completedCount: tally.softDone, totalCount: tally.softTotal }
    })
    startToggle(async () => {
      try {
        if (handleRateLimit(await toggleRuleCompletion(ruleId, selectedDate, next))) {
          setDay(await getDayProgress(selectedDate))
          return
        }
        await syncAfterDayMutation()
        if (isHardViolation) {
          toast(t('progress.day.hardViolationLogged'), {
            action: { label: t('progress.day.undo'), onClick: () => toggleRule(ruleId, true) },
          })
        }
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
        setDay(await getDayProgress(selectedDate))
      }
    })
  }

  const markAllSoft = () => {
    setDay((d) => {
      // Only trading soft habits are bulk-marked — general habits are untouched.
      const rules = d.rules.map((r) => (r.type === 'soft' && r.category !== 'habit' ? { ...r, completed: true } : r))
      const tally = tallyDayRules(rules, {
        hasTrades: d.hasTrades,
        checkedIn: d.checkedIn,
        isOpen: dayIsOpen(selectedDate, today),
      })
      return { ...d, rules, ...tally, completedCount: tally.softDone, totalCount: tally.softTotal }
    })
    startToggle(async () => {
      try {
        if (handleRateLimit(await markAllSoftDone(selectedDate))) {
          setDay(await getDayProgress(selectedDate))
          return
        }
        await syncAfterDayMutation()
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
        setDay(await getDayProgress(selectedDate))
      }
    })
  }

  const toggleCheckIn = () => {
    const next = !day.checkedIn
    setDay((d) => {
      const { status } = tallyDayRules(d.rules, {
        hasTrades: d.hasTrades,
        checkedIn: next,
        isOpen: dayIsOpen(selectedDate, today),
      })
      // Reviewing a day also confirms it — that's what admits it to the payoff sample.
      return { ...d, checkedIn: next, confirmed: next || d.confirmed, status }
    })
    startToggle(async () => {
      try {
        if (handleRateLimit(await setDayCheckedIn(selectedDate, next))) {
          setDay(await getDayProgress(selectedDate))
          return
        }
        await syncAfterDayMutation()
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
        setDay(await getDayProgress(selectedDate))
      }
    })
  }

  const toggleAway = () => {
    // Toggles the RAW flag — binding to the effective `away` left the control stuck on a
    // day that had logged rules (see DayProgress.awayFlag). The review flag is left alone:
    // the server no longer clears it (see setDayAway).
    const next = !day.awayFlag
    setDay((d) =>
      next ? { ...d, awayFlag: true, away: true, status: 'none' } : { ...d, awayFlag: false, away: false },
    )
    startToggle(async () => {
      try {
        // Re-excusing keeps whatever scope the day already had — see setDayAway.
        if (handleRateLimit(await setDayAway(selectedDate, next, day.awayScope))) {
          setDay(await getDayProgress(selectedDate))
          return
        }
        await syncAfterDayMutation()
        bumpAway()
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
        setDay(await getDayProgress(selectedDate))
      }
    })
  }

  // Narrow or widen an existing excuse. Writes the same row, flag unchanged — only the
  // scope moves, so the day never blinks out of its excused state while switching.
  const setAwayScope = (scope: AwayScope) => {
    setDay((d) => ({ ...d, awayScope: scope }))
    startToggle(async () => {
      try {
        if (handleRateLimit(await setDayAway(selectedDate, true, scope))) {
          setDay(await getDayProgress(selectedDate))
          return
        }
        await syncAfterDayMutation()
        bumpAway()
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
        setDay(await getDayProgress(selectedDate))
      }
    })
  }

  // Excuse the run of unlogged days blocking the streak (see ProgressStats.streakBlockers).
  // One write for the whole run, then a full re-sync — the streak, coverage and every
  // affected heatmap cell all move at once.
  const excuseStreakBlockers = () => {
    const days = stats.streakBlockers
    if (days.length === 0) return
    startExcuse(async () => {
      try {
        if (handleRateLimit(await setDaysAway(days, true))) return
        toast.success(
          t(`progress.stats.streakBlockedDone.${days.length === 1 ? 'one' : 'other'}`, { days: days.length }),
        )
        const [s, y] = await Promise.all([getProgressStats(), getProgressYear(year)])
        setStats(s)
        setYearData(y)
        setDay(await getDayProgress(selectedDate))
        bumpAway()
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
      }
    })
  }

  const addStarterRules = () =>
    startStarter(async () => {
      try {
        if (handleRateLimit(await createStarterRules())) return
        toast.success(t('progress.stats.starterAdded'))
        router.refresh()
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
      }
    })

  const viewDay = () => router.push(`/progress/${selectedDate}`)

  const currentYear = Number(today.slice(0, 4))
  // The two year-scoped cards follow the heatmap's selected year. On the CURRENT year
  // the year scan can't see a live streak that started before New Year, so the running
  // streak floors the best one (never "current 40 > best 35").
  const yearStats = {
    greenDays: yearData.perfectDays,
    bestStreak: year === currentYear ? Math.max(yearData.bestStreak, stats.currentStreak) : yearData.bestStreak,
  }

  const tabs: TabItem<Tab>[] = [
    { key: 'overview', label: t('progress.tabs.overview'), icon: <CalendarRange className="h-4 w-4" /> },
    { key: 'habits', label: t('progress.tabs.habits'), icon: <CalendarCheck className="h-4 w-4" /> },
    { key: 'rules', label: t('progress.tabs.rules'), icon: <ListChecks className="h-4 w-4" /> },
  ]

  const selectTab = (key: Tab) => {
    setTab(key)
    if (key === 'habits') setHabitsOpened(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('progress.title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('progress.subtitle')}</p>
        </div>
        <TabList tabs={tabs} value={tab} onChange={selectTab} label={t('progress.title')} idBase={TAB_ID} />
      </div>

      <div {...tabPanelProps(TAB_ID, 'overview', tab === 'overview')}>
        {rules.filter((r) => r.active && r.category !== 'habit').length === 0 ? (
          <EmptyState
            onAddRules={() => setShowNewRule(true)}
            onAddStarter={addStarterRules}
            starterBusy={starterPending}
          />
        ) : (
          <div>
            {/* A failed background refresh used to be swallowed, leaving the cards and
                heatmap quietly showing numbers that no longer matched what the user had
                just logged. Say it, and offer the one-click fix.

                Collapsed, like the streak prompt: it appears and disappears on its own (a
                fetch failing, then succeeding) and popping in at full height shoved the
                page down under the user's cursor. */}
            <Collapse open={aggFailed}>
              {/* Gap on the CHILD, so it collapses with the card — see Collapse. */}
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs">
                <span className="text-foreground">{t('progress.stats.staleWarning')}</span>
                <button
                  type="button"
                  onClick={refreshAggregatesDebounced}
                  className="shrink-0 rounded-md border border-border px-3 py-1 font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {t('progress.stats.staleRetry')}
                </button>
              </div>
            </Collapse>
            <div className="space-y-5">
              <ProgressStatsView
                stats={stats}
                currency={currency}
                section="cards"
                year={year}
                currentYear={currentYear}
                yearStats={yearStats}
                onExcuseStreakBlockers={excuseStreakBlockers}
                onFillIn={fillInStreakGap}
                excusing={excusePending}
              />

              <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-5">
                  <ProgressYearHeatmap
                    data={yearData}
                    years={years}
                    year={year}
                    selectedDate={selectedDate}
                    todayKey={today}
                    pending={yearPending}
                    onSelect={selectDay}
                    onYearChange={changeYear}
                  />
                  <ProgressStatsView stats={stats} currency={currency} section="trend" />
                </div>
                <div className="relative min-w-0" ref={dayPanelRef}>
                  <div className="xl:absolute xl:inset-0">
                    <DaySummaryPanel
                      day={day}
                      loading={dayPending}
                      onViewDay={viewDay}
                      editable={selectedDate <= today}
                      busy={togglePending}
                      onToggleRule={toggleRule}
                      onToggleCheckIn={toggleCheckIn}
                      onToggleAway={toggleAway}
                      onSetAwayScope={setAwayScope}
                      onExcuseRange={() => setShowAwayRange(true)}
                      onMarkAllSoft={markAllSoft}
                    />
                  </div>
                </div>
              </div>

              <ProgressStatsView stats={stats} currency={currency} section="breakdown" />
            </div>
          </div>
        )}
      </div>

      <div {...tabPanelProps(TAB_ID, 'rules', tab === 'rules')}>{tab === 'rules' && <ManageRules rules={rules} />}</div>

      {/* The Habits tab fetches its own data client-side; once opened we keep it
          mounted (just hidden) so switching tabs doesn't re-fetch every widget —
          mirroring the overview, whose data lives in this component's state.
          `hidden` on the panel takes it out of the accessibility tree too, so the
          kept-alive content can't leak into the reading order of the visible tab. */}
      <div {...tabPanelProps(TAB_ID, 'habits', tab === 'habits')}>
        {habitsOpened && (
          <HabitsTab
            rules={rules}
            years={years}
            initialYear={year}
            today={today}
            currency={currency}
            awayVersion={awayVersion}
            onAwayChanged={async () => {
              // Same flag, other direction: redraw the trading heatmap and the selected day.
              refreshAggregatesDebounced()
              setDay(await getDayProgress(selectedDate))
            }}
          />
        )}
      </div>

      {showNewRule && <RuleDialog mode="new" onClose={() => setShowNewRule(false)} onSaved={() => router.refresh()} />}

      {/* Excusing a range moves the streak, the coverage line and a block of heatmap
          cells at once, so it re-syncs everything rather than patching one day. */}
      {showAwayRange && (
        <AwayRangeDialog
          today={today}
          onClose={() => setShowAwayRange(false)}
          onSaved={async () => {
            const [s, y] = await Promise.all([getProgressStats(), getProgressYear(year)])
            setStats(s)
            setYearData(y)
            setDay(await getDayProgress(selectedDate))
            bumpAway()
          }}
        />
      )}
    </div>
  )
}

function EmptyState({
  onAddRules,
  onAddStarter,
  starterBusy,
}: {
  onAddRules: () => void
  onAddStarter: () => void
  starterBusy: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Target className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-base font-semibold">{t('progress.stats.noRulesYetTitle')}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {t('progress.stats.noRulesExplain')}
      </p>

      <div className="mt-4 w-full max-w-md space-y-2 text-left">
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-background/40 px-3.5 py-2.5">
          <span className="mt-0.5 shrink-0 rounded bg-loss/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-loss">
            {t('progress.mode.kind.constraint')}
          </span>
          <span className="text-pretty text-sm leading-relaxed text-muted-foreground">
            {t('progress.stats.noRulesExplain2')}
          </span>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-background/40 px-3.5 py-2.5">
          <span className="mt-0.5 shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {t('progress.mode.kind.task')}
          </span>
          <span className="text-pretty text-sm leading-relaxed text-muted-foreground">
            {t('progress.stats.noRulesExplain3')}
          </span>
        </div>
      </div>

      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
        {t('progress.stats.noRulesExplain4')}
      </p>
      <div className="mt-6 flex flex-col items-center gap-2.5 sm:flex-row">
        <button
          onClick={onAddStarter}
          disabled={starterBusy}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {starterBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {t('progress.stats.addStarter')}
        </button>
        <button
          onClick={onAddRules}
          className="rounded-md border border-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          {t('progress.stats.addOwn')}
        </button>
      </div>
      {/* Count comes from the starter lists themselves — hardcoding it meant the hint
          quietly started lying the moment somebody added a rule to them. */}
      <p className="mt-2.5 text-xs text-muted-foreground">
        {t('progress.stats.addStarterHint', {
          count: tList('progress.stats.starterRules.hard').length + tList('progress.stats.starterRules.soft').length,
        })}
      </p>
    </div>
  )
}
