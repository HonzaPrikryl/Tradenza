'use client'

import { CalendarDays, Loader2, ArrowRight, CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { getUiLocale } from '@/i18n/config'
import type { DayProgress } from '@/lib/actions/progress'
import ProgressRing from './ProgressRing'
import DayRulesSections from './DayRulesSections'
import DayStatusBadge from './DayStatusBadge'

export function prettyDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(getUiLocale(), { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function DaySummaryPanel({
  day,
  loading,
  onViewDay,
  editable = false,
  busy = false,
  onToggleRule,
  onToggleCheckIn,
  onMarkAllSoft,
}: {
  day: DayProgress
  loading?: boolean
  onViewDay: () => void
  /** When true (viewing today), rules can be checked/unchecked inline. */
  editable?: boolean
  busy?: boolean
  onToggleRule?: (ruleId: string, next: boolean) => void
  /** Toggle the no-trade check-in (only meaningful when editable + no trades). */
  onToggleCheckIn?: () => void
  /** Mark every soft habit done in one tap (editable days with unfinished habits). */
  onMarkAllSoft?: () => void
}) {
  const { softDone, softTotal, hardTotal, hardViolations, status } = day
  const ratio = softTotal > 0 ? softDone / softTotal : 0
  const totalRules = day.rules.length

  // On an explicit no-trade CHECK-IN day soft habits don't apply, so the ring reflects
  // only hard-rule cleanliness (full & green when respected, empty when a hard rule
  // broke) rather than a misleading "0/10 soft" reading. A no-trade day that was NOT
  // checked in still scores by its soft ratio, like any other day.
  const cleanNoTrade = status !== 'none' && day.checkedIn && !day.hasTrades
  const ringRatio = cleanNoTrade ? (hardViolations > 0 ? 0 : 1) : ratio

  const emptyMessage = day.anyRules ? t('progress.day.noScheduledRules') : t('progress.day.noActiveRules')
  const message =
    totalRules === 0
      ? emptyMessage
      : status === 'none'
        ? t('progress.process.noScope')
        : hardViolations > 0
          ? t('progress.process.hardBroken', { count: hardViolations })
          : cleanNoTrade
            ? t('progress.process.noTrade')
            : status === 'green'
              ? t('progress.process.green')
              : status === 'yellow'
                ? t('progress.process.yellow', { completed: softDone, total: softTotal })
                : t('progress.process.redSoft', { completed: softDone, total: softTotal })

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <ProgressRing
          ratio={ringRatio}
          size={64}
          label={
            cleanNoTrade ? (
              hardViolations > 0 ? (
                <span className="text-base text-loss">✕</span>
              ) : (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              )
            ) : (
              <span className="text-base">
                {softDone}
                <span className="text-muted-foreground">/{softTotal}</span>
              </span>
            )
          }
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {prettyDate(day.date)}
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {totalRules > 0 && <DayStatusBadge status={status} />}
            {hardTotal > 0 && (
              <span className={cn('text-xs font-medium', hardViolations > 0 ? 'text-loss' : 'text-muted-foreground')}>
                {hardViolations > 0
                  ? hardViolations === 1
                    ? t('progress.hardBroken.one')
                    : t('progress.hardBroken.other', { count: hardViolations })
                  : t('progress.day.hardClean', { total: hardTotal })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Process message */}
      <div
        className={cn(
          'rounded-lg border px-3 py-2.5 text-sm',
          status === 'green'
            ? 'border-primary/30 bg-primary/10 text-foreground'
            : status === 'red'
              ? 'border-loss/30 bg-loss/10 text-foreground'
              : status === 'yellow'
                ? 'border-amber-500/30 bg-amber-500/10 text-foreground'
                : 'border-border bg-muted/40 text-muted-foreground',
        )}
      >
        {message}
      </div>

      {/* No-trade check-in: puts today into scope so it scores by the rules below,
          instead of the user having to open the day detail to find this control. */}
      {editable && !day.hasTrades && (
        <button
          type="button"
          onClick={onToggleCheckIn}
          disabled={busy}
          aria-pressed={day.checkedIn}
          title={t('progress.day.checkInNoTradeHint')}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60',
            day.checkedIn
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-accent/50',
          )}
        >
          {day.checkedIn ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
          {t('progress.day.checkInNoTrade')}
        </button>
      )}

      {/* Rules — one bounded, scrollable block. On xl the panel is height-matched
          to the calendar column (see ProgressClient), so this list caps at the
          trend card's bottom edge and only scrolls when the rules don't fit; it
          never grows the row. Below xl it just caps at a fixed max height. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {totalRules === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 max-xl:max-h-[26rem]">
            <DayRulesSections
              rules={day.rules}
              editable={editable}
              busy={busy}
              onToggleRule={onToggleRule}
              onMarkAllSoft={onMarkAllSoft}
            />
          </div>
        )}
      </div>

      {/* View day */}
      <button
        onClick={onViewDay}
        className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {t('progress.day.viewDay')}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}
