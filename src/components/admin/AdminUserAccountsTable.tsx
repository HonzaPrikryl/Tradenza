'use client'

import { useMemo } from 'react'
import SortableTh from '@/components/ui/SortableTh'
import { useTableSort } from '@/hooks/useTableSort'
import { formatCurrency, cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { AdminUserDetail } from '@/lib/actions/admin'

type AccountRow = AdminUserDetail['accounts'][number]
const SORT_KEYS = ['name', 'firm', 'phase', 'tradeCount', 'netPnl'] as const
type SortKey = (typeof SORT_KEYS)[number]
const STORAGE_KEY = 'tradenza-admin-user-accounts-sort'

function sortValue(row: AccountRow, key: SortKey): string | number {
  switch (key) {
    case 'name':
      return row.name.toLowerCase()
    case 'firm':
      return (row.firm ?? '').toLowerCase()
    case 'phase':
      return (row.phase ?? '').toLowerCase()
    case 'tradeCount':
      return row.tradeCount
    case 'netPnl':
      return row.netPnl
  }
}

function pnlClass(v: number): string | undefined {
  if (v === 0) return undefined
  return v > 0 ? 'text-profit' : 'text-loss'
}

export default function AdminUserAccountsTable({ accounts }: { accounts: AccountRow[] }) {
  const { sortBy, sortOrder, toggleSort } = useTableSort({
    storageKey: STORAGE_KEY,
    defaultSortBy: 'tradeCount',
    defaultSortOrder: 'desc',
    validSortKeys: SORT_KEYS,
    orderForColumn: (column) => (column === 'tradeCount' || column === 'netPnl' ? 'desc' : 'asc'),
  })

  const rows = useMemo(() => {
    const key = sortBy as SortKey
    return [...accounts].sort((a, b) => {
      const va = sortValue(a, key)
      const vb = sortValue(b, key)
      if (va < vb) return sortOrder === 'asc' ? -1 : 1
      if (va > vb) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [accounts, sortBy, sortOrder])

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <SortableTh
              label={t('admin.user.accounts.columns.name')}
              column="name"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortableTh
              label={t('admin.user.accounts.columns.firm')}
              column="firm"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortableTh
              label={t('admin.user.accounts.columns.phase')}
              column="phase"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortableTh
              label={t('admin.user.accounts.columns.trades')}
              column="tradeCount"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
              align="right"
            />
            <SortableTh
              label={t('admin.user.accounts.columns.netPnl')}
              column="netPnl"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium">
                {a.name}
                {a.archived && (
                  <span className="ml-2 text-xs text-muted-foreground">({t('admin.user.accounts.archived')})</span>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{a.firm ?? '—'}</td>
              <td className="px-4 py-3 text-muted-foreground">{a.phase ?? '—'}</td>
              <td className="px-4 py-3 text-right tabular-nums">{a.tradeCount}</td>
              <td className={cn('px-4 py-3 text-right tabular-nums', pnlClass(a.netPnl))}>
                {formatCurrency(a.netPnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
