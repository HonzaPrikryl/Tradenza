'use client'

import { useMemo } from 'react'
import SortableTh from '@/components/ui/SortableTh'
import { useTableSort } from '@/hooks/useTableSort'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { FeedbackKind, FeedbackRow } from '@/lib/actions/feedback'

type SortKey = 'kind' | 'message' | 'user' | 'createdAt'
const SORT_KEYS: SortKey[] = ['kind', 'message', 'user', 'createdAt']
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

function sortValue(row: FeedbackRow, key: SortKey): string | number {
  switch (key) {
    case 'kind':
      return row.kind
    case 'message':
      return row.message.toLowerCase()
    case 'user':
      return (row.email ?? row.userId).toLowerCase()
    case 'createdAt':
      return new Date(row.createdAt).getTime()
  }
}

export default function AdminFeedbackTable({ items }: { items: FeedbackRow[] }) {
  const { sortBy, sortOrder, toggleSort } = useTableSort({
    storageKey: STORAGE_KEY,
    defaultSortBy: 'createdAt',
    defaultSortOrder: 'desc',
    validSortKeys: SORT_KEYS,
    orderForColumn: (column) => (column === 'createdAt' ? 'desc' : 'asc'),
  })

  const rows = useMemo(() => {
    const key = sortBy as SortKey
    return [...items].sort((a, b) => {
      const va = sortValue(a, key)
      const vb = sortValue(b, key)
      if (va < vb) return sortOrder === 'asc' ? -1 : 1
      if (va > vb) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [items, sortBy, sortOrder])

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <SortableTh
              label={t('admin.feedback.columns.kind')}
              column="kind"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortableTh
              label={t('admin.feedback.columns.message')}
              column="message"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortableTh
              label={t('admin.feedback.columns.user')}
              column="user"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortableTh
              label={t('admin.feedback.columns.date')}
              column="createdAt"
              activeColumn={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
              className="whitespace-nowrap"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id} className="border-b border-border align-top last:border-0">
              <td className="px-4 py-3">
                <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', KIND_CLASS[f.kind])}>
                  {t(`admin.feedback.kind.${f.kind}`)}
                </span>
              </td>
              <td className="max-w-md px-4 py-3">
                <div className="whitespace-pre-wrap break-words">{f.message}</div>
                {f.imageUrl && (
                  <a href={f.imageUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.imageUrl} alt="" className="max-h-24 rounded-md border border-border object-contain" />
                  </a>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{f.email ?? f.userId}</td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDateTime(f.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
