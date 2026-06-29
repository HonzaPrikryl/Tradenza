'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X } from 'lucide-react'
import type { WidgetInstance } from '@/lib/dashboard/types'
import type { WidgetDef } from './widget-registry'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

interface Props {
  instance: WidgetInstance
  def: WidgetDef
  preview: React.ReactNode
  onRemove: () => void
}

export default function SortableWidgetCard({ instance, def, preview, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: instance.id })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 50 : undefined,
    willChange: isDragging ? 'transform' : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group relative h-full cursor-grab touch-none rounded-lg transition-shadow active:cursor-grabbing',
        isDragging && 'shadow-2xl ring-2 ring-primary/60',
      )}
      aria-label={t('dashboard.palette.dragToReorder', { label: def.label })}
    >
      <button
        type="button"
        onClick={onRemove}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute -right-2.5 -top-2.5 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-loss text-white shadow-md transition-colors hover:bg-loss/90"
        aria-label={t('dashboard.palette.removeWidget')}
      >
        <X className="h-4 w-4" />
      </button>

      <div className="pointer-events-none h-full select-none">{preview}</div>
    </div>
  )
}
