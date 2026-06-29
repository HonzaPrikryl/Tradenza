import { getDashboardWidgetData, getActiveLayout, getCalendarData, listTemplates } from '@/lib/actions/dashboard'
import { readGlobalFilters } from '@/lib/global-filters'
import DashboardClient from '@/components/dashboard/DashboardClient'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('meta.dashboard') }

export default async function DashboardPage() {
  const now = new Date()
  const [data, active, templates, filters] = await Promise.all([
    getDashboardWidgetData(),
    getActiveLayout(),
    listTemplates(),
    readGlobalFilters(),
  ])
  const calendarInitial = await getCalendarData(now.getFullYear(), now.getMonth() + 1)

  return (
    <div className="p-5 w-full animate-in">
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
