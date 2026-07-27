'use client'

import { useState } from 'react'
import { Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { RuleType } from '@/lib/progress-compute'

// Per-rule / per-habit consistency, shared by the trading breakdown and the Habits tab.
//
// The whole point of this component is that the two tiers are NOT comparable and must
// never be averaged into one list: a task's rate is "how often did you do it", a
// constraint's rate is "how often did you stay clean" (see the tasks-vs-constraints note
// in progress-compute). So they render as two labelled groups, each with its own scale
// caption, side by side when both exist. One implementation means the trading and habit
// breakdowns cannot drift apart again.
//
// The fill is always the "good" colour: a longer bar is better in BOTH groups, so a
// well-respected constraint no longer paints a misleading red bar. The tier is conveyed
// by the group heading rather than a per-row badge.

export interface ConsistencyItem {
  id: string
  name: string
  /** 'hard' = constraint (clean/respect rate), 'soft' = task (completion rate). */
  type: RuleType
  /** Good-day rate over tracked days, 0..1. */
  rate: number
  /** Tracked days behind `rate`. 0 → "no data", never a phantom 0%. */
  tracked: number
  /** Current compliance streak; shown as a flame when > 0. */
  streak: number
  /** Paused rules render dimmed. Defaults to active. */
  active?: boolean
}

function ConsistencyRow({ item, noDataLabel }: { item: ConsistencyItem; noDataLabel: string }) {
  const pct = Math.round(item.rate * 100)
  const noData = item.tracked === 0
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn('min-w-0 truncate text-foreground/90', item.active === false && 'opacity-55')}>
            {item.name}
          </span>
          {item.streak > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
              <Flame className="h-3 w-3 text-amber-500" />
              {item.streak}
            </span>
          )}
        </span>
        <span
          className={cn(
            'shrink-0 tabular font-semibold',
            noData ? 'text-muted-foreground/60' : 'text-muted-foreground',
          )}
        >
          {noData ? noDataLabel : `${pct}%`}
        </span>
      </div>
      {!noData && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary opacity-60 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

/** One titled group with its own scale caption and expand/collapse. */
function Group({
  title,
  sub,
  accent,
  items,
  limit,
  noDataLabel,
}: {
  title: string
  sub: string
  /** Constraint group — heading picks up the loss colour. */
  accent?: boolean
  items: ConsistencyItem[]
  limit: number
  noDataLabel: string
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, limit)
  const hidden = items.length - shown.length

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h4
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wide',
            accent ? 'text-loss/80' : 'text-muted-foreground',
          )}
        >
          {title}
        </h4>
        <span className="shrink-0 text-[10px] text-muted-foreground/70">{sub}</span>
      </div>
      <div className="space-y-2.5">
        {shown.map((i) => (
          <ConsistencyRow key={i.id} item={i} noDataLabel={noDataLabel} />
        ))}
        {(hidden > 0 || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 w-full rounded-md border border-dashed border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            {expanded ? t('progress.stats.showLess') : t('progress.stats.showMore', { count: hidden })}
          </button>
        )}
      </div>
    </div>
  )
}

export default function ConsistencyList({
  items,
  constraintTitle,
  constraintSub,
  taskTitle,
  taskSub,
  noDataLabel,
  limit = 4,
}: {
  items: ConsistencyItem[]
  /** Heading + scale caption for the constraint group ("Hard rules" / "Respect rate"). */
  constraintTitle: string
  constraintSub: string
  /** Heading + scale caption for the task group ("Soft habits" / "Completion rate"). */
  taskTitle: string
  taskSub: string
  /** Shown instead of a percentage when a row has no tracked day yet. */
  noDataLabel: string
  /** Rows shown per group before "show more". */
  limit?: number
}) {
  const constraints = items.filter((i) => i.type === 'hard')
  const tasks = items.filter((i) => i.type === 'soft')
  // Two columns only when both tiers exist; a lone tier takes the full width instead of
  // leaving a dead column. Stacks on narrow screens either way.
  const bothTiers = constraints.length > 0 && tasks.length > 0

  return (
    <div className={cn('grid grid-cols-1 gap-x-5 gap-y-4', bothTiers && 'sm:grid-cols-2')}>
      {constraints.length > 0 && (
        <Group
          title={constraintTitle}
          sub={constraintSub}
          accent
          items={constraints}
          limit={limit}
          noDataLabel={noDataLabel}
        />
      )}
      {tasks.length > 0 && (
        <Group title={taskTitle} sub={taskSub} items={tasks} limit={limit} noDataLabel={noDataLabel} />
      )}
    </div>
  )
}
