'use client'

import TradesTable from './TradesTable'
import { useUrlTableSort } from '@/hooks/useUrlTableSort'
import type { Trade } from '@/lib/db'
import type { TradeFilters } from '@/types'
import type { TagGroupWithValues } from '@/lib/actions/tags'
import type { StrategyDTO } from '@/lib/actions/strategies'
import type { BreakevenConfig } from '@/lib/breakeven'

// `riskRewardRatio` stays valid so bookmarked URLs and the persisted sort from
// before the R column switched to the realized R-multiple keep working.
const TRADE_SORT_KEYS = ['entryDatetime', 'netPnl', 'symbol', 'rMultiple', 'riskRewardRatio'] as const

interface Props {
  trades: (Trade & {
    tradeTags?: { tag: { id: string; name: string; color: string } }[]
    strategy?: { id: string; name: string; color: string } | null
  })[]
  total: number
  page: number
  totalPages: number
  pageSize?: number
  currency?: string
  timezone?: string | null
  accounts?: { id: string; name: string }[]
  tagGroups?: TagGroupWithValues[]
  strategies?: StrategyDTO[]
  listFilters?: TradeFilters
  breakeven?: BreakevenConfig | null
}

export default function TradesTableClient(props: Props) {
  const { sortBy, sortOrder, handleSort } = useUrlTableSort({
    pathname: '/trades',
    storageKey: 'tradenza-trades-sort',
    defaultSortBy: 'entryDatetime',
    defaultSortOrder: 'desc',
    validSortKeys: TRADE_SORT_KEYS,
  })

  // Normalise the legacy key so the R column still renders as the active one.
  const activeSortBy = sortBy === 'riskRewardRatio' ? 'rMultiple' : sortBy

  return <TradesTable {...props} sortBy={activeSortBy} sortOrder={sortOrder} onSort={handleSort} />
}
