import type { DataTableColumn } from '@/components/ui/DataTable'
import type { StrategyOverviewRow } from '@/lib/actions/strategies'
import { formatCurrency, cn } from '@/lib/utils'
import { t } from '@/i18n'

export const winRateText = (s: StrategyOverviewRow) => (s.tradeCount > 0 ? `${Math.round(s.winRate)}%` : '—')
export const adherenceText = (s: StrategyOverviewRow) => (s.adherence !== null ? `${Math.round(s.adherence)}%` : '—')

export const strategyColumns: DataTableColumn<StrategyOverviewRow>[] = [
  {
    key: 'name',
    header: t('strategies.list.name'),
    sortable: true,
    cellClassName: 'font-medium',
    cell: (s) => s.name,
  },
  {
    key: 'tradeCount',
    header: t('strategies.stats.trades'),
    sortable: true,
    align: 'right',
    cellClassName: 'tabular-nums',
    cell: (s) => s.tradeCount,
  },
  {
    key: 'netPnl',
    header: t('strategies.stats.netPnl'),
    sortable: true,
    align: 'right',
    cellClassName: (s) => cn('tabular-nums', s.netPnl > 0 ? 'text-profit' : s.netPnl < 0 ? 'text-loss' : undefined),
    cell: (s) => formatCurrency(s.netPnl),
  },
  {
    key: 'winRate',
    header: t('strategies.stats.winRate'),
    sortable: true,
    align: 'right',
    cellClassName: 'tabular-nums text-muted-foreground',
    cell: winRateText,
  },
  {
    key: 'adherence',
    header: t('strategies.stats.adherence'),
    sortable: true,
    align: 'right',
    cellClassName: 'tabular-nums text-muted-foreground',
    cell: adherenceText,
  },
]
