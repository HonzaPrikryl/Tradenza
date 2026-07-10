export function StrategiesListSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      {/* Toolbar: search (left) · view toggle + New (right) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="skeleton h-9 w-full max-w-xs rounded-md" />
        <div className="flex items-center gap-2">
          <div className="skeleton h-9 w-[68px] rounded-md" />
          <div className="skeleton h-9 w-32 rounded-md" />
        </div>
      </div>

      {/* Card grid (default view) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="skeleton h-5 w-32 rounded" />
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-1.5">
                  <div className="skeleton h-4 w-12 rounded" />
                  <div className="skeleton h-3 w-10 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StrategyDetailSkeleton() {
  return (
    <div className="w-full" aria-busy="true" aria-live="polite">
      {/* Back link */}
      <div className="skeleton mb-4 h-4 w-32 rounded" />

      {/* Header: title + actions */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="skeleton h-7 w-48 rounded" />
        <div className="flex items-center gap-2">
          <div className="skeleton h-8 w-24 rounded-md" />
          <div className="skeleton h-8 w-8 rounded-md" />
        </div>
      </div>

      {/* KPI tiles */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="skeleton h-6 w-16 rounded" />
            <div className="skeleton mt-1.5 h-3 w-14 rounded" />
          </div>
        ))}
      </div>

      {/* Equity curve */}
      <div className="mb-4">
        <div className="skeleton mb-3 h-4 w-40 rounded" />
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>

      {/* Recent trades */}
      <div className="mb-4">
        <div className="skeleton mb-3 h-4 w-28 rounded" />
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="skeleton h-4 w-24 rounded" />
                <div className="skeleton h-4 w-16 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
