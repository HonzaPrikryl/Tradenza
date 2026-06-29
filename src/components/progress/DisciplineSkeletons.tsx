// Skeletons for the /progress (Discipline) page.
//
// The full layout skeleton (stat cards + heatmap + breakdown) only makes sense
// once the user actually has active rules. A user with no rules sees a small
// empty state instead, so we must NOT show the heavy layout skeleton for them.
// The route-level loading.tsx therefore renders only the header skeleton, and
// the heavy layout skeleton is streamed via <Suspense> on the has-rules branch.

export function DisciplineHeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-2">
        <div className="skeleton h-6 w-40 rounded" />
        <div className="skeleton h-4 w-56 rounded" />
      </div>
      <div className="skeleton h-11 w-56 rounded-lg" />
    </div>
  )
}

export function DisciplineLayoutSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <DisciplineHeaderSkeleton />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex h-full min-h-[100px] flex-col rounded-xl border border-border bg-card px-4 py-3">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton mt-3 h-6 w-20 rounded" />
          </div>
        ))}
      </div>

      {/* Heatmap (left, wide) + day summary (right) */}
      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="skeleton h-5 w-28 rounded" />
              <div className="skeleton h-8 w-24 rounded-md" />
            </div>
            <div className="skeleton h-40 w-full rounded" />
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="skeleton mb-4 h-4 w-32 rounded" />
            <div className="skeleton h-28 w-full rounded" />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="skeleton mb-4 h-5 w-36 rounded" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="skeleton h-4 w-28 rounded" />
                <div className="skeleton h-4 w-12 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="skeleton mb-4 h-5 w-32 rounded" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-5 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
