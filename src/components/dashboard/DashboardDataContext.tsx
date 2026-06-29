'use client'

import { createContext, useContext } from 'react'
import type { DashboardWidgetData, CalendarData } from '@/lib/dashboard/types'
import type { DisplayUnit } from '@/lib/utils'

export interface DashboardDataCtx {
  data: DashboardWidgetData
  calendarInitial: CalendarData
  currency: string
  unit: DisplayUnit
  editing?: boolean
}

const Ctx = createContext<DashboardDataCtx | null>(null)

export function DashboardDataProvider({ value, children }: { value: DashboardDataCtx; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDashboardData(): DashboardDataCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDashboardData must be used within DashboardDataProvider')
  return c
}
