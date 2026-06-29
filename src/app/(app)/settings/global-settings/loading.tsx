// Skeleton mirrors /settings/global-settings: card header + single form field.
export default function Loading() {
  return (
    <div className="p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <div className="skeleton h-5 w-40 rounded" />
          <div className="skeleton mt-2 h-4 w-64 rounded" />
        </div>
        <div className="max-w-md space-y-5 px-5 py-5">
          <div className="space-y-2">
            <div className="skeleton h-4 w-28 rounded" />
            <div className="skeleton h-10 w-full rounded-md" />
            <div className="skeleton h-3 w-48 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}
