'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { GripVertical, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import SortableList, { type DragHandleProps } from '@/components/ui/SortableList'
import Tooltip from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'
import {
  deleteChecklistItem,
  getAdherenceSetup,
  reorderChecklistItems,
  seedUniversalCriteria,
  type AdherenceSetup,
  type ChecklistItemDTO,
} from '@/lib/actions/adherence'
import { CHECKLIST_BLOCKS, type ChecklistBlock } from '@/lib/adherence'
import { blockMeta } from './blockMeta'
import CriterionDialog from './CriterionDialog'
import { t, tRich } from '@/i18n'

/**
 * Where the checklist is defined. Deleting is presented as "retire" because a criterion
 * keeps governing the trades it already governed.
 */
export default function CriteriaTab({
  strategiesKey,
  onCreateStrategy,
}: {
  strategiesKey?: string
  onCreateStrategy?: () => void
}) {
  const confirm = useConfirm()
  const [data, setData] = useState<AdherenceSetup | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()
  const [itemDialog, setItemDialog] = useState<{
    item: ChecklistItemDTO | null
    block: ChecklistBlock
    strategyId: string | null
  } | null>(null)

  const reload = useCallback(async () => {
    try {
      const res = await getAdherenceSetup()
      if (handleRateLimit(res)) return
      setData(res)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload, strategiesKey])

  if (failed) return <Note>{t('adherence.toast.saveError')}</Note>
  if (!data) return <Skeleton />

  const hasStrategy = data.strategies.length > 0

  const canSeed =
    hasStrategy &&
    !CHECKLIST_BLOCKS.filter((b) => b !== 'setup').every((b) =>
      data.items.some((i) => i.strategyId === null && i.block === b),
    )

  const seed = () => {
    startTransition(async () => {
      try {
        const res = await seedUniversalCriteria()
        if (handleRateLimit(res)) return
        toast.success(t('adherence.toast.seeded'))
        await reload()
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'adherence.toast.saveError'))
      }
    })
  }

  const itemsIn = (block: ChecklistBlock, strategyId: string | null) =>
    data.items
      .filter((i) => i.block === block && i.strategyId === strategyId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))

  const removeItem = async (item: ChecklistItemDTO) => {
    const ok = await confirm({
      title: t('adherence.criteria.delete.title'),
      message: tRich('adherence.criteria.delete.body', { name: item.label }),
      variant: 'delete',
    })
    if (!ok) return
    try {
      if (handleRateLimit(await deleteChecklistItem(item.id))) return
      toast.success(t('adherence.toast.deleted'))
      await reload()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'adherence.toast.saveError'))
    }
  }

  const reorderItems = (orderedIds: string[]) => {
    // Optimistic: rewrite local sort keys so the list doesn't snap back mid-write.
    setData((d) =>
      d
        ? {
            ...d,
            items: d.items.map((i) => (orderedIds.includes(i.id) ? { ...i, sortOrder: orderedIds.indexOf(i.id) } : i)),
          }
        : d,
    )
    startTransition(async () => {
      try {
        if (handleRateLimit(await reorderChecklistItems(orderedIds))) await reload()
      } catch (err) {
        toast.error(getActionErrorMessage(err, 'adherence.toast.saveError'))
        await reload()
      }
    })
  }

  const renderItem = (
    item: ChecklistItemDTO,
    { handleProps, dragging }: { handleProps: DragHandleProps; dragging: boolean },
  ) => (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5',
        dragging && 'border-primary/40',
        pending && 'opacity-70',
      )}
    >
      <button
        {...handleProps}
        className="cursor-grab touch-none text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
        aria-label={t('common.drag')}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{item.label}</span>
        {item.definition && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.definition}</p>}
      </div>
      <Tooltip label={t('adherence.criteria.since', { date: item.effectiveFrom })}>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">{item.effectiveFrom}</span>
      </Tooltip>
      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton
          label={t('adherence.criteria.form.editTitle')}
          icon={Pencil}
          onClick={() => setItemDialog({ item, block: item.block, strategyId: item.strategyId })}
        />
        <IconButton
          label={t('adherence.criteria.delete.confirm')}
          icon={Trash2}
          danger
          onClick={() => removeItem(item)}
        />
      </div>
    </div>
  )

  /**
   * One block's list, with the button that adds to exactly this block and scope. Per
   * strategy an empty block collapses to its header — most setups only extend `setup`.
   */
  const blockGroup = (block: ChecklistBlock, strategyId: string | null) => {
    const meta = blockMeta(block)
    const items = itemsIn(block, strategyId)
    const perStrategy = strategyId !== null
    return (
      <div key={`${strategyId ?? 'universal'}-${block}`}>
        <div className={cn('flex items-center gap-2 px-1', items.length > 0 && 'mb-2')}>
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dotClass)} />
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{meta.name}</h4>
          <span className="text-xs text-muted-foreground">{items.length}</span>
          {perStrategy && items.length === 0 && (
            <span className="truncate text-xs text-muted-foreground/70">{t('adherence.criteria.universalOnly')}</span>
          )}
          {hasStrategy && (
            <button
              type="button"
              onClick={() => setItemDialog({ item: null, block, strategyId })}
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('adherence.criteria.add')}
            </button>
          )}
        </div>
        {items.length > 0 ? (
          <SortableList
            items={items}
            getId={(i) => i.id}
            onReorder={reorderItems}
            className="space-y-2"
            renderItem={renderItem}
          />
        ) : (
          !perStrategy && (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              {t('adherence.criteria.emptyBlock')}
            </p>
          )
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted-foreground">{t('adherence.criteria.subtitle')}</p>

      {!hasStrategy && (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-5 py-4 text-center">
          <p className="text-sm font-medium">{t('adherence.criteria.needsStrategy.title')}</p>
          <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">
            {t('adherence.criteria.needsStrategy.description')}
          </p>
          {onCreateStrategy && (
            <button
              type="button"
              onClick={onCreateStrategy}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('adherence.criteria.needsStrategy.cta')}
            </button>
          )}
        </div>
      )}

      {/* Universal blocks: defined once, applied to every setup. */}
      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight">{t('adherence.criteria.universalTitle')}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('adherence.criteria.universalLead')}</p>
          </div>
          {canSeed && (
            <button
              type="button"
              onClick={seed}
              disabled={pending}
              className="flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {t('adherence.criteria.seed')}
            </button>
          )}
        </div>
        <div className="space-y-5 p-3 sm:p-4">{CHECKLIST_BLOCKS.map((block) => blockGroup(block, null))}</div>
      </section>

      {/* Per-strategy criteria, in every block. The setup block is where most of them
          belong, but a setup may also demand its own gate (a regime this one needs) or
          its own management rules — those add to the universal ones, never replace them. */}
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold tracking-tight">{t('adherence.criteria.perStrategyTitle')}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('adherence.criteria.perStrategyLead')}</p>
        </div>
        <div className="space-y-6 p-3 sm:p-4">
          {!hasStrategy ? (
            <Note>{t('adherence.criteria.needsStrategy.description')}</Note>
          ) : (
            data.strategies.map((s) => (
              <div key={s.id}>
                <h4 className="mb-3 text-sm font-semibold">{s.name}</h4>
                <div className="space-y-4 border-l border-border pl-3">
                  {CHECKLIST_BLOCKS.map((block) => blockGroup(block, s.id))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {itemDialog && (
        <CriterionDialog
          item={itemDialog.item}
          block={itemDialog.block}
          strategyId={itemDialog.strategyId}
          strategies={data.strategies}
          onClose={() => setItemDialog(null)}
          onSaved={reload}
        />
      )}
    </div>
  )
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  danger,
}: {
  label: string
  icon: typeof Pencil
  onClick: () => void
  danger?: boolean
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
          danger ? 'hover:bg-loss/10 hover:text-loss' : 'hover:bg-accent hover:text-foreground',
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
    </Tooltip>
  )
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
    {children}
  </p>
)

const Skeleton = () => (
  <div className="space-y-3">
    {[0, 1, 2].map((i) => (
      <div key={i} className="h-40 animate-pulse rounded-xl bg-card" />
    ))}
  </div>
)
