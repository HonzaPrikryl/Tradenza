import { DisciplineHeaderSkeleton } from '@/components/progress/DisciplineSkeletons'

// Only the header is common to both states (rules vs. empty). The heavy layout
// skeleton would be wrong for a user with no rules, so it is NOT shown here — it
// is streamed via <Suspense> on the has-rules branch of the page instead.
export default function Loading() {
  return (
    <div className="p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <DisciplineHeaderSkeleton />
    </div>
  )
}
