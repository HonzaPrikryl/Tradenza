'use client'

import * as Popover from '@radix-ui/react-popover'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { Settings2, Check, RotateCcw, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { SIDEBAR_LISTS, STANDALONE_TOGGLES, type SidebarListId } from '@/lib/trade-sidebar'
import { useMediaQuery } from '@mui/system'

const LABEL_BY_KEY = new Map<string, string>(
  [...STANDALONE_TOGGLES, ...SIDEBAR_LISTS.flatMap((l) => l.items)].map((i) => [i.key, i.labelKey]),
)

function ToggleRow({
  itemKey,
  visible,
  onToggle,
  draggable = false,
}: {
  itemKey: string
  visible: boolean
  onToggle: (key: string) => void
  draggable?: boolean
}) {
  const sortable = useSortable({ id: itemKey, disabled: !draggable })
  const style: React.CSSProperties = draggable
    ? {
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.isDragging ? 'none' : sortable.transition,
        zIndex: sortable.isDragging ? 50 : undefined,
      }
    : {}

  return (
    <div
      ref={draggable ? sortable.setNodeRef : undefined}
      style={style}
      className={cn(
        'flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-accent',
        // ring-inset so the active highlight isn't clipped by the popover's overflow on narrow widths
        draggable && sortable.isDragging && 'bg-accent shadow-md ring-2 ring-inset ring-primary/60',
      )}
    >
      {draggable && (
        <button
          type="button"
          aria-label={t('trades.detail.sidebar.dragToReorder')}
          className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={visible}
        onClick={() => onToggle(itemKey)}
        className={cn('flex flex-1 items-center gap-2 py-1.5 text-left text-sm', !draggable && 'pl-2')}
      >
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
            visible ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
          )}
        >
          {visible && <Check className="h-3 w-3" />}
        </span>
        <span className={cn('truncate', !visible && 'text-muted-foreground')}>
          {t(LABEL_BY_KEY.get(itemKey) ?? itemKey)}
        </span>
      </button>
    </div>
  )
}

function SortableList({
  listId,
  labelKey,
  order,
  hidden,
  onToggle,
  onReorder,
}: {
  listId: SidebarListId
  labelKey: string
  order: string[]
  hidden: Set<string>
  onToggle: (key: string) => void
  onReorder: (listId: SidebarListId, keys: string[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = order.indexOf(String(active.id))
    const to = order.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    onReorder(listId, arrayMove(order, from, to))
  }

  return (
    <div className="mb-1">
      <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {t(labelKey)}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          {order.map((key) => (
            <ToggleRow key={key} itemKey={key} visible={!hidden.has(key)} onToggle={onToggle} draggable />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

export default function SidebarSettings({
  hidden,
  order,
  onToggle,
  onReorder,
  onReset,
  dirty,
}: {
  hidden: Set<string>
  order: Record<SidebarListId, string[]>
  onToggle: (key: string) => void
  onReorder: (listId: SidebarListId, keys: string[]) => void
  onReset: () => void
  dirty: boolean
}) {
  const matches = useMediaQuery('(min-width: 1280px)')
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t('trades.detail.sidebar.customize')}
          title={t('trades.detail.sidebar.customize')}
          className="flex w-9 shrink-0 items-center justify-center self-stretch rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={matches ? 'right' : 'bottom'}
          align={matches ? 'start' : 'end'}
          sideOffset={16}
          className="z-50 w-64 rounded-xl border border-border bg-popover p-2 shadow-xl animate-fade-in"
        >
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('trades.detail.sidebar.customize')}
            </span>
            {dirty && (
              <button
                type="button"
                onClick={onReset}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                {t('trades.detail.sidebar.reset')}
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {STANDALONE_TOGGLES.length > 0 && (
              <div className="mb-1">
                {STANDALONE_TOGGLES.map((item) => (
                  <ToggleRow key={item.key} itemKey={item.key} visible={!hidden.has(item.key)} onToggle={onToggle} />
                ))}
              </div>
            )}
            {SIDEBAR_LISTS.map((list) => (
              <SortableList
                key={list.id}
                listId={list.id}
                labelKey={list.labelKey}
                order={order[list.id] ?? []}
                hidden={hidden}
                onToggle={onToggle}
                onReorder={onReorder}
              />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
