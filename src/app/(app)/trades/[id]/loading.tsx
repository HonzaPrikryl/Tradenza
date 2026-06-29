// Skeleton mirrors /trades/[id]: header + sidebar stats + chart + notes.
export default function Loading() {
  return (
    <div className="p-4 lg:p-6" aria-busy="true" aria-live="polite">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="skeleton h-9 w-9 rounded-md" />
          <div className="skeleton h-6 w-24 rounded" />
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-5 w-14 rounded" />
        </div>
        <div className="skeleton h-9 w-12 rounded-md" />
      </div>

      {/* Body: sidebar + main */}
      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <aside className="w-full shrink-0 space-y-4 xl:w-[340px]">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="skeleton mb-4 h-4 w-28 rounded" />
            <div className="space-y-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="skeleton h-3 w-24 rounded" />
                  <div className="skeleton h-3 w-16 rounded" />
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="w-full min-w-0 flex-1 space-y-4">
          <div className="skeleton h-[480px] w-full rounded-xl lg:h-[560px]" />
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex gap-2">
              <div className="skeleton h-8 w-24 rounded-md" />
              <div className="skeleton h-8 w-24 rounded-md" />
            </div>
            <div className="skeleton h-32 w-full rounded" />
          </div>
        </section>
      </div>
    </div>
  )
}
