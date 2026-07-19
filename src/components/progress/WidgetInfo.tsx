'use client'

import { Info } from 'lucide-react'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import Tooltip from '@/components/ui/Tooltip'

// Small info affordance shown next to a widget's title. On hover OR keyboard focus
// it reveals a short plain-language description of the widget. Built on the shared
// Radix tooltip, which flips/shifts to stay inside the viewport (never clipped or
// running off the edge of the page).
export default function WidgetInfo({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip label={text} className={cn('max-w-[15rem] font-normal leading-relaxed text-muted-foreground', className)}>
      <button
        type="button"
        aria-label={t('progress.stats.info.label')}
        className="shrink-0 rounded text-muted-foreground/50 outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-primary/50"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  )
}
