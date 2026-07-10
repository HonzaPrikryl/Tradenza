'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import SortableTh from '@/components/ui/SortableTh'
import { useTableSort } from '@/hooks/useTableSort'
import { formatCurrency, cn } from '@/lib/utils'
import { t } from '@/i18n'

export interface TradeTableRow {
  id: string
  symbol: string
  direction: string
  status: string
  netPnl: number | null
  entryDatetime: string
}

const SORT_KEYS = ['symbol', 'direction', 'status', 'entryDatetime', 'netPnl'] as const
type SortKey = (typeof SORT_KEYS)[number]

function formatDate(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-CA')
}

function pnlClass(v: number | null): string | undefined {
  if (v === null || v === 0) return undefined
  return v > 0 ? 'text-profit' : 'text-loss'
}

function sortValue(row: TradeTableRow, key: SortKey): string | number {
  switch (key) {
    case 'symbol':
      return row.symbol.toLowerCase()
    case 'direction':
      return row.direction.toLowerCase()
    case 'status':
      return row.status.toLowerCase()
    case 'entryDatetime':
      return new Date(row.entryDatetime).getTime()
    case 'netPnl':
      return row.netPnl ?? Number.NEGATIVE_INFINITY
  }
}

interface Props {
  trades: TradeTableRow[]
  storageKey: string
  /** i18n prefix for column labels, e.g. `strategies.detail.columns` */
  columnsKey: string
  /** When set, rows navigate to `${rowBasePath}/${id}` on click. Serializable so
      it can be passed from a Server Component. */
  rowBasePath?: string
}

export default function SortableTradesTable({ trades, storageKey, columnsKey, rowBasePath }: Props) {
  const router = useRouter()
  const { sortBy, sortOrder, toggleSort } = useTableSort({
    storageKey,
    defaultSortBy: 'entryDatetime',
    defaultSortOrder: 'desc',
    validSortKeys: SORT_KEYS,
    orderForColumn: (column) => (column === 'symbol' || column === 'direction' || column === 'status' ? 'asc' : 'desc'),
  })

  const rows = useMemo(() => {
    const key = sortBy as SortKey
    return [...trades].sort((a, b) => {
      const va = sortValue(a, key)
      const vb = sortValue(b, key)
      if (va < vb) return sortOrder === 'asc' ? -1 : 1
      if (va > vb) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [trades, sortBy, sortOrder])

  const col = (name: string) => t(`${columnsKey}.${name}`)

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <SortableTh
              label={col('symbol')}
              column="symbol"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortableTh
              label={col('direction')}
              column="direction"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortableTh
              label={col('status')}
              column="status"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortableTh
              label={col('entry')}
              column="entryDatetime"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortableTh
              label={col('netPnl')}
              column="netPnl"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((tr) => (
            <tr
              key={tr.id}
              onClick={rowBasePath ? () => router.push(`${rowBasePath}/${tr.id}`) : undefined}
              className={cn(
                'border-b border-border transition-colors last:border-0',
                rowBasePath && 'cursor-pointer hover:bg-muted/40',
              )}
            >
              <td className="px-4 py-3 font-medium">{tr.symbol}</td>
              <td className="px-4 py-3 capitalize text-muted-foreground">{tr.direction}</td>
              <td className="px-4 py-3 capitalize text-muted-foreground">{tr.status}</td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDate(tr.entryDatetime)}</td>
              <td className={cn('px-4 py-3 text-right tabular-nums', pnlClass(tr.netPnl))}>
                {tr.netPnl === null ? '—' : formatCurrency(tr.netPnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
