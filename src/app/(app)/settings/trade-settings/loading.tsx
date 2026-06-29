// Skeleton mirrors /settings/trade-settings: card header + breakeven offset block
// (label, hint, mode toggle, From/To fields, reset button).
export default function Loading() {
  return (
    <div className="p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <div className="skeleton h-5 w-40 rounded" />
          <div className="skeleton mt-2 h-4 w-64 rounded" />
        </div>
        <div className="max-w-md space-y-6 px-5 py-5">
          <div>
            <div className="skeleton h-4 w-32 rounded" />
            <div className="skeleton mt-2 h-3 w-72 rounded" />

            {/* mode toggle */}
            <div className="skeleton mt-3 h-9 w-44 rounded-lg" />

            {/* From / To fields + reset */}
            <div className="mt-3 flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3 w-10 rounded" />
                <div className="skeleton h-9 w-full rounded-lg" />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3 w-10 rounded" />
                <div className="skeleton h-9 w-full rounded-lg" />
              </div>
              <div className="skeleton h-9 w-24 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
