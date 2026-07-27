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
import { prettyDayMonth } from '@/lib/progress-format'
import { ruleModeOf } from '@/lib/progress-compute'
import Tooltip from '@/components/ui/Tooltip'
import RuleDialog from './RuleDialog'
import { deleteRule, toggleRuleActive, reorderRules, type ProgressRule } from '@/lib/actions/progress'

interface Dialog {
  mode: 'new' | 'edit'
  rule?: ProgressRule
  category?: 'trading' | 'habit'
}

// The three manageable groups: trading hard, trading soft, general habits.
type Group = 'hard' | 'soft' | 'habit'

// `scope` selects which domain this manager governs: 'trading' shows the hard + soft
// tiers (Rules tab), 'habit' shows only general habits (Habits tab). Keeping one
// component avoids two near-identical CRUD lists. `onChanged` lets a host tab re-fetch
// sibling views (heatmap / day panel) after a mutation, on top of the server refresh.
export default function RulesManager({
  rules,
  scope = 'trading',
  onChanged,
}: {
  rules: ProgressRule[]
  scope?: 'trading' | 'habit'
  onChanged?: () => void
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [items, setItems] = useState(rules)
  const [dialog, setDialog] = useState<Dialog | null>(null)

  useEffect(() => {
    setItems(rules)
  }, [rules])

  const isHabit = scope === 'habit'
  const afterChange = () => {
    onChanged?.()
    router.refresh()
  }

  const openNew = () => setDialog({ mode: 'new', category: scope })
  const openEdit = (rule: ProgressRule) => setDialog({ mode: 'edit', rule })

  const toggleActive = async (rule: ProgressRule) => {
    // Optimistic
    setItems((arr) => arr.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r)))
    try {
      if (handleRateLimit(await toggleRuleActive(rule.id, !rule.active))) return
      afterChange()
    } catch (err) {
      setItems((arr) => arr.map((r) => (r.id === rule.id ? { ...r, active: rule.active } : r)))
      toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
    }
  }

  const remove = async (rule: ProgressRule) => {
    const ok = await confirm({
      title: t('progress.rules.menu.delete'),
      message: tRich(isHabit ? 'progress.habits.confirmDelete' : 'progress.rules.confirmDelete', { name: rule.name }),
      variant: 'delete',
    })
    if (!ok) return
    try {
      if (handleRateLimit(await deleteRule(rule.id))) return
      toast.success(t(isHabit ? 'progress.habits.toast.deleted' : 'progress.rules.toast.deleted'))
      afterChange()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'progress.rules.toast.deleteError'))
    }
  }

  const inGroup = (r: ProgressRule, g: Group) =>
    g === 'habit' ? r.category === 'habit' : r.category !== 'habit' && r.type === g

  // Reorder within one group (trading-hard, trading-soft, or habits). The three
  // sections keep a stable combined sort order — hard, then soft, then habits —
  // mirrored everywhere the rules are shown. We persist the whole order at once.
  const reorderGroup = (orderedIds: string[], group: Group) => {
    const map = new Map(items.map((r) => [r.id, r]))
    const reordered = orderedIds.map((id) => map.get(id)).filter((r): r is ProgressRule => Boolean(r))
    const groupOf = (g: Group) => (group === g ? reordered : items.filter((r) => inGroup(r, g)))
    const combined = [...groupOf('hard'), ...groupOf('soft'), ...groupOf('habit')]
    setItems(combined)
    reorderRules(combined.map((r) => r.id))
      .then((res) => {
        if (handleRateLimit(res)) router.refresh()
        else onChanged?.()
      })
      .catch(() => {
        toast.error(t('progress.rules.toast.saveError'))
        router.refresh()
      })
  }

  const hardRules = items.filter((r) => inGroup(r, 'hard'))
  const softRules = items.filter((r) => inGroup(r, 'soft'))
  const habitRules = items.filter((r) => inGroup(r, 'habit'))

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
          {/* Constraints are called out by mode, using the same vocabulary as the dialog
              and the day rows (see ruleModeOf) — a trading "Strict" rule and a daily
              "Avoidance" habit read as the same kind of thing. */}
          {rule.type === 'hard' && (
            <span className="shrink-0 rounded bg-loss/15 px-1.5 py-0.5 text-[10px] font-medium text-loss">
              {t(`progress.mode.name.${ruleModeOf(rule)}`)}
            </span>
          )}
          {rule.activeDays.length < 7 && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {scheduleLabel(rule.activeDays)}
            </span>
          )}
          {/* The current schedule replaced an older one from that day on — which is why the
              heatmap and this badge can disagree about which weekdays "count". */}
          {rule.scheduleSince && (
            <Tooltip
              label={t('progress.rules.schedule.changedOn', {
                days: scheduleLabel(rule.activeDays),
                date: prettyDayMonth(rule.scheduleSince),
              })}
            >
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t('progress.rules.schedule.changedBadge')}
              </span>
            </Tooltip>
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

  // Group badges use the shared kind vocabulary (Constraint / Task) so the Manage tab
  // frames the two trading tiers the same way the dialog and the day rows do.
  const groupMeta: Record<Group, { badgeClass: string; badge: string; title: string; empty: string }> = {
    hard: {
      badgeClass: 'bg-loss/15 text-loss',
      badge: t('progress.mode.kind.constraint'),
      title: t('progress.day.hardTitle'),
      empty: t('progress.rules.hardEmpty'),
    },
    soft: {
      badgeClass: 'bg-primary/15 text-primary',
      badge: t('progress.mode.kind.task'),
      title: t('progress.day.softTitle'),
      empty: t('progress.rules.softEmpty'),
    },
    habit: {
      badgeClass: 'bg-muted text-muted-foreground',
      badge: t('progress.habits.category.habit'),
      title: '',
      empty: t('progress.habits.empty'),
    },
  }

  const section = (group: Group, groupRules: ProgressRule[]) => {
    const meta = groupMeta[group]
    return (
      <div>
        <div className="mb-2 flex items-center gap-2 px-1">
          <span
            className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', meta.badgeClass)}
          >
            {meta.badge}
          </span>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{meta.title}</h3>
          <span className="text-xs text-muted-foreground">{groupRules.length}</span>
        </div>
        {groupRules.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            {meta.empty}
          </p>
        ) : (
          <SortableList
            items={groupRules}
            getId={(r) => r.id}
            onReorder={(ids) => reorderGroup(ids, group)}
            className="space-y-2"
            renderItem={renderRule}
          />
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {t(isHabit ? 'progress.habits.title' : 'progress.rules.title')}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t(isHabit ? 'progress.habits.subtitle' : 'progress.rules.subtitle')}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t(isHabit ? 'progress.habits.add' : 'progress.rules.add')}
        </button>
      </div>

      <div className="space-y-5 p-3 sm:p-4">
        {isHabit ? (
          section('habit', habitRules)
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
          category={dialog.category}
          onClose={() => setDialog(null)}
          onSaved={afterChange}
        />
      )}
    </div>
  )
}
