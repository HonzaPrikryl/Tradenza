import type { DataTableColumn } from '@/components/ui/DataTable'
import { cn, formatCurrency, formatDateTime } from '@/lib/utils'
import { getBroker } from '@/lib/brokers'
import { t } from '@/i18n'
import type { AccountWithStats } from '@/lib/actions/accounts'

/** Effective balance shown in the list: starting capital plus realised P&L. */
export const balanceOf = (a: AccountWithStats): number => (a.startingBalance ? Number(a.startingBalance) : 0) + a.netPnl

/**
 * Column definitions for the trading accounts table. Sorting is done by the
 * parent (persisted via `useTableSort`), so these columns only describe how a
 * row renders; row actions live with the component that owns their handlers.
 */
export const accountColumns: DataTableColumn<AccountWithStats>[] = [
  {
    key: 'name',
    header: t('tradingAccounts.col.name'),
    sortable: true,
    cell: (r) => (
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">{r.name}</span>
        {r.archived && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t('tradingAccounts.archived')}
          </span>
        )}
      </div>
    ),
  },
  {
    key: 'broker',
    header: t('tradingAccounts.col.broker'),
    cell: (r) => {
      const broker = getBroker(r.broker ?? undefined)
      return (
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold',
              broker?.className ?? 'bg-primary/15 text-primary',
            )}
          >
            {broker?.short ?? (r.firm?.charAt(0) || 'T')}
          </span>
          <span className="text-muted-foreground">{broker?.name ?? r.firm ?? t('tradingAccounts.genericBroker')}</span>
        </div>
      )
    },
  },
  {
    key: 'balance',
    header: t('tradingAccounts.col.balance'),
    sortable: true,
    cell: (r) => {
      const balance = balanceOf(r)
      return (
        <span className={cn('tabular', balance >= 0 ? 'text-foreground' : 'text-loss')}>
          {formatCurrency(balance, r.currency)}
        </span>
      )
    },
  },
  {
    key: 'lastUpdate',
    header: t('tradingAccounts.col.lastUpdate'),
    cellClassName: 'tabular text-muted-foreground',
    cell: (r) => (r.lastTradeAt ? formatDateTime(new Date(r.lastTradeAt)) : '—'),
  },
  {
    key: 'type',
    header: t('tradingAccounts.col.type'),
    cellClassName: 'text-muted-foreground',
    cell: (r) => (r.importedCount > 0 ? t('tradingAccounts.type.fileUpload') : t('tradingAccounts.type.manual')),
  },
]
