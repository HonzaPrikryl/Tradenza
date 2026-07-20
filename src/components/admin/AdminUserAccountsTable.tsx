'use client'

import DataTable, { type DataTableColumn } from '@/components/ui/DataTable'
import { formatCurrency } from '@/lib/utils'
import { t } from '@/i18n'
import type { AdminUserDetail } from '@/lib/actions/admin'

type AccountRow = AdminUserDetail['accounts'][number]
const STORAGE_KEY = 'tradenza-admin-user-accounts-sort'

function pnlClass(v: number): string | undefined {
  if (v === 0) return undefined
  return v > 0 ? 'text-profit' : 'text-loss'
}

const columns: DataTableColumn<AccountRow>[] = [
  {
    key: 'name',
    header: t('admin.user.accounts.columns.name'),
    sortable: true,
    sortValue: (a) => a.name.toLowerCase(),
    cellClassName: 'font-medium',
    cell: (a) => (
      <>
        {a.name}
        {a.archived && (
          <span className="ml-2 text-xs text-muted-foreground">({t('admin.user.accounts.archived')})</span>
        )}
      </>
    ),
  },
  {
    key: 'firm',
    header: t('admin.user.accounts.columns.firm'),
    sortable: true,
    sortValue: (a) => (a.firm ?? '').toLowerCase(),
    cellClassName: 'text-muted-foreground',
    cell: (a) => a.firm ?? '—',
  },
  {
    key: 'phase',
    header: t('admin.user.accounts.columns.phase'),
    sortable: true,
    sortValue: (a) => (a.phase ?? '').toLowerCase(),
    cellClassName: 'text-muted-foreground',
    cell: (a) => a.phase ?? '—',
  },
  {
    key: 'tradeCount',
    header: t('admin.user.accounts.columns.trades'),
    sortable: true,
    align: 'right',
    initialSortDir: 'desc',
    sortValue: (a) => a.tradeCount,
    cellClassName: 'tabular-nums',
    cell: (a) => a.tradeCount,
  },
  {
    key: 'netPnl',
    header: t('admin.user.accounts.columns.netPnl'),
    sortable: true,
    align: 'right',
    initialSortDir: 'desc',
    sortValue: (a) => a.netPnl,
    cellClassName: (a) => `tabular-nums ${pnlClass(a.netPnl) ?? ''}`,
    cell: (a) => formatCurrency(a.netPnl),
  },
]

export default function AdminUserAccountsTable({ accounts }: { accounts: AccountRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={accounts}
      rowKey={(a) => a.id}
      sortStorageKey={STORAGE_KEY}
      defaultSort={{ by: 'tradeCount', order: 'desc' }}
    />
  )
}
