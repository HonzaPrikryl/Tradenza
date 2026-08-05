import { getDashboardWidgetData, getDashboardTemplates, getCalendarData } from '@/lib/actions/dashboard'
import { getOnboardingStatus } from '@/lib/onboarding'
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
  const [data, dashboards, filters, onboarding] = await Promise.all([
    getDashboardWidgetData(),
    getDashboardTemplates(),
    readGlobalFilters(),
    getOnboardingStatus(),
  ])
  const calendarInitial = await getCalendarData(now.getFullYear(), now.getMonth() + 1)

  const steps: OnboardingStep[] = [
    { key: 'trade', done: onboarding.hasTrades },
    { key: 'strategy', done: onboarding.hasStrategy },
    { key: 'tags', done: onboarding.hasTag },
    { key: 'discipline', done: onboarding.hasRule },
  ]
  const allDone = steps.every((s) => s.done)
  const showChecklist = !onboarding.dismissed && !allDone

  return (
    <div className="p-5 w-full animate-in">
      <OnboardingCompleteTracker allDone={allDone} />
      {showChecklist ? (
        <GettingStarted steps={steps} isDemo={!onboarding.hasTrades} />
      ) : (
        !onboarding.hasTrades && <DemoNotice context="dashboard" />
      )}
      <DashboardClient
        data={data}
        calendarInitial={calendarInitial}
        currency="USD"
        unit={filters.unit}
        layout={dashboards.layout}
        activeTemplate={dashboards.active}
        templates={dashboards.templates}
      />
    </div>
  )
}
