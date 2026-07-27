'use client'

import { cn } from '@/lib/utils'
import { describeHeatCell, heatStatusTextClass, type HeatDaySummary } from '@/lib/progress-format'

// Body of a heatmap cell's tooltip, for both heatmaps. Renders `describeHeatCell` and
// nothing else — what a day says (and stays quiet about) is decided and tested there.
export default function HeatCellTooltip({ date, day }: { date: string; day: HeatDaySummary | undefined }) {
  const d = describeHeatCell(date, day)
  return (
    <>
      <div className="font-medium text-foreground">{d.date}</div>
      <div className="mt-0.5 space-y-0.5">
        <div className={cn('font-medium', heatStatusTextClass(d.statusKey ?? 'none'))}>{d.statusLabel}</div>
        {d.lines.map((line) => (
          <div key={line.text} className={line.tone === 'danger' ? 'text-loss' : 'text-muted-foreground'}>
            {line.text}
          </div>
        ))}
      </div>
    </>
  )
}
