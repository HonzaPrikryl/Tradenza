import SkeletonTable, { type SkeletonColumn } from '@/components/ui/SkeletonTable'

// Mirrors the AccountsList table columns (name, broker, balance, last update, type, actions).
const ACCOUNT_COLUMNS: SkeletonColumn[] = [
  { head: 'w-16', cell: 'h-4 w-28' }, // name
  { head: 'w-14', cell: 'h-4 w-24' }, // broker
  { head: 'w-16', cell: 'h-4 w-20' }, // balance
  { head: 'w-20', cell: 'h-4 w-28' }, // last update
  { head: 'w-12', cell: 'h-4 w-16' }, // type
  { head: 'w-14', cell: 'h-8 w-16 rounded-md', align: 'right' }, // actions
]

/** Loading skeleton for the AccountsList card (used by /settings/accounts and /add-trade). */
export default function AccountsTableCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="skeleton h-5 w-40 rounded" />
          <div className="skeleton h-4 w-56 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="skeleton h-9 w-32 rounded-md" />
          <div className="skeleton h-8 w-8 rounded-md" />
        </div>
      </div>
      <SkeletonTable rows={5} columns={ACCOUNT_COLUMNS} />
    </div>
  )
}
