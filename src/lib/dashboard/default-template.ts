import type { DashboardLayout, WidgetInstance } from './types'

const w = (
  id: string,
  type: WidgetInstance['type'],
  colSpan?: number,
  rowSpan?: number,
  settings?: Record<string, unknown>,
): WidgetInstance => ({
  id,
  type,
  ...(colSpan ? { colSpan } : {}),
  ...(rowSpan ? { rowSpan } : {}),
  ...(settings ? { settings } : {}),
})

export const DEFAULT_LAYOUT: DashboardLayout = {
  top: [
    w('t-net-pnl', 'net-pnl'),
    w('t-trade-win', 'trade-win-rate'),
    w('t-pf', 'profit-factor'),
    w('t-day-win', 'day-win-rate'),
    w('t-avg-wl', 'avg-win-loss'),
  ],
  main: [
    w('m-zella', 'zella-score', 1),
    w('m-cum', 'cumulative-pnl', 1),
    w('m-netdaily', 'net-daily-pnl', 1),
    w('m-calendar', 'calendar', 2, 2, { stats: ['netPnl', 'trades', 'winRate'] }),
    w('m-time', 'time-performance', 1),
    w('m-duration', 'duration-performance', 1),
  ],
}

export interface PresetTemplate {
  key: string
  name: string
  layout: DashboardLayout
}

export const PRESET_TEMPLATES: PresetTemplate[] = [{ key: 'default', name: 'Default', layout: DEFAULT_LAYOUT }]
