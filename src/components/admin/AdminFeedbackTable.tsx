'use client'

import DataTable, { type DataTableColumn } from '@/components/ui/DataTable'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { FeedbackKind, FeedbackRow } from '@/lib/actions/feedback'

const STORAGE_KEY = 'tradenza-admin-feedback-sort'

const KIND_CLASS: Record<FeedbackKind, string> = {
  bug: 'bg-loss/15 text-loss',
  idea: 'bg-profit/15 text-profit',
  other: 'bg-muted text-muted-foreground',
}

function formatDateTime(value: Date): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-CA')
}

const columns: DataTableColumn<FeedbackRow>[] = [
  {
    key: 'kind',
    header: t('admin.feedback.columns.kind'),
    sortable: true,
    sortValue: (f) => f.kind,
    cell: (f) => (
      <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', KIND_CLASS[f.kind])}>
        {t(`admin.feedback.kind.${f.kind}`)}
      </span>
    ),
  },
  {
    key: 'message',
    header: t('admin.feedback.columns.message'),
    sortable: true,
    sortValue: (f) => f.message.toLowerCase(),
    cellClassName: 'max-w-md',
    cell: (f) => (
      <>
        <div className="whitespace-pre-wrap break-words">{f.message}</div>
        {f.imageUrl && (
          <a href={f.imageUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.imageUrl} alt="" className="max-h-24 rounded-md border border-border object-contain" />
          </a>
        )}
      </>
    ),
  },
  {
    key: 'user',
    header: t('admin.feedback.columns.user'),
    sortable: true,
    sortValue: (f) => (f.email ?? f.userId).toLowerCase(),
    cellClassName: 'text-muted-foreground',
    cell: (f) => f.email ?? f.userId,
  },
  {
    key: 'createdAt',
    header: t('admin.feedback.columns.date'),
    sortable: true,
    initialSortDir: 'desc',
    sortValue: (f) => new Date(f.createdAt).getTime(),
    headerClassName: 'whitespace-nowrap',
    cellClassName: 'whitespace-nowrap text-muted-foreground',
    cell: (f) => formatDateTime(f.createdAt),
  },
]

export default function AdminFeedbackTable({ items }: { items: FeedbackRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={items}
      rowKey={(f) => f.id}
      sortStorageKey={STORAGE_KEY}
      defaultSort={{ by: 'createdAt', order: 'desc' }}
      rowClassName={() => 'align-top'}
    />
  )
}
