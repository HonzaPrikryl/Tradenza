import { getDashboardWidgetData, getActiveLayout, getCalendarData, listTemplates } from '@/lib/actions/dashboard'
import { hasAnyTrades } from '@/lib/actions/trades'
import { getTagGroups } from '@/lib/actions/tags'
import { getRules } from '@/lib/actions/progress'
import { isOnboardingDismissed } from '@/lib/onboarding'
import { readGlobalFilters } from '@/lib/global-filters'
import DashboardClient from '@/components/dashboard/DashboardClient'
import DemoNotice from '@/components/onboarding/DemoNotice'
import GettingStarted, { type OnboardingStep } from '@/components/onboarding/GettingStarted'
import OnboardingCompleteTracker from '@/components/onboarding/OnboardingCompleteTracker'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('meta.dashboard') }

export default async function DashboardPage() {
  const now = new Date()
  const [data, active, templates, filters, hasTrades, tagGroups, rules, dismissed] = await Promise.all([
    getDashboardWidgetData(),
    getActiveLayout(),
    listTemplates(),
    readGlobalFilters(),
    hasAnyTrades(),
    getTagGroups(),
    getRules(),
    isOnboardingDismissed(),
  ])
  const calendarInitial = await getCalendarData(now.getFullYear(), now.getMonth() + 1)

  const steps: OnboardingStep[] = [
    { key: 'trade', done: hasTrades },
    { key: 'tags', done: tagGroups.some((g) => g.values.length > 0) },
    { key: 'discipline', done: rules.length > 0 },
  ]
  const allDone = steps.every((s) => s.done)
  const showChecklist = !dismissed && !allDone

  return (
    <div className="p-5 w-full animate-in">
      <OnboardingCompleteTracker allDone={allDone} />
      {showChecklist ? (
        <GettingStarted steps={steps} isDemo={!hasTrades} />
      ) : (
        !hasTrades && <DemoNotice context="dashboard" />
      )}
      <DashboardClient
        data={data}
        calendarInitial={calendarInitial}
        currency="USD"
        unit={filters.unit}
        layout={active.layout}
        activeTemplate={active.template}
        templates={templates}
      />
    </div>
  )
}
