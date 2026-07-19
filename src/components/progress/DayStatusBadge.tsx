import { Sparkles, CircleAlert, TriangleAlert, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { DayStatus } from '@/lib/progress-compute'

const CONFIG: Record<DayStatus, { cls: string; icon: React.ReactNode }> = {
  green: { cls: 'bg-primary/15 text-primary', icon: <Sparkles className="h-3.5 w-3.5" /> },
  yellow: { cls: 'bg-amber-500/15 text-amber-500', icon: <CircleAlert className="h-3.5 w-3.5" /> },
  red: { cls: 'bg-loss/15 text-loss', icon: <TriangleAlert className="h-3.5 w-3.5" /> },
  none: { cls: 'bg-muted text-muted-foreground', icon: <Circle className="h-3.5 w-3.5" /> },
}

export default function DayStatusBadge({ status, className }: { status: DayStatus; className?: string }) {
  const c = CONFIG[status]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold', c.cls, className)}
    >
      {c.icon}
      {t(`progress.status.${status}`)}
    </span>
  )
}
