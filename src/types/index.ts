import { z } from 'zod'
import { t } from '@/i18n'

export const tradeFormSchema = z.object({
  symbol: z.string().min(1, t('validation.symbolRequired')).max(20).toUpperCase(),
  direction: z.enum(['long', 'short']),
  assetClass: z.enum(['stocks', 'futures', 'forex', 'crypto', 'options', 'other']).default('stocks'),
  status: z.enum(['open', 'closed', 'cancelled']).default('closed'),

  entryPrice: z.coerce.number().positive(t('validation.entryPricePositive')),
  entryQuantity: z.coerce.number().positive(t('validation.qtyPositive')),
  entryDatetime: z.string().min(1, t('validation.entryDateRequired')),

  exitPrice: z.coerce.number().positive().optional().or(z.literal('')),
  exitQuantity: z.coerce.number().positive().optional().or(z.literal('')),
  exitDatetime: z.string().optional(),

  fees: z.coerce.number().min(0).default(0),

  stopLoss: z.coerce.number().positive().optional().or(z.literal('')),
  takeProfit: z.coerce.number().positive().optional().or(z.literal('')),
  riskAmount: z.coerce.number().positive().optional().or(z.literal('')),

  notes: z.string().max(10000).optional(),
  rating: z.coerce.number().min(0.5).max(5).multipleOf(0.5).optional().or(z.literal('')),
  emotionBefore: z.string().max(500).optional(),
  emotionAfter: z.string().max(500).optional(),
  mistakes: z.string().max(2000).optional(),
  lessons: z.string().max(2000).optional(),
})

export type TradeFormValues = z.infer<typeof tradeFormSchema>

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
  sortBy?: 'entryDatetime' | 'netPnl' | 'symbol' | 'riskRewardRatio'
  sortOrder?: 'asc' | 'desc'
}
