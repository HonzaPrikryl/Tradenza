import { Sparkles, CircleAlert, TriangleAlert, Circle, Clock, Plane, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { DayStatus } from '@/lib/progress-compute'

// One display-only variant sits alongside the scored statuses:
//
//   'away' — the scorers report an away day as 'none' so every average and streak ignores
//            it, but grey "No activity" would be a lie on a day the user explicitly marked.
//
// `pending` now only ever means TODAY (see dayIsOpen), so it needs no second wording.
type BadgeState = DayStatus | 'away'

const CONFIG: Record<BadgeState, { cls: string; icon: React.ReactNode }> = {
  green: { cls: 'bg-primary/15 text-primary', icon: <Sparkles className="h-3.5 w-3.5" /> },
  yellow: { cls: 'bg-amber-500/15 text-amber-500', icon: <CircleAlert className="h-3.5 w-3.5" /> },
  red: { cls: 'bg-loss/15 text-loss', icon: <TriangleAlert className="h-3.5 w-3.5" /> },
  pending: { cls: 'bg-primary/10 text-primary/80', icon: <Clock className="h-3.5 w-3.5" /> },
  unlogged: { cls: 'bg-muted text-muted-foreground', icon: <PenLine className="h-3.5 w-3.5" /> },
  none: { cls: 'bg-muted text-muted-foreground', icon: <Circle className="h-3.5 w-3.5" /> },
  away: { cls: 'bg-sky-500/15 text-sky-400', icon: <Plane className="h-3.5 w-3.5" /> },
}

export default function DayStatusBadge({
  status,
  away = false,
  className,
}: {
  status: DayStatus
  /** Render the away variant instead of the scored status. */
  away?: boolean
  className?: string
}) {
  const state: BadgeState = away ? 'away' : status
  const c = CONFIG[state]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold', c.cls, className)}
    >
      {c.icon}
      {t(`progress.status.${state}`)}
    </span>
  )
}
