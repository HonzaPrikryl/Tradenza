'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { UserOverviewRow } from '@/lib/actions/admin'

const STORAGE_KEY = 'tradenza-admin-users-sort'

function fullName(u: UserOverviewRow): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username || ''
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-CA')
}

/** Numeric column shared shape: right-aligned, sorted high-to-low first. */
function numColumn(
  key: 'tradeCount' | 'journaledCount' | 'accountCount' | 'reviewCount',
  labelKey: string,
  width: string,
  muted = false,
): DataTableColumn<UserOverviewRow> {
  return {
    key,
    header: t(labelKey),
    sortable: true,
    align: 'right',
    initialSortDir: 'desc',
    width,
    sortValue: (u) => u[key],
    cellClassName: cn('truncate tabular-nums', muted && 'text-muted-foreground'),
    cell: (u) => u[key],
  }
}

const columns: DataTableColumn<UserOverviewRow>[] = [
  {
    key: 'id',
    header: t('admin.users.columns.id'),
    sortable: true,
    width: 'w-[210px]',
    sortValue: (u) => u.id.toLowerCase(),
    cellTitle: (u) => u.id,
    cellClassName: 'truncate font-mono text-xs text-muted-foreground',
    cell: (u) => u.id,
  },
  {
    key: 'name',
    header: t('admin.users.columns.name'),
    sortable: true,
    width: 'w-[150px]',
    sortValue: (u) => fullName(u).toLowerCase() || '￿',
    cellTitle: (u) => fullName(u) || '—',
    cellClassName: 'truncate font-medium',
    cell: (u) => fullName(u) || '—',
  },
  {
    key: 'email',
    header: t('admin.users.columns.email'),
    sortable: true,
    width: 'w-[220px]',
    sortValue: (u) => (u.email ?? '￿').toLowerCase(),
    cellTitle: (u) => u.email ?? '—',
    cellClassName: 'truncate text-muted-foreground',
    cell: (u) => u.email ?? '—',
  },
  numColumn('tradeCount', 'admin.users.columns.trades', 'w-[90px]'),
  numColumn('journaledCount', 'admin.users.columns.journaled', 'w-[100px]', true),
  numColumn('accountCount', 'admin.users.columns.accounts', 'w-[95px]'),
  numColumn('reviewCount', 'admin.users.columns.reviews', 'w-[90px]', true),
  {
    key: 'createdAt',
    header: t('admin.users.columns.joined'),
    sortable: true,
    initialSortDir: 'desc',
    width: 'w-[110px]',
    sortValue: (u) => (u.createdAt ? new Date(u.createdAt).getTime() : 0),
    cellClassName: 'truncate text-muted-foreground',
    cell: (u) => formatDate(u.createdAt),
  },
  {
    key: 'lastActiveAt',
    header: t('admin.users.columns.lastActive'),
    sortable: true,
    initialSortDir: 'desc',
    width: 'w-[120px]',
    sortValue: (u) => (u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : 0),
    cellClassName: 'truncate text-muted-foreground',
    cell: (u) => formatDate(u.lastActiveAt),
  },
]

export default function AdminUsersTable({ users }: { users: UserOverviewRow[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => [fullName(u), u.email ?? '', u.username ?? ''].some((f) => f.toLowerCase().includes(q)))
  }, [users, query])

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

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(u) => u.id}
        sortStorageKey={STORAGE_KEY}
        defaultSort={{ by: 'createdAt', order: 'desc' }}
        onRowClick={(u) => router.push(`/admin/${u.id}`)}
        tableClassName="min-w-[1185px] table-fixed"
      />
    </div>
  )
}
