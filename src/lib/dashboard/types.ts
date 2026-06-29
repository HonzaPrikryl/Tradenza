import type { Outcome } from '@/lib/breakeven'

export type WidgetZone = 'top' | 'main'

export type TopWidgetType =
  | 'net-pnl'
  | 'trade-win-rate'
  | 'profit-factor'
  | 'day-win-rate'
  | 'avg-win-loss'
  | 'total-trades'
  | 'avg-rr'
  | 'max-drawdown'
  | 'expectancy'
  | 'current-streak'

export type MainWidgetType =
  | 'zella-score'
  | 'cumulative-pnl'
  | 'net-daily-pnl'
  | 'time-performance'
  | 'duration-performance'
  | 'calendar'
  | 'top-symbols'

export type WidgetType = TopWidgetType | MainWidgetType

export interface WidgetInstance {
  id: string
  type: WidgetType
  colSpan?: number // main zone only (1–3); default from registry
  rowSpan?: number
  settings?: Record<string, unknown>
}

export interface DashboardLayout {
  top: WidgetInstance[]
  main: WidgetInstance[]
}

export interface DashboardTemplateDTO {
  id: string
  name: string
  isDefault: boolean
  isPreset: boolean
  layout: DashboardLayout
}

export const MAIN_ROW_HEIGHT = 'clamp(20rem, 34vh, 23.5rem)'

export const ZONE_CONFIG = {
  top: {
    minWidgets: 3,
    maxWidgets: 5,
    columns: 5,
  },
  main: {
    minWidgets: 3,
    maxWidgets: 12,
    columns: 3,
  },
} as const

export type LayoutValidationError =
  | { zone: WidgetZone; code: 'too-few'; min: number; count: number }
  | { zone: WidgetZone; code: 'too-many'; max: number; count: number }

export function validateLayout(layout: DashboardLayout): LayoutValidationError[] {
  const errors: LayoutValidationError[] = []
  for (const zone of ['top', 'main'] as const) {
    const cfg = ZONE_CONFIG[zone]
    const count = layout[zone]?.length ?? 0
    if (count < cfg.minWidgets) errors.push({ zone, code: 'too-few', min: cfg.minWidgets, count })
    else if (count > cfg.maxWidgets) errors.push({ zone, code: 'too-many', max: cfg.maxWidgets, count })
  }
  return errors
}

export interface KpiData {
  netPnl: number
  totalTrades: number
  tradeWinRate: number
  winningTrades: number
  losingTrades: number
  breakevenTrades: number
  grossProfit: number
  grossLoss: number
  profitFactor: number
  dayWinRate: number
  winningDays: number
  losingDays: number
  breakevenDays: number
  tradingDays: number
  avgWin: number
  avgLoss: number
  avgWinLossRatio: number // avgWin / |avgLoss|
  avgRR: number
  maxDrawdown: number
  expectancy: number
  currentStreak: number
}

// Scatter chart point (per-trade)
export interface ScatterPoint {
  x: number
  pnl: number
}

export interface ZellaAxis {
  key: string
  label: string
  raw: number
  score: number
}

export interface ZellaData {
  score: number
  axes: ZellaAxis[]
}

export interface DailyPoint {
  date: string // yyyy-MM-dd
  pnl: number
  cumulative: number
  trades: number
}

export interface BucketPoint {
  bucket: string
  order: number
  pnl: number
  trades: number
  winRate: number
}

export interface SymbolPoint {
  symbol: string
  trades: number
  netPnl: number
  winRate: number
}

export interface DashboardWidgetData {
  kpi: KpiData
  zella: ZellaData
  daily: DailyPoint[] // for cumulative and net-daily
  timePerformance: BucketPoint[]
  durationPerformance: BucketPoint[]
  timeScatter: ScatterPoint[]
  durationScatter: ScatterPoint[]
  topSymbols: SymbolPoint[]
}

export interface CalendarDay {
  date: string // yyyy-MM-dd
  netPnl: number
  trades: number
  wins: number
  losses: number
  winRate: number
  rMultiple: number
  outcome: Outcome
}

export interface CalendarWeek {
  weekIndex: number
  netPnl: number
  tradingDays: number
  trades: number
}

export interface CalendarData {
  year: number
  month: number // 1–12
  days: CalendarDay[] // only days with trades
  weeks: CalendarWeek[]
  monthNetPnl: number
  monthTrades: number
  monthTradingDays: number
}

export interface DayTrade {
  id: string
  symbol: string
  direction: 'long' | 'short'
  netPnl: number
  time: string
  rMultiple: number | null
}

export interface DayDetailStats {
  netPnl: number
  totalTrades: number
  grossPnl: number
  wins: number
  losses: number
  winRate: number
  commissions: number
  volume: number
  profitFactor: number
}

export interface IntradayPoint {
  label: string // HH:mm
  cumulative: number
  pnl: number
}

export interface DayDetail {
  date: string
  stats: DayDetailStats
  trades: DayTrade[]
  cumulative: IntradayPoint[]
}

export type CalendarDayStat = 'rMultiple' | 'netPnl' | 'trades' | 'winRate'

export const CALENDAR_DAY_STATS: { key: CalendarDayStat; label: string }[] = [
  { key: 'rMultiple', label: 'R-multiple' },
  { key: 'netPnl', label: 'Daily P/L' },
  { key: 'trades', label: 'Number of trades' },
  { key: 'winRate', label: 'Day winrate' },
]

export interface CalendarSettings {
  stats: CalendarDayStat[]
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  stats: ['netPnl', 'trades', 'winRate'],
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))

export const ZELLA_TARGETS = {
  winRate: 60,
  profitFactorLo: 0.5, // PF 0.5 => 0
  profitFactorHi: 2.5, // PF 2.5 => 100
  avgWinLoss: 2,
  recoveryFactor: 3, // net/maxDD = 3 => 100
  consistencyBias: 1.25, // see scoreConsistency
}

export function scoreWinRate(winRatePct: number) {
  return clamp((winRatePct / ZELLA_TARGETS.winRate) * 100)
}
export function scoreProfitFactor(pf: number) {
  if (!isFinite(pf)) return 100
  const { profitFactorLo: lo, profitFactorHi: hi } = ZELLA_TARGETS
  return clamp(((pf - lo) / (hi - lo)) * 100)
}
export function scoreAvgWinLoss(ratio: number) {
  if (!isFinite(ratio)) return 100
  return clamp((ratio / ZELLA_TARGETS.avgWinLoss) * 100)
}
export function scoreRecoveryFactor(rf: number) {
  if (!isFinite(rf)) return 100
  return clamp((rf / ZELLA_TARGETS.recoveryFactor) * 100)
}
export function scoreMaxDrawdown(maxDD: number, grossProfit: number) {
  if (maxDD <= 0) return 100
  const denom = grossProfit > 0 ? grossProfit : maxDD
  return clamp((1 - maxDD / denom) * 100)
}
export function scoreConsistency(positiveDailyPnls: number[]) {
  const total = positiveDailyPnls.reduce((a, b) => a + b, 0)
  if (total <= 0 || positiveDailyPnls.length === 0) return 0
  const biggestShare = Math.max(...positiveDailyPnls) / total
  return clamp((1 - biggestShare) * ZELLA_TARGETS.consistencyBias * 100)
}
