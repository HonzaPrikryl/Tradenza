'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import { ALL_WEEKDAYS } from '@/lib/progress-compute'
import { WEEKDAYS_PRESET, isoWeekdayMin, scheduleLabel } from '@/lib/rule-schedule'
import { createRule, updateRule, type ProgressRule } from '@/lib/actions/progress'
import { track } from '@/lib/analytics'

const inputClass =
  'w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
const labelClass = 'mb-1.5 block text-xs font-medium text-muted-foreground'

const sameDays = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join()

type Preset = 'daily' | 'weekdays' | 'custom'

export default function RuleDialog({
  mode,
  rule,
  onClose,
  onSaved,
}: {
  mode: 'new' | 'edit'
  rule?: ProgressRule
  onClose: () => void
  onSaved?: () => void
}) {
  const [name, setName] = useState(rule?.name ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [type, setType] = useState<'hard' | 'soft'>(rule?.type ?? 'soft')
  const [days, setDays] = useState<number[]>(rule?.activeDays ?? [...ALL_WEEKDAYS])
  const [saving, setSaving] = useState(false)

  const preset: Preset = sameDays(days, ALL_WEEKDAYS)
    ? 'daily'
    : sameDays(days, WEEKDAYS_PRESET)
      ? 'weekdays'
      : 'custom'

  const narrowed = mode === 'edit' && !!rule && rule.activeDays.some((d) => !days.includes(d))

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
      const payload = { name: name.trim(), description: description.trim() || null, type, activeDays: days }
      const res = mode === 'edit' && rule ? await updateRule(rule.id, payload) : await createRule(payload)
      if (handleRateLimit(res)) return
      if (mode !== 'edit') track({ name: 'progress_rule_created' })
      toast.success(mode === 'edit' ? t('progress.rules.toast.updated') : t('progress.rules.toast.created'))
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
      title={t(mode === 'edit' ? 'progress.rules.editTitle' : 'progress.rules.newTitle')}
      onClose={onClose}
      onConfirm={save}
      confirmLabel={saving ? t('progress.saving') : t('progress.save')}
      confirmDisabled={saving}
      cancelLabel={t('progress.cancel')}
    >
      <div>
        <label className={labelClass}>{t('progress.rules.nameLabel')}</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder={t('progress.rules.namePlaceholder')}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>{t('progress.rules.typeLabel')}</label>
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
              <span
                className={cn(
                  'block text-sm font-medium',
                  type === ty ? (ty === 'hard' ? 'text-loss' : 'text-primary') : 'text-foreground',
                )}
              >
                {t(`progress.rules.type.${ty}`)}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                {t(`progress.rules.typeHint.${ty}`)}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={labelClass}>{t('progress.rules.descLabel')}</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('progress.rules.descPlaceholder')}
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
                  title={t('progress.rules.schedule.customHint')}
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
        {narrowed && <p className="mt-1 text-xs text-muted-foreground/80">{t('progress.rules.schedule.retroHint')}</p>}
      </div>
    </Modal>
  )
}
