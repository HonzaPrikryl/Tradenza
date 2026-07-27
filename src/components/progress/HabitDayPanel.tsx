'use client'

import { CalendarDays, CalendarRange, Loader2, CheckCircle2, Plane } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { avoidanceState, type AwayScope } from '@/lib/progress-compute'
import type { HabitDayData, DayRule } from '@/lib/actions/progress'
import ProgressRing from './ProgressRing'
import DayRulesSections from './DayRulesSections'
import DayStatusBadge from './DayStatusBadge'
import AwayScopePicker from './AwayScopePicker'
import Tooltip from '@/components/ui/Tooltip'
import { prettyDate } from '@/lib/progress-format'

// Habit day panel — the "capture" side of the Habits tab. Structurally identical to the
// trading day panel (DaySummaryPanel) on purpose, because the underlying model is the
// same (see the tasks-vs-constraints note in progress-compute):
//
//   • the ring and the x/y counter measure BUILDING habits only — the tasks you
//     actively do. An avoidance habit is satisfied by default, so counting it would
//     fill the ring overnight for doing nothing;
//   • avoidance habits get their own summary line next to the day badge ("3 clean" /
//     "1 slipped") and their own section in the list, and they gate the colour.
//
// The one deliberate difference from trading: a trading hard rule reddens the day on the
// first breach, an avoidance habit warns first and only reddens on a second consecutive
// scheduled slip ("never miss twice"). The messages below spell that out.
export default function HabitDayPanel({
  data,
  loading,
  busy = false,
  onToggle,
  onMarkAll,
  onToggleAway,
  onSetAwayScope,
  onExcuseRange,
}: {
  data: HabitDayData
  loading?: boolean
  busy?: boolean
  onToggle: (habitId: string, next: boolean) => void
  onMarkAll: () => void
  /** Toggle "I was away" — one calendar-day fact, shared with the trading tab. */
  onToggleAway?: () => void
  /** Narrow (or widen) which domains the excuse covers. Only reachable once it's on. */
  onSetAwayScope?: (scope: AwayScope) => void
  /** Open the range dialog to excuse a whole period at once. */
  onExcuseRange?: () => void
}) {
  const { scheduled, done, avoidTotal, avoidKept, anyScheduled, status, items } = data
  const editable = !data.isFuture
  const hasTasks = scheduled > 0
  const allDone = hasTasks && done === scheduled

  // An avoidance-only day has nothing to tick, so the ring can't show a fraction. It
  // mirrors the trading panel's no-trade check-in: full when the constraints held, empty
  // when one definitively broke — matching the day's quality score exactly.
  const ringRatio = hasTasks ? done / scheduled : status === 'red' ? 0 : 1

  // `completed` on an avoidance item means it stayed clean, so a slip is `!completed`.
  const avoidStates = items
    .filter((i) => i.type === 'hard')
    .map((i) => avoidanceState(!i.completed, i.prevSlip ?? false))
  const avoidBroken = avoidStates.filter((s) => s === 'broken').length
  const avoidWarning = avoidStates.filter((s) => s === 'warning').length

  // Why is an otherwise-good day amber or red? An avoidance slip can cap or redden the
  // day even when every building habit was kept, so — like the trading panel calls out a
  // broken hard rule before the task tally — name the avoidance cause first instead of
  // leaving a confusing "8/8 done" next to a red badge.
  const message = data.away
    ? t('progress.process.away')
    : anyScheduled === 0
      ? data.anyHabits
        ? t('progress.habits.day.dayOff')
        : t('progress.habits.day.none')
      : status === 'unlogged'
        ? t('progress.habits.day.unlogged')
        : avoidBroken > 0
          ? hasTasks
            ? t('progress.habits.day.avoidBroken', { done, total: scheduled })
            : t('progress.habits.day.avoidBrokenOnly')
          : avoidWarning > 0
            ? hasTasks
              ? t('progress.habits.day.avoidWarning', { done, total: scheduled })
              : t('progress.habits.day.avoidWarningOnly')
            : status === 'pending'
              ? hasTasks
                ? t('progress.habits.day.pending')
                : t('progress.habits.day.avoidPendingOnly')
              : !hasTasks
                ? t('progress.habits.day.avoidCleanOnly')
                : allDone
                  ? t('progress.habits.day.allDone')
                  : status === 'yellow'
                    ? t('progress.habits.day.someDoneYellow', { done, total: scheduled })
                    : status === 'red'
                      ? t('progress.habits.day.someDoneRed', { done, total: scheduled })
                      : t('progress.habits.day.someDone', { done, total: scheduled })

  // Map to the DayRule shape RuleRow renders. Building habits are soft (checkbox);
  // avoidance habits are hard (respected by default, tap to log a slip).
  const asRule = (i: HabitDayData['items'][number]): DayRule => ({
    id: i.id,
    name: i.name,
    description: i.description,
    type: i.type,
    category: 'habit',
    completed: i.completed,
  })

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <ProgressRing
          ratio={ringRatio}
          size={64}
          label={
            !hasTasks || allDone ? (
              status === 'red' ? (
                <span className="text-base text-loss">✕</span>
              ) : (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              )
            ) : (
              <span className="text-base">
                {done}
                <span className="text-muted-foreground">/{scheduled}</span>
              </span>
            )
          }
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {prettyDate(data.date)}
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {(anyScheduled > 0 || data.away) && <DayStatusBadge status={status} away={data.away} />}
            {/* Constraint summary, mirroring the trading panel's hard-rule line. */}
            {!data.away && avoidTotal > 0 && (
              <span
                className={cn('text-xs font-medium', avoidKept < avoidTotal ? 'text-loss' : 'text-muted-foreground')}
              >
                {avoidKept < avoidTotal
                  ? t('progress.habits.day.avoidSlippedCount', { count: avoidTotal - avoidKept })
                  : t(`progress.habits.day.avoidCleanCount.${avoidTotal === 1 ? 'one' : 'other'}`, {
                      total: avoidTotal,
                    })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          'rounded-lg border px-3 py-2.5 text-sm',
          status === 'green'
            ? 'border-primary/30 bg-primary/10 text-foreground'
            : status === 'red'
              ? 'border-loss/30 bg-loss/10 text-foreground'
              : status === 'yellow'
                ? 'border-amber-500/30 bg-amber-500/10 text-foreground'
                : // `pending` only ever means today — see DaySummaryPanel.
                  status === 'pending'
                  ? 'border-primary/20 bg-primary/5 text-foreground'
                  : 'border-border bg-muted/40 text-muted-foreground',
        )}
      >
        {message}
      </div>

      {/* Same away control as the trading panel — it's one fact about the day, so it can
          be set from whichever tab the user happens to be in. Hidden once the day has
          trades, since trading contradicts having been away. */}
      {editable && (onToggleAway || onExcuseRange) && (
        // One inline row of actions, wrapping when it must — identical to the trading
        // panel. They were stacked, which made two related controls read as two unrelated
        // sections and left the narrow column ragged.
        <div className="flex shrink-0 flex-wrap gap-2">
          {/* Bound to the RAW flag — see DaySummaryPanel for why the effective value left
              the toggle stuck. */}
          {onToggleAway && (
            <Tooltip label={t(data.awayFlag ? 'progress.day.awayOnHint' : 'progress.day.awayHint')}>
              <button
                type="button"
                onClick={onToggleAway}
                disabled={busy}
                aria-pressed={data.awayFlag}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60',
                  'focus-visible:ring-2 focus-visible:ring-primary focus:outline-none',
                  data.awayFlag
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-400'
                    : 'border-border text-muted-foreground hover:bg-accent/50',
                )}
              >
                <Plane className="h-3.5 w-3.5" />
                {t(data.awayFlag ? 'progress.day.awayOn' : 'progress.day.away')}
              </button>
            </Tooltip>
          )}
          {/* A holiday is a stretch, not a day — the same reasoning as the trading panel.
              This was missing here, so excusing a week from the Daily tab meant seven
              visits, and nobody makes seven. */}
          {onExcuseRange && (
            <Tooltip label={t('progress.stats.awayRangeButtonHint')}>
              <button
                type="button"
                onClick={onExcuseRange}
                disabled={busy}
                className={cn(
                  'flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-60',
                  'focus-visible:ring-2 focus-visible:ring-primary focus:outline-none',
                )}
              >
                <CalendarRange className="h-3.5 w-3.5" />
                {t('progress.stats.awayRange')}
              </button>
            </Tooltip>
          )}
          {/* Scope refinement — only once the day is excused. See AwayScopePicker for why
              it isn't offered before the user has said they were away at all. */}
          {data.awayFlag && onSetAwayScope && (
            <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
              <AwayScopePicker value={data.awayScope} onChange={onSetAwayScope} disabled={busy} />
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                {t(`progress.day.awayScopeHint.${data.awayScope}`)}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {anyScheduled === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {message}
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 max-xl:max-h-[26rem]">
            <DayRulesSections
              rules={items.map(asRule)}
              editable={editable}
              busy={busy}
              onToggleRule={onToggle}
              onMarkAllSoft={onMarkAll}
              labels={{
                constraints: t('progress.mode.name.avoidance'),
                tasks: t('progress.mode.name.building'),
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
