'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { X, Save, AlertTriangle, Loader2, MoreHorizontal, Pencil, Trash2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import type { CSSProperties } from 'react'
import {
  ZONE_CONFIG,
  validateLayout,
  DEFAULT_CALENDAR_SETTINGS,
  MAIN_ROW_HEIGHT,
  type DashboardLayout,
  type WidgetInstance,
  type WidgetType,
  type WidgetZone,
  type DashboardTemplateDTO,
  type LayoutValidationError,
} from '@/lib/dashboard/types'
import { saveTemplate, renameTemplate, deleteTemplate } from '@/lib/actions/dashboard'
import { track } from '@/lib/analytics'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { t, tRich } from '@/i18n'
import { getWidgetDef, MAIN_WIDGETS } from './widget-registry'
import ErrorBoundary from '@/components/ErrorBoundary'
import SortableWidgetCard from './SortableWidgetCard'
import WidgetPalette from './WidgetPalette'
import TemplateNameDialog from './TemplateNameDialog'
import { cn } from '@/lib/utils'

interface Props {
  kind: 'create' | 'edit'
  template: DashboardTemplateDTO | null
  initialLayout: DashboardLayout
  onClose: () => void
}

const zoneScopedCollision: CollisionDetection = (args) => {
  const activeContainer = args.active.data.current?.sortable?.containerId
  if (activeContainer == null) return closestCenter(args)
  const sameZone = args.droppableContainers.filter((c) => c.data.current?.sortable?.containerId === activeContainer)
  return closestCenter({ ...args, droppableContainers: sameZone })
}

function errorText(e: LayoutValidationError): string {
  if (e.code === 'too-few') {
    return e.zone === 'top' ? t('dashboard.editor.tooFewTop') : t('dashboard.editor.tooFewBottom')
  }
  const zone = e.zone === 'top' ? t('dashboard.editor.zoneTop') : t('dashboard.editor.zoneMain')
  return t('dashboard.editor.tooMany', { zone, max: e.max, count: e.count })
}

export default function DashboardEditor({ kind, template, initialLayout, onClose }: Props) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(template?.name ?? t('dashboard.editor.defaultName'))
  const [layout, setLayout] = useState<DashboardLayout>(() => {
    const clone = structuredClone(initialLayout)
    clone.main = clone.main.map((w) =>
      w.type === 'calendar' ? { ...w, colSpan: 2, rowSpan: 2 } : { ...w, colSpan: 1, rowSpan: 1 },
    )
    return clone
  })
  const [createOpen, setCreateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const errors = useMemo(() => validateLayout(layout), [layout])
  const valid = errors.length === 0
  const canDelete = !!template?.id && !template.isDefault

  // ── Layout mutations ──
  function reorder(zone: WidgetZone, activeId: string, overId: string) {
    setLayout((prev) => {
      const list = prev[zone]
      const from = list.findIndex((w) => w.id === activeId)
      const to = list.findIndex((w) => w.id === overId)
      if (from === -1 || to === -1) return prev
      return { ...prev, [zone]: arrayMove(list, from, to) }
    })
  }
  function addWidget(zone: WidgetZone, type: WidgetType) {
    const def = getWidgetDef(type)
    if (!def) return
    const instance: WidgetInstance = {
      id: crypto.randomUUID(),
      type,
      ...(zone === 'main' ? { colSpan: def.defaultColSpan } : {}),
      ...(zone === 'main' && def.defaultRowSpan > 1 ? { rowSpan: def.defaultRowSpan } : {}),
      ...(type === 'calendar' ? { settings: { stats: DEFAULT_CALENDAR_SETTINGS.stats } } : {}),
    }
    setLayout((prev) => ({ ...prev, [zone]: [...prev[zone], instance] }))
  }
  function removeWidget(zone: WidgetZone, id: string) {
    setLayout((prev) => ({ ...prev, [zone]: prev[zone].filter((w) => w.id !== id) }))
  }
  function zoneOf(id: string): WidgetZone | null {
    if (layout.top.some((w) => w.id === id)) return 'top'
    if (layout.main.some((w) => w.id === id)) return 'main'
    return null
  }
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const zone = zoneOf(active.id as string)
    if (zone && zone === zoneOf(over.id as string)) reorder(zone, active.id as string, over.id as string)
  }

  function showSaveWarnings() {
    for (const e of errors) toast.error(errorText(e))
  }

  function persist(finalName: string) {
    if (!valid) {
      showSaveWarnings()
      return
    }
    startTransition(async () => {
      const res = await saveTemplate({
        id: template?.id || undefined,
        name: finalName.trim() || t('dashboard.editor.defaultName'),
        layout,
        makeDefault: true,
      })
      if (handleRateLimit(res)) return
      if (res.success) {
        track({ name: 'dashboard_customized', props: { kind } })
        toast.success(kind === 'create' ? t('dashboard.editor.templateCreated') : t('dashboard.editor.dashboardSaved'))
        setCreateOpen(false)
        router.refresh()
        onClose()
      } else {
        toast.error(t('dashboard.editor.saveFailed'))
      }
    })
  }

  function handleRename(newName: string) {
    setName(newName)
    setRenameOpen(false)
    if (template?.id) {
      startTransition(async () => {
        if (handleRateLimit(await renameTemplate(template.id, newName))) return
        router.refresh()
      })
    }
    toast.success(t('dashboard.editor.templateRenamed'))
  }

  async function handleDelete() {
    if (!canDelete || !template?.id) return
    const ok = await confirm({
      title: t('dashboard.editor.deleteTitle'),
      message: tRich('dashboard.editor.deleteMessage', { name: template.name }),
      variant: 'delete',
    })
    if (!ok) return
    startTransition(async () => {
      if (handleRateLimit(await deleteTemplate(template.id))) return
      toast.success(t('dashboard.editor.templateDeleted'))
      router.refresh()
      onClose()
    })
  }

  const topUsed = new Set(layout.top.map((w) => w.type))
  const mainUsed = new Set(layout.main.map((w) => w.type))

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={zoneScopedCollision}
      modifiers={[restrictToFirstScrollableAncestor]}
      autoScroll={{ threshold: { x: 0, y: 0.2 } }}
      onDragEnd={handleDragEnd}
    >
      {/* Editor toolbar */}
      <div className="sticky top-0 z-30 -mx-5 px-5 py-3 mb-5 bg-background/85 backdrop-blur border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold truncate">
            {kind === 'create' ? t('dashboard.editor.newTemplate') : name}
          </span>
          {!valid && (
            <span className="inline-flex items-center gap-1.5 text-xs text-loss">
              <AlertTriangle className="w-3.5 h-3.5" />
              {t(errors.length > 1 ? 'dashboard.editor.issueMany' : 'dashboard.editor.issueOne', {
                count: errors.length,
              })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {kind === 'create' ? (
            <>
              <button
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                <X className="w-4 h-4" /> {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  if (!valid) {
                    showSaveWarnings()
                    return
                  }
                  setCreateOpen(true)
                }}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition disabled:opacity-40"
              >
                <Save className="w-4 h-4" /> {t('dashboard.editor.saveAsTemplate')}
              </button>
            </>
          ) : (
            <>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors">
                    <MoreHorizontal className="w-4 h-4" /> {t('dashboard.editor.moreActions')}
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={6}
                    className="z-50 w-52 rounded-lg border border-border bg-popover p-1.5 shadow-xl animate-fade-in"
                  >
                    <DropdownMenu.Item
                      onSelect={() => setRenameOpen(true)}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none cursor-pointer data-[highlighted]:bg-accent"
                    >
                      <Pencil className="w-3.5 h-3.5" /> {t('dashboard.editor.renameTemplate')}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={(e) => {
                        if (!canDelete) {
                          e.preventDefault()
                          return
                        }
                        handleDelete()
                      }}
                      disabled={!canDelete}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none cursor-pointer text-loss data-[highlighted]:bg-loss/10 data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {t('dashboard.editor.deleteTemplate')}
                    </DropdownMenu.Item>
                    {!canDelete && (
                      <div className="px-2 pt-1 text-[10px] text-muted-foreground">
                        {t('dashboard.editor.mainCantDelete')}
                      </div>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <button
                onClick={() => persist(name)}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:bg-primary/90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t('common.done')}
              </button>
            </>
          )}
        </div>
      </div>

      {!valid && (
        <div className="mb-5 rounded-lg border border-loss/30 bg-loss/5 px-4 py-3 text-sm text-loss space-y-1">
          {errors.map((e, i) => (
            <div key={i}>{errorText(e)}</div>
          ))}
        </div>
      )}

      <section className="mb-8">
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/50 p-4 sm:p-5">
          <SortableContext items={layout.top.map((w) => w.id)} strategy={horizontalListSortingStrategy}>
            <div className="grid gap-3 grid-cols-1 min-[440px]:grid-cols-2 sm:grid-cols-3 min-[1500px]:grid-cols-5">
              {layout.top.map((wi) => {
                const def = getWidgetDef(wi.type)!
                const Comp = def.component
                return (
                  <SortableWidgetCard
                    key={wi.id}
                    instance={wi}
                    def={def}
                    preview={
                      <ErrorBoundary label={def.label}>
                        <Comp instance={wi} />
                      </ErrorBoundary>
                    }
                    onRemove={() => removeWidget('top', wi.id)}
                  />
                )
              })}
              {Array.from({ length: Math.max(0, ZONE_CONFIG.top.maxWidgets - layout.top.length) }).map((_, i) => (
                <WidgetPalette
                  key={`top-slot-${i}`}
                  zone="top"
                  usedTypes={topUsed}
                  slot
                  onAdd={(t) => addWidget('top', t)}
                />
              ))}
            </div>
          </SortableContext>
        </div>
      </section>

      <section>
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/50 p-4 sm:p-5">
          <SortableContext items={layout.main.map((w) => w.id)} strategy={rectSortingStrategy}>
            <div
              className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 dash-main"
              style={{ '--main-row': MAIN_ROW_HEIGHT } as CSSProperties}
            >
              {layout.main.map((wi) => {
                const def = getWidgetDef(wi.type)!
                const Comp = def.component
                const isCalendar = wi.type === 'calendar'
                const span = isCalendar ? 2 : 1
                const rowSpan = isCalendar ? 2 : 1
                return (
                  <div
                    key={wi.id}
                    className={cn('dash-cell', span >= 2 && 'dash-wide')}
                    style={{ '--cs': span, '--rs': rowSpan } as CSSProperties}
                  >
                    <SortableWidgetCard
                      instance={wi}
                      def={def}
                      preview={
                        <ErrorBoundary label={def.label}>
                          <Comp key={JSON.stringify(wi.settings ?? {})} instance={wi} />
                        </ErrorBoundary>
                      }
                      onRemove={() => removeWidget('main', wi.id)}
                    />
                  </div>
                )
              })}
              {Array.from({ length: Math.max(0, MAIN_WIDGETS.length - mainUsed.size) }).map((_, i) => (
                <div key={`main-slot-${i}`} className="dash-cell" style={{ '--cs': 1, '--rs': 1 } as CSSProperties}>
                  <WidgetPalette zone="main" usedTypes={mainUsed} slot onAdd={(t) => addWidget('main', t)} />
                </div>
              ))}
            </div>
          </SortableContext>
        </div>
      </section>

      {/* Dialogs */}
      <TemplateNameDialog
        open={createOpen}
        title={t('dashboard.editor.createTitle')}
        description={t('dashboard.editor.createDescription')}
        initialName=""
        confirmLabel={t('common.save')}
        pending={pending}
        onSubmit={persist}
        onClose={() => setCreateOpen(false)}
      />
      <TemplateNameDialog
        open={renameOpen}
        title={t('dashboard.editor.renameTemplate')}
        initialName={name}
        confirmLabel={t('common.save')}
        pending={pending}
        onSubmit={handleRename}
        onClose={() => setRenameOpen(false)}
      />
    </DndContext>
  )
}
