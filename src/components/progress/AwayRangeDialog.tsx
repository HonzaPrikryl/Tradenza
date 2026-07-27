'use client'

import { useState } from 'react'
import { eachDayOfInterval, format, parseISO, subDays } from 'date-fns'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import DateRangePicker from '@/components/ui/DateRangePicker'
import AwayScopePicker from './AwayScopePicker'
import { setDaysAway } from '@/lib/actions/progress'
import { AWAY_BULK_MAX, HISTORY_WINDOW_DAYS, type AwayScope } from '@/lib/progress-compute'

// Excuse a whole stretch of days at once.
//
// The single-day toggle is fine for "I overslept"; it is useless for a holiday, where it
// costs one visit per day and gets done for none of them. Two flows reach this: the
// streak-repair prompt handles the run that already broke a streak, and this covers any
// other period — including one you haven't taken yet. The picker has no upper bound and
// the server accepts future days deliberately (see setDayAway), because booking next
// week's break in advance is the one time anybody marks absence BEFORE it happens.
//
// Days you traded on are silently skipped when marking; that used to be announced up front,
// which spent a paragraph on a case the result already reports accurately when it occurs.
//
// Marking only. Un-excusing a whole range is a rare correction and the day panel's toggle
// already covers it, so the dialog stays a single, unambiguous action.
export default function AwayRangeDialog({
  today,
  onClose,
  onSaved,
}: {
  /** Today in the user's timezone — anchors the history bound. */
  today: string
  onClose: () => void
  onSaved?: () => void
}) {
  const [from, setFrom] = useState<string | undefined>()
  const [to, setTo] = useState<string | undefined>()
  // Whole day by default: a period you were away is normally away from everything, and the
  // exception (a week off the markets, habits running on) is a refinement, not the norm.
  const [scope, setScope] = useState<AwayScope>('both')
  const [saving, setSaving] = useState(false)

  // Clamp the picker to the same horizon the server enforces: excusing a day the rolling
  // stats can't see would change nothing, so it isn't offered in the first place.
  const min = format(subDays(parseISO(today), HISTORY_WINDOW_DAYS), 'yyyy-MM-dd')

  // A single click on the picker sets `from` only; treat that as a one-day range so the
  // user isn't forced to click the same square twice.
  const start = from
  const end = to ?? from
  const days = start && end ? eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }) : []
  // Surfaced live under the picker and on the confirm button, rather than accepting the
  // selection and rejecting it afterwards — the limit is a property of the selection, so
  // the user should see it the moment they cross it.
  const tooLong = days.length > AWAY_BULK_MAX

  const save = async () => {
    if (days.length === 0) {
      toast.error(t('progress.stats.awayRangeEmpty'))
      return
    }
    if (tooLong) {
      toast.error(t('progress.stats.awayRangeTooLong', { max: AWAY_BULK_MAX }))
      return
    }
    setSaving(true)
    try {
      const res = await setDaysAway(
        days.map((d) => format(d, 'yyyy-MM-dd')),
        true,
        scope,
      )
      if (handleRateLimit(res)) return
      // Days you traded on are silently ineligible (see setDaysAway), so the result has to
      // be reported as it happened — "3 days won't be counted" would be a lie when two of
      // them had trades and were left exactly as they were.
      if (res.count === 0) {
        toast.error(
          t(`progress.stats.awayRangeAllTraded.${res.skipped === 1 ? 'one' : 'other'}`, { days: res.skipped }),
        )
        return
      }
      toast.success(
        res.skipped > 0
          ? t('progress.stats.awayRangeDonePartial', { days: res.count, skipped: res.skipped })
          : t(`progress.stats.awayRangeDone.${res.count === 1 ? 'one' : 'other'}`, { days: res.count }),
      )
      onClose()
      onSaved?.()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'progress.rules.toast.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t('progress.stats.awayRangeTitle')}
      onClose={onClose}
      onConfirm={save}
      confirmLabel={saving ? t('progress.saving') : t('progress.save')}
      confirmDisabled={saving || days.length === 0 || tooLong}
      cancelLabel={t('progress.cancel')}
      className="max-w-3xl"
    >
      <p className="text-xs leading-relaxed text-muted-foreground">{t('progress.stats.awayRangeHint')}</p>
      {/* No quick ranges here: "this week" / "this quarter" are reporting periods, and
          nobody is away for a calendar quarter. The only sensible input is the actual
          stretch you were gone, so the picker offers just that. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('progress.stats.awayRangeScopeLabel')}</span>
        <AwayScopePicker value={scope} onChange={setScope} disabled={saving} />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t(`progress.day.awayScopeHint.${scope}`)}</p>
      <DateRangePicker
        from={from}
        to={to}
        min={min}
        showPresets={false}
        onChange={(f, tTo) => {
          setFrom(f)
          setTo(tTo)
        }}
      />
      {/* Count and Clear on one line, under the calendar. Clear used to live in the picker's
          right-hand column, which only existed for the quick ranges this dialog doesn't
          use — so it sat alone beside a centred calendar. It belongs next to the selection
          it undoes. */}
      {days.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <p className={cn('text-xs font-medium', tooLong ? 'text-loss' : 'text-foreground')}>
            {t(`progress.stats.awayRangeCount.${days.length === 1 ? 'one' : 'other'}`, { days: days.length })}
            {tooLong && <> · {t('progress.stats.awayRangeTooLong', { max: AWAY_BULK_MAX })}</>}
          </p>
          <button
            type="button"
            onClick={() => {
              setFrom(undefined)
              setTo(undefined)
            }}
            disabled={saving}
            className="rounded-md px-2 py-0.5 text-xs font-medium text-loss transition-colors hover:bg-loss/10 disabled:opacity-60"
          >
            {t('datepicker.clearRange')}
          </button>
        </div>
      )}
    </Modal>
  )
}
