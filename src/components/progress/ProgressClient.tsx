'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { Target, ListChecks, CalendarRange, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { computeDayStatus, dayInScope, isCleanNoTrade } from '@/lib/progress-compute'
import {
  getProgressYear,
  getProgressStats,
  getDayProgress,
  toggleRuleCompletion,
  markAllSoftDone,
  setDayCheckedIn,
  createStarterRules,
  type ProgressRule,
  type ProgressYearData,
  type ProgressStats,
  type DayProgress,
} from '@/lib/actions/progress'
import ProgressYearHeatmap from './ProgressYearHeatmap'
import DaySummaryPanel from './DaySummaryPanel'
import ProgressStatsView from './ProgressStats'
import RulesManager from './RulesManager'
import RuleDialog from './RuleDialog'

type Tab = 'overview' | 'rules'

export default function ProgressClient({
  rules,
  today,
  years,
  initialYear,
  initialYearData,
  initialStats,
  initialDay,
  initialTab = 'overview',
}: {
  rules: ProgressRule[]
  today: string
  years: number[]
  initialYear: number
  initialYearData: ProgressYearData
  initialStats: ProgressStats
  initialDay: DayProgress
  initialTab?: Tab
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [showNewRule, setShowNewRule] = useState(false)
  const [year, setYear] = useState(initialYear)
  const [yearData, setYearData] = useState(initialYearData)
  const [stats, setStats] = useState(initialStats)
  const [day, setDay] = useState(initialDay)
  const [selectedDate, setSelectedDate] = useState(today)
  const [dayPending, startDayTransition] = useTransition()
  const [yearPending, startYearTransition] = useTransition()
  const [togglePending, startToggle] = useTransition()
  const [starterPending, startStarter] = useTransition()

  const sig = JSON.stringify(rules.map((r) => [r.id, r.name, r.active, r.description]))
  useEffect(() => {
    setYear(initialYear)
    setYearData(initialYearData)
    setStats(initialStats)
    setDay(initialDay)
    setSelectedDate(today)
  }, [sig, initialYear, initialYearData, initialStats, initialDay, today])

  const selectDay = (date: string) => {
    setSelectedDate(date)
    startDayTransition(async () => setDay(await getDayProgress(date)))
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
      const softRules = rules.filter((r) => r.type === 'soft')
      const hardRules = rules.filter((r) => r.type === 'hard')
      const softDone = softRules.filter((r) => r.completed).length
      const hardViolations = hardRules.filter((r) => !r.completed).length
      const inScope = dayInScope({
        hasTrades: d.hasTrades,
        checkedIn: d.checkedIn,
        hasLoggedRules: rules.some((r) => (r.type === 'hard' ? !r.completed : r.completed)),
      })
      const status = computeDayStatus({
        inScope,
        cleanNoTrade: isCleanNoTrade(d.checkedIn, d.hasTrades),
        hardTotal: hardRules.length,
        hardViolations,
        softTotal: softRules.length,
        softDone,
      })
      return {
        ...d,
        rules,
        softDone,
        softTotal: softRules.length,
        hardViolations,
        hardTotal: hardRules.length,
        status,
        completedCount: softDone,
        totalCount: softRules.length,
      }
    })
    startToggle(async () => {
      try {
        if (handleRateLimit(await toggleRuleCompletion(ruleId, selectedDate, next))) {
          setDay(await getDayProgress(selectedDate))
          return
        }
        const [d, y, s] = await Promise.all([getDayProgress(selectedDate), getProgressYear(year), getProgressStats()])
        setDay(d)
        setYearData(y)
        setStats(s)
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
      const rules = d.rules.map((r) => (r.type === 'soft' ? { ...r, completed: true } : r))
      const softRules = rules.filter((r) => r.type === 'soft')
      const hardRules = rules.filter((r) => r.type === 'hard')
      const softDone = softRules.length
      const hardViolations = hardRules.filter((r) => !r.completed).length
      const inScope = dayInScope({
        hasTrades: d.hasTrades,
        checkedIn: d.checkedIn,
        hasLoggedRules: rules.some((r) => (r.type === 'hard' ? !r.completed : r.completed)),
      })
      const status = computeDayStatus({
        inScope,
        cleanNoTrade: isCleanNoTrade(d.checkedIn, d.hasTrades),
        hardTotal: hardRules.length,
        hardViolations,
        softTotal: softRules.length,
        softDone,
      })
      return {
        ...d,
        rules,
        softDone,
        softTotal: softRules.length,
        hardViolations,
        hardTotal: hardRules.length,
        status,
        completedCount: softDone,
        totalCount: softRules.length,
      }
    })
    startToggle(async () => {
      try {
        if (handleRateLimit(await markAllSoftDone(selectedDate))) {
          setDay(await getDayProgress(selectedDate))
          return
        }
        const [d, y, s] = await Promise.all([getDayProgress(selectedDate), getProgressYear(year), getProgressStats()])
        setDay(d)
        setYearData(y)
        setStats(s)
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
        setDay(await getDayProgress(selectedDate))
      }
    })
  }

  const toggleCheckIn = () => {
    const next = !day.checkedIn
    setDay((d) => {
      const inScope = dayInScope({
        hasTrades: d.hasTrades,
        checkedIn: next,
        hasLoggedRules: d.rules.some((r) => (r.type === 'hard' ? !r.completed : r.completed)),
      })
      const status = computeDayStatus({
        inScope,
        cleanNoTrade: isCleanNoTrade(next, d.hasTrades),
        hardTotal: d.hardTotal,
        hardViolations: d.hardViolations,
        softTotal: d.softTotal,
        softDone: d.softDone,
      })
      return { ...d, checkedIn: next, status }
    })
    startToggle(async () => {
      try {
        if (handleRateLimit(await setDayCheckedIn(selectedDate, next))) {
          setDay(await getDayProgress(selectedDate))
          return
        }
        const [d, y, s] = await Promise.all([getDayProgress(selectedDate), getProgressYear(year), getProgressStats()])
        setDay(d)
        setYearData(y)
        setStats(s)
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
        setDay(await getDayProgress(selectedDate))
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
  const cardStats = {
    ...stats,
    greenDaysTotal: yearData.perfectDays,
    bestStreak: year === currentYear ? Math.max(yearData.bestStreak, stats.currentStreak) : yearData.bestStreak,
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: t('progress.tabs.overview'), icon: <CalendarRange className="h-4 w-4" /> },
    { key: 'rules', label: t('progress.tabs.rules'), icon: <ListChecks className="h-4 w-4" /> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('progress.title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('progress.subtitle')}</p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={cn(
                'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                tab === tb.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tb.icon}
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' ? (
        rules.filter((r) => r.active).length === 0 ? (
          <EmptyState
            onAddRules={() => setShowNewRule(true)}
            onAddStarter={addStarterRules}
            starterBusy={starterPending}
          />
        ) : (
          <div className="space-y-5">
            <ProgressStatsView stats={cardStats} section="cards" year={year} />

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
                <ProgressStatsView stats={stats} section="trend" />
              </div>
              <div className="relative min-w-0">
                <div className="xl:absolute xl:inset-0">
                  <DaySummaryPanel
                    day={day}
                    loading={dayPending}
                    onViewDay={viewDay}
                    editable={selectedDate <= today}
                    busy={togglePending}
                    onToggleRule={toggleRule}
                    onToggleCheckIn={toggleCheckIn}
                    onMarkAllSoft={markAllSoft}
                  />
                </div>
              </div>
            </div>

            <ProgressStatsView stats={stats} section="breakdown" />
          </div>
        )
      ) : (
        <RulesManager rules={rules} />
      )}

      {showNewRule && <RuleDialog mode="new" onClose={() => setShowNewRule(false)} onSaved={() => router.refresh()} />}
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
            {t('progress.rules.type.hard')}
          </span>
          <span className="text-sm leading-relaxed text-muted-foreground">{t('progress.stats.noRulesExplain2')}</span>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-background/40 px-3.5 py-2.5">
          <span className="mt-0.5 shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {t('progress.rules.type.soft')}
          </span>
          <span className="text-sm leading-relaxed text-muted-foreground">{t('progress.stats.noRulesExplain3')}</span>
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
      <p className="mt-2.5 text-xs text-muted-foreground">{t('progress.stats.addStarterHint')}</p>
    </div>
  )
}
