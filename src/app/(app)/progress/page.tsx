import { Suspense } from 'react'
import {
  getRules,
  getProgressYears,
  getProgressYear,
  getProgressStats,
  getDayProgress,
  getTodayKey,
  type ProgressRule,
  type ProgressStats,
  type ProgressYearData,
  type DayProgress,
} from '@/lib/actions/progress'
import ProgressClient from '@/components/progress/ProgressClient'
import { DisciplineLayoutSkeleton } from '@/components/progress/DisciplineSkeletons'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('meta.progress') }

const EMPTY_STATS: ProgressStats = {
  activeRules: 0,
  currentStreak: 0,
  bestStreak: 0,
  perfectDaysTotal: 0,
  avgDiscipline30: 0,
  loggedDays30: 0,
  todayRatio: 0,
  todayCompleted: 0,
  todayTotal: 0,
  trend: [],
  perRule: [],
  weekday: [],
}
const emptyYearData = (year: number): ProgressYearData => ({
  year,
  activeRules: 0,
  days: [],
  perfectDays: 0,
  loggedDays: 0,
  avgRatio: 0,
})
const emptyDay = (date: string): DayProgress => ({
  date,
  note: '',
  rules: [],
  completedCount: 0,
  totalCount: 0,
})

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>
}) {
  const sp = await searchParams
  const initialTab = sp.tab === 'rules' ? 'rules' : 'overview'
  const today = await getTodayKey()
  const currentYear = Number(today.slice(0, 4))
  const rules = await getRules()

  if (!rules.some((r) => r.active)) {
    return (
      <div className="p-4 sm:p-6 animate-in">
        <ProgressClient
          rules={rules}
          today={today}
          years={[currentYear]}
          initialYear={currentYear}
          initialYearData={emptyYearData(currentYear)}
          initialStats={EMPTY_STATS}
          initialDay={emptyDay(today)}
          initialTab={initialTab}
        />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 animate-in">
      <Suspense fallback={<DisciplineLayoutSkeleton />}>
        <ProgressOverview rules={rules} today={today} currentYear={currentYear} initialTab={initialTab} />
      </Suspense>
    </div>
  )
}

async function ProgressOverview({
  rules,
  today,
  currentYear,
  initialTab,
}: {
  rules: ProgressRule[]
  today: string
  currentYear: number
  initialTab: 'overview' | 'rules'
}) {
  const [years, yearData, stats, day] = await Promise.all([
    getProgressYears(),
    getProgressYear(currentYear),
    getProgressStats(),
    getDayProgress(today),
  ])

  return (
    <ProgressClient
      rules={rules}
      today={today}
      years={years}
      initialYear={currentYear}
      initialYearData={yearData}
      initialStats={stats}
      initialDay={day}
      initialTab={initialTab}
    />
  )
}
