import AccountsTableCardSkeleton from '@/components/accounts/AccountsTableCardSkeleton'

// Skeleton mirrors /add-trade: page header + accounts table card.
export default function Loading() {
  return (
    <div className="p-4 sm:p-6 w-full" aria-busy="true" aria-live="polite">
      <div className="mb-6 space-y-2">
        <div className="skeleton h-6 w-48 rounded" />
        <div className="skeleton h-4 w-64 rounded" />
      </div>
      <AccountsTableCardSkeleton />
    </div>
  )
}
