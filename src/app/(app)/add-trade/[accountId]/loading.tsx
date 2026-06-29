// Skeleton mirrors /add-trade/[accountId]: back link + header + mode switch + form.
export default function Loading() {
  return (
    <div className="p-6" aria-busy="true" aria-live="polite">
      <div className="mb-6 space-y-3">
        <div className="skeleton h-4 w-20 rounded" />
        <div className="skeleton h-6 w-40 rounded" />
        <div className="skeleton h-4 w-64 rounded" />
      </div>

      {/* Mode switch */}
      <div className="mb-8 inline-grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
        <div className="skeleton h-9 w-32 rounded-md" />
        <div className="skeleton h-9 w-32 rounded-md" />
      </div>

      {/* Form fields */}
      <div className="max-w-2xl space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-10 w-full rounded-md" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <div className="skeleton h-10 w-24 rounded-md" />
          <div className="skeleton h-10 w-32 rounded-md" />
        </div>
      </div>
    </div>
  )
}
