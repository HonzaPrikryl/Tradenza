import { StrategyDetailSkeleton } from '@/components/strategies/StrategiesSkeletons'

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 w-full">
      <StrategyDetailSkeleton />
    </div>
  )
}
