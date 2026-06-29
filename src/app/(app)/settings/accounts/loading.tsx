import AccountsTableCardSkeleton from '@/components/accounts/AccountsTableCardSkeleton'

// Skeleton mirrors /settings/accounts: accounts table card.
export default function Loading() {
  return (
    <div className="p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <AccountsTableCardSkeleton />
    </div>
  )
}
