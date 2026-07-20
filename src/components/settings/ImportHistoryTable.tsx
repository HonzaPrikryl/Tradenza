'use client'

import DataTable, { type DataTableColumn } from '@/components/ui/DataTable'
import DeleteImportButton from '@/components/settings/DeleteImportButton'
import { getBroker } from '@/lib/brokers'
import { formatDateTime, cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { ImportHistoryRow } from '@/lib/actions/wizard'

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-profit/15 text-profit',
  partial: 'bg-amber-400/15 text-amber-400',
  failed: 'bg-loss/15 text-loss',
}

const brokerName = (r: ImportHistoryRow) => getBroker(r.broker ?? undefined)?.name ?? r.broker ?? '—'

const columns: DataTableColumn<ImportHistoryRow>[] = [
  {
    key: 'account',
    header: t('settings.importHistory.col.account'),
    sortable: true,
    sortValue: (r) => (r.accountName ?? '').toLowerCase(),
    cellClassName: 'font-medium text-foreground',
    cell: (r) => r.accountName ?? '—',
  },
  {
    key: 'broker',
    header: t('settings.importHistory.col.broker'),
    sortable: true,
    sortValue: (r) => brokerName(r).toLowerCase(),
    cellClassName: 'text-muted-foreground',
    cell: brokerName,
  },
  {
    key: 'uploadDate',
    header: t('settings.importHistory.col.uploadDate'),
    sortable: true,
    initialSortDir: 'desc',
    sortValue: (r) => new Date(r.uploadDate).getTime(),
    cellClassName: 'tabular whitespace-nowrap text-muted-foreground',
    cell: (r) => formatDateTime(new Date(r.uploadDate)),
  },
  {
    key: 'transactions',
    header: t('settings.importHistory.col.transactions'),
    sortable: true,
    align: 'right',
    initialSortDir: 'desc',
    sortValue: (r) => r.transactions,
    cellClassName: 'tabular',
    cell: (r) => r.transactions,
  },
  {
    key: 'trades',
    header: t('settings.importHistory.col.trades'),
    sortable: true,
    align: 'right',
    initialSortDir: 'desc',
    sortValue: (r) => r.trades,
    cellClassName: 'tabular',
    cell: (r) => r.trades,
  },
  {
    key: 'status',
    header: t('settings.importHistory.col.status'),
    sortable: true,
    sortValue: (r) => r.status,
    cell: (r) => (
      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLE[r.status])}>
        {t(`settings.importHistory.status.${r.status}`)}
      </span>
    ),
  },
]

export default function ImportHistoryTable({ rows }: { rows: ImportHistoryRow[] }) {
  return (
    <DataTable
      bordered={false}
      columns={columns}
      data={rows}
      rowKey={(r) => r.id}
      sortStorageKey="tradenza-import-history-sort"
      defaultSort={{ by: 'uploadDate', order: 'desc' }}
      empty={t('settings.importHistory.empty')}
      actions={(r) => <DeleteImportButton id={r.id} filename={r.filename} trades={r.trades} />}
    />
  )
}
