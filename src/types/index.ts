// ─── Stats types ──────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  totalNetPnl: number
  totalGrossPnl: number
  totalFees: number
  avgNetPnl: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  avgRR: number
  maxWin: number
  maxLoss: number
  maxDrawdown: number
  currentStreak: number
  bestSymbol: string | null
}

export interface PnlDataPoint {
  date: string
  pnl: number
  cumulative: number
  trades: number
}

export interface SymbolStats {
  symbol: string
  trades: number
  netPnl: number
  winRate: number
}

export type { StatsBundle, MonthStat, PlType } from '@/lib/stats-compute'

export interface StatsData {
  gross: import('@/lib/stats-compute').StatsBundle
  net: import('@/lib/stats-compute').StatsBundle
  openTrades: number
  dateRangeLabel: string | null
  currency: string
}

// ─── Filter types ─────────────────────────────────────────────────────────────

export interface TradeFilters {
  search?: string
  direction?: 'long' | 'short' | 'all'
  status?: 'open' | 'closed' | 'cancelled' | 'all'
  assetClass?: string
  tagId?: string
  strategyId?: string
  dateFrom?: string
  dateTo?: string
  minPnl?: number
  maxPnl?: number
  page?: number
  pageSize?: number
  /** `riskRewardRatio` is the legacy alias for `rMultiple` (old URLs/cookies). */
  sortBy?: 'entryDatetime' | 'netPnl' | 'symbol' | 'rMultiple' | 'riskRewardRatio'
  sortOrder?: 'asc' | 'desc'
}
