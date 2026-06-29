import SkeletonTable from '@/components/ui/SkeletonTable'

// Skeleton mirrors /settings/import-history: card header + 7-column table.
export default function Loading() {
  return (
    <div className="p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <div className="skeleton h-5 w-40 rounded" />
          <div className="skeleton mt-2 h-4 w-64 rounded" />
        </div>
        <SkeletonTable
          rows={6}
          headerRowClassName="border-b border-border bg-muted/30"
          columns={[
            { head: 'w-16', cell: 'h-4 w-24' }, // account
            { head: 'w-14', cell: 'h-4 w-20' }, // broker
            { head: 'w-20', cell: 'h-4 w-32' }, // upload date
            { head: 'w-20', cell: 'h-4 w-10', align: 'right' }, // transactions
            { head: 'w-12', cell: 'h-4 w-10', align: 'right' }, // trades
            { head: 'w-12', cell: 'h-5 w-16 rounded-full' }, // status pill
            { head: 'w-14', cell: 'h-8 w-8 rounded-md', align: 'right' }, // actions
          ]}
        />
      </div>
    </div>
  )
}
