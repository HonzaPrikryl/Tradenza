'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import SortableTh from '@/components/ui/SortableTh'
import { useTableSort } from '@/hooks/useTableSort'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { UserOverviewRow } from '@/lib/actions/admin'

type SortKey =
  | 'id'
  | 'name'
  | 'email'
  | 'tradeCount'
  | 'journaledCount'
  | 'accountCount'
  | 'reviewCount'
  | 'createdAt'
  | 'lastActiveAt'

const SORT_KEYS: SortKey[] = [
  'id',
  'name',
  'email',
  'tradeCount',
  'journaledCount',
  'accountCount',
  'reviewCount',
  'createdAt',
  'lastActiveAt',
]
const STORAGE_KEY = 'tradenza-admin-users-sort'

interface Column {
  key: SortKey
  labelKey: string
  align: 'left' | 'right'
  kind: 'text' | 'num' | 'date'
  width: string
  muted?: boolean
  mono?: boolean
}

const COLUMNS: Column[] = [
  {
    key: 'id',
    labelKey: 'admin.users.columns.id',
    align: 'left',
    kind: 'text',
    width: 'w-[210px]',
    muted: true,
    mono: true,
  },
  { key: 'name', labelKey: 'admin.users.columns.name', align: 'left', kind: 'text', width: 'w-[150px]' },
  { key: 'email', labelKey: 'admin.users.columns.email', align: 'left', kind: 'text', width: 'w-[220px]', muted: true },
  { key: 'tradeCount', labelKey: 'admin.users.columns.trades', align: 'right', kind: 'num', width: 'w-[90px]' },
  {
    key: 'journaledCount',
    labelKey: 'admin.users.columns.journaled',
    align: 'right',
    kind: 'num',
    width: 'w-[100px]',
    muted: true,
  },
  { key: 'accountCount', labelKey: 'admin.users.columns.accounts', align: 'right', kind: 'num', width: 'w-[95px]' },
  {
    key: 'reviewCount',
    labelKey: 'admin.users.columns.reviews',
    align: 'right',
    kind: 'num',
    width: 'w-[90px]',
    muted: true,
  },
  {
    key: 'createdAt',
    labelKey: 'admin.users.columns.joined',
    align: 'left',
    kind: 'date',
    width: 'w-[110px]',
    muted: true,
  },
  {
    key: 'lastActiveAt',
    labelKey: 'admin.users.columns.lastActive',
    align: 'left',
    kind: 'date',
    width: 'w-[120px]',
    muted: true,
  },
]

function fullName(u: UserOverviewRow): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username || ''
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-CA')
}

function sortValue(u: UserOverviewRow, key: SortKey): string | number {
  switch (key) {
    case 'id':
      return u.id.toLowerCase()
    case 'name':
      return fullName(u).toLowerCase() || '￿'
    case 'email':
      return (u.email ?? '￿').toLowerCase()
    case 'createdAt':
      return u.createdAt ? new Date(u.createdAt).getTime() : 0
    case 'lastActiveAt':
      return u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : 0
    default:
      return u[key] as number
  }
}

function cellText(u: UserOverviewRow, key: SortKey): string {
  switch (key) {
    case 'id':
      return u.id
    case 'name':
      return fullName(u) || '—'
    case 'email':
      return u.email ?? '—'
    case 'createdAt':
      return formatDate(u.createdAt)
    case 'lastActiveAt':
      return formatDate(u.lastActiveAt)
    default:
      return String(u[key] as number)
  }
}

export default function AdminUsersTable({ users }: { users: UserOverviewRow[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const { sortBy, sortOrder, toggleSort } = useTableSort({
    storageKey: STORAGE_KEY,
    defaultSortBy: 'createdAt',
    defaultSortOrder: 'desc',
    validSortKeys: SORT_KEYS,
    orderForColumn: (column) => {
      const col = COLUMNS.find((c) => c.key === column)
      return col?.kind === 'text' ? 'asc' : 'desc'
    },
  })

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? users.filter((u) => [fullName(u), u.email ?? '', u.username ?? ''].some((f) => f.toLowerCase().includes(q)))
      : users
    const key = sortBy as SortKey
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, key)
      const vb = sortValue(b, key)
      if (va < vb) return sortOrder === 'asc' ? -1 : 1
      if (va > vb) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [users, query, sortBy, sortOrder])

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('admin.users.search')}
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {t('admin.users.count', { shown: rows.length, total: users.length })}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1185px] table-fixed text-sm">
          <colgroup>
            {COLUMNS.map((col) => (
              <col key={col.key} className={col.width} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              {COLUMNS.map((col) => (
                <SortableTh
                  key={col.key}
                  label={t(col.labelKey)}
                  column={col.key}
                  activeColumn={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                  align={col.align}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-muted-foreground">
                  {t('common.noResults')}
                </td>
              </tr>
            )}
            {rows.map((u) => (
              <tr
                key={u.id}
                onClick={() => router.push(`/admin/${u.id}`)}
                className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40"
              >
                {COLUMNS.map((col) => {
                  const text = cellText(u, col.key)
                  return (
                    <td
                      key={col.key}
                      title={col.kind === 'text' ? text : undefined}
                      className={cn(
                        'truncate px-4 py-3',
                        col.align === 'right' ? 'text-right tabular-nums' : 'text-left',
                        col.key === 'name' && 'font-medium',
                        col.muted && 'text-muted-foreground',
                        col.mono && 'font-mono text-xs',
                      )}
                    >
                      {text}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
