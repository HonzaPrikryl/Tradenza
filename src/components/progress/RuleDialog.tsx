'use client'

import { useState } from 'react'
import { CalendarClock, Lock, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import {
  ALL_WEEKDAYS,
  WEEKDAYS,
  RULE_DESC_MAX as DESC_MAX,
  RULE_NAME_MAX as NAME_MAX,
  isConstraintMode,
  ruleModeOf,
  type RuleMode,
} from '@/lib/progress-compute'
import { WEEKDAYS_PRESET, isoWeekdayMin, scheduleLabel } from '@/lib/rule-schedule'
import { createRule, updateRule, type ProgressRule } from '@/lib/actions/progress'
import { track } from '@/lib/analytics'

const inputClass =
  'w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
const labelClass = 'mb-1.5 block text-xs font-medium text-muted-foreground'

const sameDays = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join()

type Preset = 'daily' | 'weekdays' | 'custom'

// The shared class of a rule — "Constraint" or "Task". Rendered next to the mode name so
// the user can see that a trading strict rule and a daily avoidance habit are the same
// kind of thing with different tolerances, rather than two unrelated concepts.
function KindChip({ mode }: { mode: RuleMode }) {
  const constraint = isConstraintMode(mode)
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
        constraint ? 'bg-loss/15 text-loss' : 'bg-primary/15 text-primary',
      )}
    >
      {t(`progress.mode.kind.${constraint ? 'constraint' : 'task'}`)}
    </span>
  )
}

export default function RuleDialog({
  mode,
  rule,
  category: categoryProp,
  onClose,
  onSaved,
}: {
  mode: 'new' | 'edit'
  rule?: ProgressRule
  /**
   * Domain of the rule being created. Fixed by the opening context (trading
   * sections vs. the habits panel) rather than toggled inside the dialog. On
   * edit, the existing rule's category wins.
   */
  category?: 'trading' | 'habit'
  onClose: () => void
  onSaved?: () => void
}) {
  const category = rule?.category ?? categoryProp ?? 'trading'
  const isHabit = category === 'habit'
  const isEdit = mode === 'edit' && !!rule
  /** The user-facing mode for a tier in this dialog's domain. */
  const modeOf = (ty: 'hard' | 'soft') => ruleModeOf({ type: ty, category })
  const [name, setName] = useState(rule?.name ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [type, setType] = useState<'hard' | 'soft'>(rule?.type ?? 'soft')
  // A new TRADING rule starts on Mon–Fri (an unlogged scheduled day scores as a missed
  // process day, so a 7-day default would redden every weekend); a daily habit starts on
  // every day. Either way the schedule is one click away in the presets below.
  const [days, setDays] = useState<number[]>(rule?.activeDays ?? [...(isHabit ? ALL_WEEKDAYS : WEEKDAYS)])
  const [saving, setSaving] = useState(false)

  const preset: Preset = sameDays(days, ALL_WEEKDAYS)
    ? 'daily'
    : sameDays(days, WEEKDAYS_PRESET)
      ? 'weekdays'
      : 'custom'

  // A schedule change is forward-only (see progressRuleSchedules in db/schema), so nothing
  // behind today moves. Which way it runs still decides the wording below.
  const scheduleChanged = isEdit && !sameDays(days, rule.activeDays)
  const narrowed = isEdit && rule.activeDays.some((d) => !days.includes(d))
  const widened = isEdit && days.some((d) => !rule.activeDays.includes(d))

  const toggleDay = (iso: number) => {
    if (days.includes(iso)) {
      if (days.length === 1) {
        toast.error(t('progress.rules.schedule.minOneDay'))
        return
      }
      setDays(days.filter((d) => d !== iso))
    } else {
      setDays([...days, iso].sort((a, b) => a - b))
    }
  }

  const save = async () => {
    if (!name.trim()) {
      toast.error(t('validation.nameRequired'))
      return
    }
    setSaving(true)
    try {
      const common = {
        name: name.trim(),
        description: description.trim() || null,
        activeDays: days,
      }
      // The tier and domain are set once, at creation, and are immutable afterwards —
      // they define how every logged day is read back (see ruleUpdateSchema), so an
      // edit never sends them.
      const res =
        mode === 'edit' && rule
          ? await updateRule(rule.id, common)
          : // Trading: hard/soft tier. Habits: hard = avoidance ("No X"), soft = building.
            await createRule({ ...common, type, category })
      if (handleRateLimit(res)) return
      if (mode !== 'edit') track({ name: 'progress_rule_created' })
      toast.success(
        mode === 'edit'
          ? t(isHabit ? 'progress.habits.toast.updated' : 'progress.rules.toast.updated')
          : t(isHabit ? 'progress.habits.toast.created' : 'progress.rules.toast.created'),
      )
      onClose()
      onSaved?.()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const presetBtn = (p: Preset, label: string, target: readonly number[]) => (
    <button
      type="button"
      onClick={() => setDays([...target])}
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
        preset === p ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
      aria-pressed={preset === p}
    >
      {label}
    </button>
  )

  return (
    <Modal
      title={t(
        mode === 'edit'
          ? isHabit
            ? 'progress.habits.editTitle'
            : 'progress.rules.editTitle'
          : isHabit
            ? 'progress.habits.newTitle'
            : 'progress.rules.newTitle',
      )}
      onClose={onClose}
      onConfirm={save}
      confirmLabel={saving ? t('progress.saving') : t('progress.save')}
      confirmDisabled={saving}
      cancelLabel={t('progress.cancel')}
    >
      <div>
        <label className={labelClass}>{t(isHabit ? 'progress.habits.nameLabel' : 'progress.rules.nameLabel')}</label>
        {/* maxLength mirrors the zod schema (see ruleSchema). Without it the only feedback
            for an over-long name was a server rejection AFTER the user had written it. */}
        <input
          autoFocus
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder={t(isHabit ? 'progress.habits.namePlaceholder' : 'progress.rules.namePlaceholder')}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>{t(isHabit ? 'progress.habits.typeLabel' : 'progress.rules.typeLabel')}</label>
        {isEdit ? (
          // Locked after creation: the tier is what gives every already-logged day its
          // meaning, so changing it would rewrite history. Show the chosen mode as a
          // static summary and point at the way out (delete + recreate).
          <>
            <div
              className={cn(
                'rounded-md border px-3 py-2',
                type === 'hard' ? 'border-loss/40 bg-loss/5' : 'border-primary/40 bg-primary/5',
              )}
            >
              <span className="flex items-center gap-1.5">
                <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className={cn('text-sm font-medium', type === 'hard' ? 'text-loss' : 'text-primary')}>
                  {t(`progress.mode.name.${modeOf(type)}`)}
                </span>
                <KindChip mode={modeOf(type)} />
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                {t(`progress.mode.hint.${modeOf(type)}`)}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground/80">
              {t(isHabit ? 'progress.habits.typeLocked' : 'progress.rules.typeLocked')}
            </p>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {(['hard', 'soft'] as const).map((ty) => (
                <button
                  key={ty}
                  type="button"
                  onClick={() => setType(ty)}
                  aria-pressed={type === ty}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left transition-colors',
                    type === ty
                      ? ty === 'hard'
                        ? 'border-loss/50 bg-loss/10'
                        : 'border-primary/50 bg-primary/10'
                      : 'border-border hover:bg-accent/50',
                  )}
                >
                  {/* Name + the KIND chip. The chip is the whole point: a trading
                      "Strict" rule and a daily "Avoidance" habit are both constraints,
                      and without it the two words look like unrelated features. */}
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'text-sm font-medium',
                        type === ty ? (ty === 'hard' ? 'text-loss' : 'text-primary') : 'text-foreground',
                      )}
                    >
                      {t(`progress.mode.name.${modeOf(ty)}`)}
                    </span>
                    <KindChip mode={modeOf(ty)} />
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {t(`progress.mode.hint.${modeOf(ty)}`)}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/80">
              {t(`progress.mode.kindHint.${type === 'hard' ? 'constraint' : 'task'}`)}
            </p>
          </>
        )}
      </div>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <label className={cn(labelClass, 'mb-0')}>{t('progress.rules.descLabel')}</label>
          {/* Only once it's close to the limit — a counter on an empty field is noise. */}
          {description.length > DESC_MAX * 0.8 && (
            <span className="text-[10px] tabular text-muted-foreground">
              {description.length}/{DESC_MAX}
            </span>
          )}
        </div>
        <input
          value={description}
          maxLength={DESC_MAX}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t(isHabit ? 'progress.habits.descPlaceholder' : 'progress.rules.descPlaceholder')}
          className={inputClass}
        />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label className={cn(labelClass, 'mb-0')}>{t('progress.rules.schedule.label')}</label>
            {preset === 'custom' && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                {t('progress.rules.schedule.customBadge')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {presetBtn('daily', t('progress.rules.schedule.presetDaily'), ALL_WEEKDAYS)}
            {presetBtn('weekdays', t('progress.rules.schedule.presetWeekdays'), WEEKDAYS_PRESET)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-input/20 p-2.5">
          <div
            className="flex items-center justify-between gap-1"
            role="group"
            aria-label={t('progress.rules.schedule.label')}
          >
            {ALL_WEEKDAYS.map((iso) => {
              const on = days.includes(iso)
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => toggleDay(iso)}
                  aria-pressed={on}
                  className={cn(
                    'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-xs font-semibold transition-all',
                    on
                      ? 'bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20'
                      : 'border border-dashed border-border bg-background text-muted-foreground hover:border-solid hover:border-primary hover:text-primary',
                  )}
                >
                  {isoWeekdayMin(iso)}
                </button>
              )
            })}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Pencil className="h-3 w-3 shrink-0" aria-hidden />
            {t('progress.rules.schedule.customHint')}
          </p>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          <span className="text-muted-foreground/70">{t('progress.rules.schedule.activeSummary')}</span>{' '}
          <span className="font-medium text-foreground">{scheduleLabel(days)}</span>
          {days.length < 7 && <> · {t('progress.rules.schedule.perWeek', { count: days.length })}</>}
        </p>
        {scheduleChanged && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="text-xs leading-relaxed text-foreground">
              <p className="font-semibold">{t('progress.rules.schedule.forwardTitle')}</p>
              <p className="mt-0.5 text-muted-foreground">
                {widened && narrowed
                  ? t('progress.rules.schedule.forwardBoth')
                  : widened
                    ? t('progress.rules.schedule.forwardWidened')
                    : t('progress.rules.schedule.forwardNarrowed')}
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
