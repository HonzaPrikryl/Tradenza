'use client'

import type { CSSProperties } from 'react'
import type { DashboardLayout, WidgetInstance } from '@/lib/dashboard/types'
import { ZONE_CONFIG, MAIN_ROW_HEIGHT as DASH_ROW } from '@/lib/dashboard/types'
import { getWidgetDef } from './widget-registry'
import { cn } from '@/lib/utils'
import ErrorBoundary from '@/components/ErrorBoundary'

function RenderWidget({ instance, index }: { instance: WidgetInstance; index: number }) {
  const def = getWidgetDef(instance.type)
  if (!def) return null
  const Comp = def.component
  return (
    <div className="animate-fade-in h-full" style={{ animationDelay: `${Math.min(index * 40, 320)}ms` }}>
      <ErrorBoundary label={def.label}>
        <Comp instance={instance} />
      </ErrorBoundary>
    </div>
  )
}

export default function DashboardGrid({ layout, className }: { layout: DashboardLayout; className?: string }) {
  const topCount = Math.min(layout.top.length, ZONE_CONFIG.top.columns)

  return (
    <div className={cn('space-y-4', className)}>
      <div
        className="grid gap-3 grid-cols-1 min-[440px]:grid-cols-2 sm:grid-cols-3 min-[1500px]:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
        style={{ '--cols': topCount } as CSSProperties}
      >
        {layout.top.map((wi, i) => (
          <RenderWidget key={wi.id} instance={wi} index={i} />
        ))}
      </div>

      <div
        className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 dash-main"
        style={{ '--main-row': DASH_ROW } as CSSProperties}
      >
        {layout.main.map((wi, i) => {
          const def = getWidgetDef(wi.type)
          const span = Math.min(wi.colSpan ?? def?.defaultColSpan ?? 1, ZONE_CONFIG.main.columns)
          const rowSpan = wi.rowSpan ?? def?.defaultRowSpan ?? 1
          return (
            <div
              key={wi.id}
              className={cn('dash-cell min-h-0', span >= 2 && 'dash-wide')}
              style={{ '--cs': span, '--rs': rowSpan } as CSSProperties}
            >
              <RenderWidget instance={wi} index={i} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
