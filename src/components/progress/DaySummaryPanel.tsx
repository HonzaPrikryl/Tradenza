'use client'

import { CalendarDays, CalendarRange, Loader2, ArrowRight, CheckCircle2, Circle, Plane } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { DayProgress } from '@/lib/actions/progress'
import { isCleanNoTrade, type AwayScope } from '@/lib/progress-compute'
import { prettyDate } from '@/lib/progress-format'
import Tooltip from '@/components/ui/Tooltip'
import ProgressRing from './ProgressRing'
import DayRulesSections from './DayRulesSections'
import DayStatusBadge from './DayStatusBadge'
import AwayScopePicker from './AwayScopePicker'

export default function DaySummaryPanel({
  day,
  loading,
  onViewDay,
  editable = false,
  busy = false,
  onToggleRule,
  onToggleCheckIn,
  onToggleAway,
  onSetAwayScope,
  onExcuseRange,
  onMarkAllSoft,
}: {
  day: DayProgress
  loading?: boolean
  onViewDay: () => void
  /** When true (viewing today), rules can be checked/unchecked inline. */
  editable?: boolean
  busy?: boolean
  onToggleRule?: (ruleId: string, next: boolean) => void
  /** Toggle the day's review flag — the no-trade check-in / the day's confirmation. */
  onToggleCheckIn?: () => void
  /** Toggle "don't count this day" — excuses it from the streak and from coverage. */
  onToggleAway?: () => void
  /** Narrow (or widen) which domains the excuse covers. Only reachable once it's on. */
  onSetAwayScope?: (scope: AwayScope) => void
  /** Open the range dialog to excuse a whole period at once. */
  onExcuseRange?: () => void
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
  //
  // Uses the SHARED predicate — this was a fourth, hand-rolled copy of it. The extra
  // `status !== 'none'` guard stays: an away day is reported as 'none' and must show the
  // plain tally, not the clean-day tick.
  const cleanNoTrade = status !== 'none' && isCleanNoTrade(day.checkedIn, day.hasTrades)
  // A breached constraint zeroes the day whatever the task tally says — that's what the
  // colour, the score and the averages all do. The ring used to ignore it, so a red day
  // with every task ticked showed a full green "8/8" ring next to a red badge. It now
  // empties, matching the day's actual score (the tally is still printed in the middle).
  const ringRatio = hardViolations > 0 ? 0 : cleanNoTrade ? 1 : ratio

  const emptyMessage = day.anyRules ? t('progress.day.noScheduledRules') : t('progress.day.noActiveRules')
  const message = day.away
    ? t('progress.process.away')
    : totalRules === 0
      ? emptyMessage
      : status === 'none'
        ? t('progress.process.noScope')
        : status === 'unlogged'
          ? t('progress.process.unlogged')
          : hardViolations > 0
            ? t('progress.process.hardBroken', { count: hardViolations })
            : cleanNoTrade
              ? // Tasks are not applicable on a sat-out day: they're dropped from their own
                // rates and streaks (neither credited nor held against you). The panel still
                // renders them tickable — a trade imported into this day later un-does the
                // no-trade flag and the ticks start counting — but silently ignoring a tick
                // the user just made is exactly the kind of thing that has to be said.
                t(softTotal > 0 ? 'progress.process.noTradeWithTasks' : 'progress.process.noTrade')
              : status === 'pending'
                ? t('progress.process.pending', { completed: softDone, total: softTotal })
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
            {(totalRules > 0 || day.away) && <DayStatusBadge status={status} away={day.away} />}
            {!day.away && hardTotal > 0 && (
              <span className={cn('text-xs font-medium', hardViolations > 0 ? 'text-loss' : 'text-muted-foreground')}>
                {hardViolations > 0
                  ? hardViolations === 1
                    ? t('progress.hardBroken.one')
                    : t('progress.hardBroken.other', { count: hardViolations })
                  : t(`progress.day.hardClean.${hardTotal === 1 ? 'one' : 'other'}`, { total: hardTotal })}
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
                : // `pending` only ever means today, which is live — primary tint.
                  status === 'pending'
                  ? 'border-primary/20 bg-primary/5 text-foreground'
                  : 'border-border bg-muted/40 text-muted-foreground',
        )}
      >
        {message}
      </div>

      {/* Day-level controls, inline so the user never has to open the day detail to find
          them. Two distinct jobs, deliberately not merged into one toggle:

          • REVIEW — on a trade-less day it puts the day into scope so it scores by the
            rules below; on a trading day it CONFIRMS the day, which is what admits it to
            the "does discipline pay off?" sample.
          • AWAY — holiday / illness. Takes the day out of measurement entirely instead of
            letting it rot into a red square and break the streak.

          Both are TOGGLES and both stay on screen once switched on. The review button used
          to hide itself the moment the day became confirmed — which is the moment you'd
          just pressed it — so a mis-click was unfixable from here.

          On a day with NO TRADES it is always offered, because there it isn't a
          confirmation at all: it's the "I sat this one out" flag, and that is a fact about
          the day the user can only state by pressing it. Ticking a prep task first — then
          deciding the day was a no-trade day — is an ordinary sequence, and hiding the
          button after the first tick made it impossible. Only on a TRADING day, where the
          button just confirms a day a tick has already confirmed, does it stand down. */}
      {editable && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {!day.away && (!day.hasTrades || !day.confirmed || day.checkedIn) && (
            <Tooltip
              label={t(
                day.hasTrades
                  ? day.checkedIn
                    ? 'progress.day.confirmDayOnHint'
                    : 'progress.day.confirmDayHint'
                  : day.checkedIn
                    ? 'progress.day.checkInNoTradeOnHint'
                    : 'progress.day.checkInNoTradeHint',
              )}
            >
              <button
                type="button"
                onClick={onToggleCheckIn}
                disabled={busy}
                aria-pressed={day.checkedIn}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60',
                  'focus-visible:ring-2 focus-visible:ring-primary focus:outline-none',
                  day.checkedIn
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent/50',
                )}
              >
                {day.checkedIn ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                {t(
                  day.hasTrades
                    ? day.checkedIn
                      ? 'progress.day.confirmDayOn'
                      : 'progress.day.confirmDay'
                    : day.checkedIn
                      ? 'progress.day.checkInNoTradeOn'
                      : 'progress.day.checkInNoTrade',
                )}
              </button>
            </Tooltip>
          )}
          {/* Hidden on a day you traded: a trade overrides a trading excuse, so the control
              would write a state THIS panel can never show. Since scopes exist the day could
              still be excused for Daily — that lives in the Daily panel, which is the tab
              that can actually display the result. Also hidden beyond the stats window,
              which nothing reads. */}
          {!day.hasTrades && day.withinHistory && (
            // Bound to the RAW flag, not the effective one. They diverge on a day you
            // marked away and then logged something on: the effective value self-negates to
            // false, so the button used to read "Don't count this day" about a day that was
            // already marked — and pressing it wrote `true` again, leaving no way to clear
            // the flag at all.
            //
            // Off: what pressing it does. On: what state you're in and how to get out.
            <Tooltip label={t(day.awayFlag ? 'progress.day.awayOnHint' : 'progress.day.awayHint')}>
              <button
                type="button"
                onClick={onToggleAway}
                disabled={busy}
                aria-pressed={day.awayFlag}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60',
                  'focus-visible:ring-2 focus-visible:ring-primary focus:outline-none',
                  day.awayFlag
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-400'
                    : 'border-border text-muted-foreground hover:bg-accent/50',
                )}
              >
                <Plane className="h-3.5 w-3.5" />
                {t(day.awayFlag ? 'progress.day.awayOn' : 'progress.day.away')}
              </button>
            </Tooltip>
          )}
          {/* A holiday is a stretch, not a day. Without this the single-day toggle costs
              one visit per day of it and gets used for none of them. */}
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
          {/* The scope refinement, shown only once the day IS excused — see AwayScopePicker
              for why it isn't offered up front. */}
          {day.awayFlag && onSetAwayScope && (
            <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
              <AwayScopePicker value={day.awayScope} onChange={onSetAwayScope} disabled={busy} />
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                {t(`progress.day.awayScopeHint.${day.awayScope}`)}
              </p>
            </div>
          )}
          {/* Flag on and it covers trading, but the day scores anyway: you logged something
              here, and evidence that you turned up beats the excuse (dayIsAway). Without
              saying so, the button reads "Not counted" next to a day that visibly IS
              counted. Suppressed when the scope already explains it. */}
          {day.awayFlag && day.awayScope !== 'habits' && !day.away && (
            <p className="w-full text-[11px] leading-relaxed text-muted-foreground/80">
              {t('progress.day.awayKeptTrading')}
            </p>
          )}
        </div>
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
