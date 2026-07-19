'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { Plus, Pencil, Trash2, GripVertical, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t, tRich } from '@/i18n'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import SortableList, { type DragHandleProps } from '@/components/ui/SortableList'
import { scheduleLabel } from '@/lib/rule-schedule'
import Tooltip from '@/components/ui/Tooltip'
import RuleDialog from './RuleDialog'
import { deleteRule, toggleRuleActive, reorderRules, type ProgressRule } from '@/lib/actions/progress'

interface Dialog {
  mode: 'new' | 'edit'
  rule?: ProgressRule
}

export default function RulesManager({ rules }: { rules: ProgressRule[] }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [items, setItems] = useState(rules)
  const [dialog, setDialog] = useState<Dialog | null>(null)

  useEffect(() => {
    setItems(rules)
  }, [rules])

  const openNew = () => setDialog({ mode: 'new' })
  const openEdit = (rule: ProgressRule) => setDialog({ mode: 'edit', rule })

  const toggleActive = async (rule: ProgressRule) => {
    // Optimistic
    setItems((arr) => arr.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r)))
    try {
      if (handleRateLimit(await toggleRuleActive(rule.id, !rule.active))) return
      router.refresh()
    } catch (err) {
      setItems((arr) => arr.map((r) => (r.id === rule.id ? { ...r, active: rule.active } : r)))
      toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
    }
  }

  const remove = async (rule: ProgressRule) => {
    const ok = await confirm({
      title: t('progress.rules.menu.delete'),
      message: tRich('progress.rules.confirmDelete', { name: rule.name }),
      variant: 'delete',
    })
    if (!ok) return
    try {
      if (handleRateLimit(await deleteRule(rule.id))) return
      toast.success(t('progress.rules.toast.deleted'))
      router.refresh()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'progress.rules.toast.deleteError'))
    }
  }

  // Reorder within one tier. Hard rules keep a lower sort order than soft ones so
  // the two-section order is mirrored everywhere the rules are shown (the day
  // overview groups by tier too). We persist the whole combined order at once.
  const reorderGroup = (orderedIds: string[], type: 'hard' | 'soft') => {
    const map = new Map(items.map((r) => [r.id, r]))
    const reordered = orderedIds.map((id) => map.get(id)).filter((r): r is ProgressRule => Boolean(r))
    const hard = type === 'hard' ? reordered : items.filter((r) => r.type === 'hard')
    const soft = type === 'soft' ? reordered : items.filter((r) => r.type === 'soft')
    const combined = [...hard, ...soft]
    setItems(combined)
    reorderRules(combined.map((r) => r.id))
      .then((res) => {
        if (handleRateLimit(res)) router.refresh()
      })
      .catch(() => {
        toast.error(t('progress.rules.toast.saveError'))
        router.refresh()
      })
  }

  const hardRules = items.filter((r) => r.type === 'hard')
  const softRules = items.filter((r) => r.type === 'soft')

  const renderRule = (
    rule: ProgressRule,
    { handleProps, dragging }: { handleProps: DragHandleProps; dragging: boolean },
  ) => (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5',
        !rule.active && 'opacity-55',
        dragging && 'border-primary/40',
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
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{rule.name}</span>
          {rule.activeDays.length < 7 && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {scheduleLabel(rule.activeDays)}
            </span>
          )}
          {!rule.active && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t('progress.rules.inactive')}
            </span>
          )}
        </div>
        {rule.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{rule.description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Tooltip label={rule.active ? t('progress.rules.menu.deactivate') : t('progress.rules.menu.activate')}>
          <button
            onClick={() => toggleActive(rule)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={rule.active ? t('progress.rules.menu.deactivate') : t('progress.rules.menu.activate')}
          >
            {rule.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </Tooltip>
        <Tooltip label={t('progress.rules.menu.edit')}>
          <button
            onClick={() => openEdit(rule)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t('progress.rules.menu.edit')}
          >
            <Pencil className="h-4 w-4" />
          </button>
        </Tooltip>
        <Tooltip label={t('progress.rules.menu.delete')}>
          <button
            onClick={() => remove(rule)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-loss/10 hover:text-loss"
            aria-label={t('progress.rules.menu.delete')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  )

  const section = (type: 'hard' | 'soft', groupRules: ProgressRule[]) => (
    <div>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            type === 'hard' ? 'bg-loss/15 text-loss' : 'bg-primary/15 text-primary',
          )}
        >
          {t(`progress.rules.type.${type}`)}
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t(type === 'hard' ? 'progress.day.hardTitle' : 'progress.day.softTitle')}
        </h3>
        <span className="text-xs text-muted-foreground">{groupRules.length}</span>
      </div>
      {groupRules.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          {t(type === 'hard' ? 'progress.rules.hardEmpty' : 'progress.rules.softEmpty')}
        </p>
      ) : (
        <SortableList
          items={groupRules}
          getId={(r) => r.id}
          onReorder={(ids) => reorderGroup(ids, type)}
          className="space-y-2"
          renderItem={renderRule}
        />
      )}
    </div>
  )

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{t('progress.rules.title')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('progress.rules.subtitle')}</p>
        </div>
        <button
          onClick={openNew}
          className="flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('progress.rules.add')}
        </button>
      </div>

      <div className="space-y-5 p-3 sm:p-4">
        {items.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">{t('progress.rules.empty')}</p>
        ) : (
          <>
            {section('hard', hardRules)}
            {section('soft', softRules)}
          </>
        )}
      </div>

      {dialog && (
        <RuleDialog
          mode={dialog.mode}
          rule={dialog.rule}
          onClose={() => setDialog(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  )
}
