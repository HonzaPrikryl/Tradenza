'use client'

import { Check, X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import TimeField from '../TimeField'
import type { TimeRange } from '@/lib/global-filters-types'

// ── Checkbox ──
export function Box({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border',
        checked && 'border-primary bg-primary',
      )}
    >
      {checked && <Check className="h-3 w-3 text-primary-foreground" />}
    </span>
  )
}

export function TimeRangeRow({
  label,
  expanded,
  ranges,
  onToggle,
  onChange,
}: {
  label: string
  expanded: boolean
  ranges: TimeRange[]
  onToggle: () => void
  onChange: (r: TimeRange[]) => void
}) {
  const update = (i: number, patch: Partial<TimeRange>) =>
    onChange(ranges.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => onChange(ranges.filter((_, j) => j !== i))
  const add = () => onChange([...ranges, { from: '', to: '' }])
  return (
    <div className="rounded-md">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-accent"
      >
        <Box checked={expanded} />
        <span className={cn(expanded && 'font-medium')}>{label}</span>
      </button>
      {expanded && (
        <div className="mb-2 mt-1 space-y-2 pl-6">
          {ranges.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <TimeField value={r.from} onChange={(v) => update(i, { from: v })} />
              </div>
              <span className="text-xs text-muted-foreground">–</span>
              <div className="min-w-0 flex-1">
                <TimeField value={r.to} onChange={(v) => update(i, { to: v })} />
              </div>
              {i > 0 ? (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-loss/10 hover:text-loss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="w-7 shrink-0" />
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('filters.dayTime.addAnother')}
          </button>
        </div>
      )}
    </div>
  )
}
