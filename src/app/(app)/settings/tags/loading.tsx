import SkeletonTable, { type SkeletonColumn } from '@/components/ui/SkeletonTable'

// Categories tab table columns: checkbox, category name, color, actions.
const CATEGORY_COLUMNS: SkeletonColumn[] = [
  { head: 'w-4', cell: 'h-4 w-4' }, // checkbox
  { head: 'w-24', cell: 'h-4 w-32' }, // category name
  { head: 'w-12', cell: 'h-4 w-20' }, // color
  { head: 'w-4', cell: 'h-8 w-8 rounded-md', align: 'right' }, // actions
]

// Skeleton mirrors /settings/tags: tab switch + card (header, toolbar, table).
export default function Loading() {
  return (
    <div className="p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <div className="space-y-5">
        {/* Tabs (Categories / Tags) */}
        <div className="inline-flex gap-1 rounded-lg border border-border bg-card p-1">
          <div className="skeleton h-9 w-28 rounded-md" />
          <div className="skeleton h-9 w-20 rounded-md" />
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card">
          {/* Card header */}
          <div className="border-b border-border px-5 py-4">
            <div className="skeleton h-5 w-40 rounded" />
            <div className="skeleton mt-2 h-4 w-64 rounded" />
          </div>

          {/* Toolbar */}
          <div className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="skeleton h-3 w-12 rounded" />
              <div className="skeleton h-9 w-36 rounded-md" />
            </div>
            <div className="flex items-center gap-2">
              <div className="skeleton h-9 w-56 rounded-md" />
              <div className="skeleton h-9 w-32 rounded-md" />
            </div>
          </div>

          {/* Table */}
          <SkeletonTable rows={6} columns={CATEGORY_COLUMNS} headerRowClassName="border-y border-border bg-muted/30" />
        </div>
      </div>
    </div>
  )
}
