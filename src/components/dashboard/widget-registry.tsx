'use client'

import type { LucideIcon } from 'lucide-react'
import {
  TrendingUp,
  Target,
  Zap,
  CalendarCheck,
  Scale,
  Hash,
  Award,
  AlertTriangle,
  Sigma,
  Flame,
  Gauge,
  BarChart3,
  Clock,
  Timer,
  CalendarDays,
  Trophy,
} from 'lucide-react'
import { t } from '@/i18n'
import type { WidgetInstance, WidgetType, WidgetZone } from '@/lib/dashboard/types'
import KpiWidget from './widgets/KpiWidget'
import ZellaScoreWidget from './widgets/ZellaScoreWidget'
import CumulativePnlWidget from './widgets/CumulativePnlWidget'
import NetDailyPnlWidget from './widgets/NetDailyPnlWidget'
import PerformanceWidget from './widgets/PerformanceWidget'
import CalendarWidget from './widgets/CalendarWidget'
import TopSymbolsWidget from './widgets/TopSymbolsWidget'

export interface WidgetDef {
  type: WidgetType
  zone: WidgetZone
  label: string
  description: string
  icon: LucideIcon
  component: React.ComponentType<{ instance: WidgetInstance }>
  defaultColSpan: number
  minColSpan: number
  maxColSpan: number
  defaultRowSpan: number
}

const def = (
  type: WidgetType,
  zone: WidgetZone,
  icon: LucideIcon,
  component: WidgetDef['component'],
  span: [number, number, number] = [1, 1, 1],
  defaultRowSpan = 1,
): WidgetDef => ({
  type,
  zone,
  label: t(`dashboard.widgets.${type}.label`),
  description: t(`dashboard.widgets.${type}.description`),
  icon,
  component,
  defaultColSpan: span[0],
  minColSpan: span[1],
  maxColSpan: span[2],
  defaultRowSpan,
})

export const WIDGET_REGISTRY: Record<WidgetType, WidgetDef> = {
  // ── Top (KPI) ──
  'net-pnl': def('net-pnl', 'top', TrendingUp, KpiWidget),
  'trade-win-rate': def('trade-win-rate', 'top', Target, KpiWidget),
  'profit-factor': def('profit-factor', 'top', Zap, KpiWidget),
  'day-win-rate': def('day-win-rate', 'top', CalendarCheck, KpiWidget),
  'avg-win-loss': def('avg-win-loss', 'top', Scale, KpiWidget),
  'total-trades': def('total-trades', 'top', Hash, KpiWidget),
  'avg-rr': def('avg-rr', 'top', Award, KpiWidget),
  'max-drawdown': def('max-drawdown', 'top', AlertTriangle, KpiWidget),
  expectancy: def('expectancy', 'top', Sigma, KpiWidget),
  'current-streak': def('current-streak', 'top', Flame, KpiWidget),

  // ── Main ──
  'zella-score': def('zella-score', 'main', Gauge, ZellaScoreWidget, [1, 1, 2]),
  'cumulative-pnl': def('cumulative-pnl', 'main', TrendingUp, CumulativePnlWidget, [1, 1, 3]),
  'net-daily-pnl': def('net-daily-pnl', 'main', BarChart3, NetDailyPnlWidget, [1, 1, 3]),
  'time-performance': def('time-performance', 'main', Clock, PerformanceWidget, [1, 1, 2]),
  'duration-performance': def('duration-performance', 'main', Timer, PerformanceWidget, [1, 1, 2]),
  calendar: def('calendar', 'main', CalendarDays, CalendarWidget, [2, 2, 2], 2),
  'top-symbols': def('top-symbols', 'main', Trophy, TopSymbolsWidget, [1, 1, 2]),
}

export const TOP_WIDGETS = Object.values(WIDGET_REGISTRY).filter((w) => w.zone === 'top')
export const MAIN_WIDGETS = Object.values(WIDGET_REGISTRY).filter((w) => w.zone === 'main')

export function getWidgetDef(type: WidgetType): WidgetDef | undefined {
  return WIDGET_REGISTRY[type]
}
