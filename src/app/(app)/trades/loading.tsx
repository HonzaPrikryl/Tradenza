// Skeleton mirrors /trades: header + 4 stat cards + table.
export default function Loading() {
  return (
    <div className="p-4 sm:p-6" aria-busy="true" aria-live="polite">
      {/* Header (TradesHeader) */}
      <div className="mb-4 space-y-2">
        <div className="skeleton h-6 w-32 rounded" />
        <div className="skeleton h-4 w-48 rounded" />
      </div>

      {/* Stat cards (TradesStatsCards) */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex h-full min-h-[124px] flex-col rounded-xl border border-border bg-card px-4 py-3">
            <div className="border-b border-border/60 pb-2">
              <div className="skeleton h-3 w-24 rounded" />
            </div>
            <div className="flex flex-1 items-center justify-between gap-3 pt-2">
              <div className="skeleton h-6 w-20 rounded" />
              <div className="skeleton h-12 w-[88px] rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Table (TradesTable) */}
      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div className="skeleton h-8 w-full max-w-xs rounded-md" />
          <div className="skeleton h-8 w-24 shrink-0 rounded-md" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <div className="skeleton h-4 w-20 rounded" />
              <div className="skeleton h-4 flex-1 rounded" />
              <div className="skeleton hidden h-4 w-24 rounded sm:block" />
              <div className="skeleton h-4 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
