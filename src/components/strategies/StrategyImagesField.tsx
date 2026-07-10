'use client'

import { useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, ImagePlus, Loader2, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { uploadNoteImage } from '@/lib/actions/uploads'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

const MAX = 8

interface Props {
  value: string[]
  onChange: (urls: string[]) => void
}

export default function StrategyImagesField({ value, onChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const toggleSelect = (url: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })

  const removeOne = (url: string) => {
    onChange(value.filter((u) => u !== url))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(url)
      return next
    })
  }

  const removeSelected = () => {
    onChange(value.filter((u) => !selected.has(u)))
    setSelected(new Set())
  }

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = value.indexOf(active.id as string)
    const to = value.indexOf(over.id as string)
    if (from === -1 || to === -1) return
    onChange(arrayMove(value, from, to))
  }

  async function onPick(ev: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(ev.target.files ?? [])
    ev.target.value = ''
    if (files.length === 0) return
    const room = MAX - value.length
    if (room <= 0) return
    if (files.length > room) toast.error(t('strategies.form.limitReached', { max: MAX }))

    setUploading(true)
    const uploaded: string[] = []
    try {
      for (const file of files.slice(0, room)) {
        const fd = new FormData()
        fd.set('file', file)
        const res = await uploadNoteImage(fd)
        if (handleRateLimit(res)) break
        if (res.status === 'ok') uploaded.push(res.url)
        else if (res.status === 'notConfigured') {
          toast.error(t('strategies.form.imageUnavailable'))
          break
        } else toast.error(res.message ?? t('strategies.form.imageUnavailable'))
      }
    } catch {
      toast.error(t('strategies.form.imageUnavailable'))
    } finally {
      if (uploaded.length > 0) onChange([...value, ...uploaded])
      setUploading(false)
    }
  }

  const selectedCount = selected.size

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{t('strategies.form.images')}</label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value.length} / {MAX}
        </span>
      </div>

      {selectedCount > 0 && (
        <div className="mb-4 flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">{t('strategies.form.selected', { count: selectedCount })}</span>
          <button
            type="button"
            onClick={removeSelected}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium text-muted-foreground transition-colors hover:border-loss/40 hover:text-loss"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('strategies.form.removeSelected')}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('strategies.form.clearSelection')}
          </button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={value} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap gap-4">
            {value.map((url) => (
              <Thumb
                key={url}
                url={url}
                selected={selected.has(url)}
                onToggle={() => toggleSelect(url)}
                onRemove={() => removeOne(url)}
              />
            ))}

            {value.length < MAX && (
              <label
                className={cn(
                  'flex h-20 w-20 cursor-pointer flex-col items-center text-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  uploading && 'pointer-events-none opacity-60',
                )}
              >
                <input type="file" accept="image/*" multiple hidden onChange={onPick} disabled={uploading} />
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {uploading ? t('strategies.form.uploading') : t('strategies.form.attachImages')}
              </label>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {value.length > 1 && <p className="mt-1.5 text-xs text-muted-foreground">{t('strategies.form.dragToReorder')}</p>}
    </div>
  )
}

function Thumb({
  url,
  selected,
  onToggle,
  onRemove,
}: {
  url: string
  selected: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url })
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 30 : undefined,
  }

  const stop = (e: React.PointerEvent) => e.stopPropagation()

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* The image is the drag handle. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        {...attributes}
        {...listeners}
        className={cn(
          'h-20 w-20 cursor-grab touch-none select-none rounded-md border border-border object-cover active:cursor-grabbing',
          selected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
          isDragging && 'opacity-80 shadow-2xl',
        )}
      />

      {/* Selection toggle (top-left). */}
      <button
        type="button"
        onPointerDown={stop}
        onClick={onToggle}
        aria-label={t('strategies.form.selectImage')}
        className={cn(
          'absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border shadow transition-colors',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-card text-transparent hover:text-muted-foreground',
        )}
      >
        <Check className="h-3 w-3" />
      </button>

      {/* Remove (top-right). */}
      <button
        type="button"
        onPointerDown={stop}
        onClick={onRemove}
        aria-label={t('strategies.form.removeImage')}
        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow transition-colors hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
