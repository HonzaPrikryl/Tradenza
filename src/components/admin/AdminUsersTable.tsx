'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, ArrowDown, Search } from 'lucide-react'
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

interface Column {
  key: SortKey
  label: string
  align: 'left' | 'right'
  kind: 'text' | 'num' | 'date'
  width: string
  muted?: boolean
  mono?: boolean
}

const COLUMNS: Column[] = [
  { key: 'id', label: 'ID', align: 'left', kind: 'text', width: 'w-[210px]', muted: true, mono: true },
  { key: 'name', label: 'User', align: 'left', kind: 'text', width: 'w-[150px]' },
  { key: 'email', label: 'Email', align: 'left', kind: 'text', width: 'w-[220px]', muted: true },
  { key: 'tradeCount', label: 'Trades', align: 'right', kind: 'num', width: 'w-[90px]' },
  { key: 'journaledCount', label: 'Journaled', align: 'right', kind: 'num', width: 'w-[100px]', muted: true },
  { key: 'accountCount', label: 'Accounts', align: 'right', kind: 'num', width: 'w-[95px]' },
  { key: 'reviewCount', label: 'Reviews', align: 'right', kind: 'num', width: 'w-[90px]', muted: true },
  { key: 'createdAt', label: 'Joined', align: 'left', kind: 'date', width: 'w-[110px]', muted: true },
  { key: 'lastActiveAt', label: 'Last active', align: 'left', kind: 'date', width: 'w-[120px]', muted: true },
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
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      const col = COLUMNS.find((c) => c.key === key)
      setSortDir(col?.kind === 'text' ? 'asc' : 'desc')
    }
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? users.filter((u) => [fullName(u), u.email ?? '', u.username ?? ''].some((f) => f.toLowerCase().includes(q)))
      : users
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey)
      const vb = sortValue(b, sortKey)
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [users, query, sortKey, sortDir])

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {rows.length} of {users.length}
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
              {COLUMNS.map((col) => {
                const active = col.key === sortKey
                return (
                  <th
                    key={col.key}
                    className={cn('px-4 py-3 font-medium', col.align === 'right' ? 'text-right' : 'text-left')}
                  >
                    <button
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                        col.align === 'right' && 'flex-row-reverse',
                        active && 'text-foreground',
                      )}
                    >
                      <span className="truncate">{col.label}</span>
                      <span className="inline-flex w-3 shrink-0 justify-center">
                        {active &&
                          (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </span>
                    </button>
                  </th>
                )
              })}
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
