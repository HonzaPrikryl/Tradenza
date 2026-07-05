'use client'

import { useState } from 'react'
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
      const payload = { name: name.trim(), description: description.trim() || null, activeDays: days }
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

  const presetBtn = (p: Preset, label: string, target?: readonly number[]) => (
    <button
      type="button"
      onClick={() => target && setDays([...target])}
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
        preset === p
          ? 'bg-primary/15 text-primary'
          : target
            ? 'text-muted-foreground hover:bg-accent hover:text-foreground'
            : 'cursor-default text-muted-foreground/60',
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
          <label className={cn(labelClass, 'mb-0')}>{t('progress.rules.schedule.label')}</label>
          <div className="flex items-center gap-0.5">
            {presetBtn('daily', t('progress.rules.schedule.presetDaily'), ALL_WEEKDAYS)}
            {presetBtn('weekdays', t('progress.rules.schedule.presetWeekdays'), WEEKDAYS_PRESET)}
            {presetBtn('custom', t('progress.rules.schedule.presetCustom'))}
          </div>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label={t('progress.rules.schedule.label')}>
          {ALL_WEEKDAYS.map((iso) => {
            const on = days.includes(iso)
            return (
              <button
                key={iso}
                type="button"
                onClick={() => toggleDay(iso)}
                aria-pressed={on}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors',
                  on
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                )}
              >
                {isoWeekdayMin(iso)}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {scheduleLabel(days)}
          {days.length < 7 && <> · {t('progress.rules.schedule.perWeek', { count: days.length })}</>}
        </p>
        {narrowed && <p className="mt-1 text-xs text-muted-foreground/80">{t('progress.rules.schedule.retroHint')}</p>}
      </div>
    </Modal>
  )
}
