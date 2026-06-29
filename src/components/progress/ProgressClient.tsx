'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Target, ListChecks, CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  getProgressYear,
  getProgressStats,
  getDayProgress,
  toggleRuleCompletion,
  type ProgressRule,
  type ProgressYearData,
  type ProgressStats,
  type DayProgress,
} from '@/lib/actions/progress'
import ProgressYearHeatmap from './ProgressYearHeatmap'
import DaySummaryPanel from './DaySummaryPanel'
import ProgressStatsView from './ProgressStats'
import RulesManager from './RulesManager'

type Tab = 'overview' | 'rules'

export default function ProgressClient({
  rules,
  today,
  years,
  initialYear,
  initialYearData,
  initialStats,
  initialDay,
}: {
  rules: ProgressRule[]
  today: string
  years: number[]
  initialYear: number
  initialYearData: ProgressYearData
  initialStats: ProgressStats
  initialDay: DayProgress
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [year, setYear] = useState(initialYear)
  const [yearData, setYearData] = useState(initialYearData)
  const [stats, setStats] = useState(initialStats)
  const [day, setDay] = useState(initialDay)
  const [selectedDate, setSelectedDate] = useState(today)
  const [dayPending, startDayTransition] = useTransition()
  const [yearPending, startYearTransition] = useTransition()
  const [togglePending, startToggle] = useTransition()

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
    setDay((d) => {
      const rules = d.rules.map((r) => (r.id === ruleId ? { ...r, completed: next } : r))
      return { ...d, rules, completedCount: rules.filter((r) => r.completed).length }
    })
    startToggle(async () => {
      try {
        await toggleRuleCompletion(ruleId, today, next)
        const [d, y, s] = await Promise.all([getDayProgress(today), getProgressYear(year), getProgressStats()])
        setDay(d)
        setYearData(y)
        setStats(s)
      } catch {
        toast.error(t('progress.rules.toast.saveError'))
        setDay(await getDayProgress(today))
      }
    })
  }

  const viewDay = () => router.push(`/progress/${selectedDate}`)

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: t('progress.tabs.overview'), icon: <CalendarRange className="h-4 w-4" /> },
    { key: 'rules', label: t('progress.tabs.rules'), icon: <ListChecks className="h-4 w-4" /> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Target className="h-5 w-5 text-primary" />
            {t('progress.title')}
          </h1>
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
          <EmptyState onAddRules={() => setTab('rules')} />
        ) : (
          <div className="space-y-5">
            <ProgressStatsView stats={stats} section="cards" />

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
              <DaySummaryPanel
                day={day}
                loading={dayPending}
                onViewDay={viewDay}
                editable={selectedDate === today}
                busy={togglePending}
                onToggleRule={toggleRule}
              />
            </div>

            <ProgressStatsView stats={stats} section="breakdown" />
          </div>
        )
      ) : (
        <RulesManager rules={rules} />
      )}
    </div>
  )
}

function EmptyState({ onAddRules }: { onAddRules: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Target className="h-7 w-7 text-primary" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{t('progress.stats.noRulesYet')}</p>
      <button
        onClick={onAddRules}
        className="mt-5 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {t('progress.rules.add')}
      </button>
    </div>
  )
}
