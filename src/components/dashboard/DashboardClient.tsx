'use client'

import { useState } from 'react'
import type { DashboardLayout, DashboardWidgetData, CalendarData, DashboardTemplateDTO } from '@/lib/dashboard/types'
import type { DisplayUnit } from '@/lib/utils'
import { DashboardDataProvider } from './DashboardDataContext'
import DashboardGrid from './DashboardGrid'
import DashboardToolbar from './DashboardToolbar'
import ViewMyDayButton from './ViewMyDayButton'
import DashboardEditor from './DashboardEditor'
import { t } from '@/i18n'

interface Props {
  data: DashboardWidgetData
  calendarInitial: CalendarData
  currency: string
  unit: DisplayUnit
  layout: DashboardLayout
  activeTemplate: DashboardTemplateDTO | null
  templates: DashboardTemplateDTO[]
}

type EditState = {
  kind: 'create' | 'edit'
  template: DashboardTemplateDTO | null
  initialLayout: DashboardLayout
}

export default function DashboardClient({
  data,
  calendarInitial,
  currency,
  unit,
  layout,
  activeTemplate,
  templates,
}: Props) {
  const [edit, setEdit] = useState<EditState | null>(null)

  const displayTemplates: DashboardTemplateDTO[] =
    templates.length > 0 ? templates : [{ id: '', name: 'Default', isDefault: true, isPreset: true, layout }]

  return (
    <DashboardDataProvider value={{ data, calendarInitial, currency, unit, editing: !!edit }}>
      {edit ? (
        <DashboardEditor
          kind={edit.kind}
          template={edit.template}
          initialLayout={edit.initialLayout}
          onClose={() => setEdit(null)}
        />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{t('dashboard.subtitle')}</p>
            </div>
            <div className="flex w-full shrink-0 gap-2 md:w-auto">
              <ViewMyDayButton />
              <DashboardToolbar
                templates={displayTemplates}
                activeId={activeTemplate?.id ?? null}
                onEdit={(tpl) => setEdit({ kind: 'edit', template: tpl, initialLayout: tpl.layout })}
                onCreate={() => setEdit({ kind: 'create', template: null, initialLayout: layout })}
              />
            </div>
          </div>
          <DashboardGrid layout={layout} />
        </>
      )}
    </DashboardDataProvider>
  )
}
