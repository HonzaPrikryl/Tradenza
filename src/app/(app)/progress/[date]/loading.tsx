// Skeleton mirrors /progress/[date]: header + 8 stat cards + 3-col panels.
export default function Loading() {
  return (
    <div className="p-4 sm:p-6" aria-busy="true" aria-live="polite">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="skeleton h-9 w-9 rounded-md" />
          <div className="skeleton h-6 w-44 rounded" />
          <div className="skeleton h-5 w-20 rounded" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card px-3 py-2.5">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton mt-2 h-5 w-20 rounded" />
          </div>
        ))}
      </div>

      {/* Panels: running P&L, trades, rules */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
            <div className="skeleton mb-3 h-4 w-28 rounded" />
            <div className="skeleton h-56 w-full rounded" />
          </div>
        ))}
      </div>

      {/* Daily note editor */}
      <div className="mt-5 rounded-xl border border-border bg-card">
        {/* Header (title + save badge) */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="skeleton h-4 w-28 rounded" />
          <div className="skeleton h-4 w-16 rounded" />
        </div>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-3 py-2">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="skeleton h-7 w-7 rounded" />
          ))}
        </div>
        {/* Editing area */}
        <div className="p-4">
          <div className="skeleton h-48 w-full rounded" />
        </div>
      </div>
    </div>
  )
}
