// Effective-dated discipline rules. A rule applies to a day based on its own lifecycle AS
// IT STOOD THAT DAY, not on the current set of rules or their current settings — so adding,
// archiving, pausing or rescheduling a rule never re-scores the days behind it (see
// scheduleOn). Pure (no 'use server') for reuse + unit testing.
//
// All days are "yyyy-MM-dd" strings, which compare correctly lexicographically.

// ─── Tasks vs. constraints — the one model both domains share ─────────────────
//
// Every rule is one of two things, and the distinction decides how it is counted:
//
//   TASK       (trading 'soft' / habit 'soft' = building)
//              Something you actively DO. A logged row is evidence you did it.
//              Tasks — and ONLY tasks — form the day's `done / total` counter, the
//              progress ring and every completion ratio.
//
//   CONSTRAINT (trading 'hard' / habit 'hard' = avoidance "No X")
//              Something you must NOT do. It is satisfied by default and all day, and
//              a logged row is a BREACH. A constraint therefore never contributes to
//              the counter — an untouched day must not read as "2/5 done" just because
//              two constraints haven't been broken yet, and a ring that fills itself
//              overnight measures nothing. Constraints are shown in their own section
//              with their own state and they gate the day's COLOUR.
//
// The two domains differ in one deliberate way — how much a breach costs:
//   trading constraint  → one breach turns the day red. A max-daily-loss is
//                         non-negotiable; there is no "warning" tier for it.
//   habit constraint    → one slip is a warning (amber), a slip on two consecutive
//                         scheduled days is broken (red). "Never miss twice": one
//                         glass of wine is not a failed month.
// Everything else about them — default-satisfied, breach-by-logging, excluded from the
// counter, own section — is identical, and both surfaces must render it identically.

/**
 * A rule tier. 'hard' rules are CONSTRAINTS (default-satisfied, breached by logging);
 * 'soft' rules are TASKS (scored by completion). See the model note above.
 */
export type RuleType = 'hard' | 'soft'

/**
 * Rule domain. 'trading' rules drive the day status (green/yellow/red) and the
 * PnL correlation stats. 'habit' rules are general daily habits with 'soft'
 * semantics only — tracked with their own streaks, never affecting day status.
 */
export type RuleCategory = 'trading' | 'habit'

// ─── Rule mode — the name the user actually sees ──────────────────────────────
//
// `ruleType` is the physical encoding and it is overloaded: 'hard' means "one breach
// reddens the day" on a trading rule and "never miss twice" on a daily habit. That is
// fine in the database, where (type, category) together are unambiguous, but it leaks
// into the UI as two unrelated-looking words ("Hard" vs "Avoidance") for what is the
// same class of thing — a constraint — with two different tolerances.
//
// So the domain speaks in MODES, and everything user-facing branches on the mode rather
// than on the raw tier:
//
//   'strict'    trading constraint  — one breach → red. A risk limit has no soft edge.
//   'avoidance' habit constraint    — slip → amber, two scheduled days running → red.
//   'building'  task (either domain) — you tick it off; it scores the day.
//
// Storage is unchanged (see the note on `ruleType` in db/schema): the mode is derived,
// so there is no migration and no second source of truth to keep in sync.
export type RuleMode = 'strict' | 'avoidance' | 'building'

/** The user-facing mode of a rule, derived from its stored tier + domain. */
export function ruleModeOf(rule: { type: RuleType; category: RuleCategory }): RuleMode {
  if (rule.type !== 'hard') return 'building'
  return rule.category === 'habit' ? 'avoidance' : 'strict'
}

/** Is this mode a constraint (default-satisfied, breached by logging)? */
export function isConstraintMode(mode: RuleMode): boolean {
  return mode !== 'building'
}

/**
 * A schedule the rule USED to run on. Covers days `< until` and begins where the previous
 * segment ended (or at the rule's creation day). See `progressRuleSchedules` in db/schema.
 */
export interface ScheduleSegment {
  /** EXCLUSIVE end — the day the next schedule started applying. */
  until: string
  /** ISO weekdays that applied during the segment. EMPTY = paused, nothing expected. */
  days: number[]
}

export interface RuleLifecycle {
  id: string
  /** hard = anti-self-destruction (violation → red day); soft = quality habit. */
  type: RuleType
  /** Day the rule started applying (its creation day, in the user's timezone). */
  createdDay: string
  /** Day it stopped applying (deletion/pause day), or null while still live. */
  archivedDay: string | null
  /** Whether the rule is currently running (false = paused). */
  active: boolean
  /**
   * ISO weekdays (1=Mon … 7=Sun) the rule runs on NOW — the LIVE segment only, not the
   * whole history. Read it through {@link scheduleOn}, never directly, or a schedule change
   * silently re-scores the past.
   */
  activeDays: number[]
  /** Superseded schedules, oldest first. Absent for a rule that was never edited. */
  scheduleHistory?: ScheduleSegment[]
}

/** Nothing scheduled — a paused stretch, or a rule outside its own lifetime. */
const NOTHING_SCHEDULED: readonly number[] = []

/**
 * The schedule in force on `day` — every scheduling question goes through here.
 *
 * A schedule change is forward-only: each superseded schedule stays attached to the days it
 * governed, and only the live segment (from the newest boundary on) uses `activeDays`. A
 * pause is read from the same history as a segment with no days, so a paused day expects
 * nothing whether it is today or long past.
 *
 * The exception is a rule paused BEFORE this history existed: there is no boundary to read,
 * so rather than invent a pause date and erase months of real history it falls back to the
 * old forward-only rule — excluded from today on, counted before it.
 */
export function scheduleOn(day: string, today: string, r: RuleLifecycle): readonly number[] {
  const history = r.scheduleHistory
  // Segments are ordered, so the first one that hasn't ended is the one covering `day`.
  if (history) for (const seg of history) if (day < seg.until) return seg.days
  if (r.active) return r.activeDays
  const pauseRecorded = Boolean(history?.length)
  if (pauseRecorded) return NOTHING_SCHEDULED
  return day >= today ? NOTHING_SCHEDULED : r.activeDays // legacy pause
}

/** Was the rule scheduled on `day`'s weekday, under the schedule in force that day? */
export function scheduledOnDay(day: string, today: string, r: RuleLifecycle): boolean {
  return scheduleOn(day, today, r).includes(isoWeekdayOf(day))
}

/** Every day of the week — the default schedule. */
export const ALL_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7]

/**
 * Mon–Fri. The sane default for TRADING rules: a scheduled soft rule you never logged
 * counts as a missed process day (see hasUnmetSoftObligation), so putting a trading
 * rule on the weekend would paint every Saturday and Sunday red for no reason. Daily
 * habits keep ALL_WEEKDAYS — going to the gym on a Sunday is a normal expectation.
 */
export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5]

/**
 * ISO weekday (1=Mon … 7=Sun) of a "yyyy-MM-dd" day key. Computed in UTC so it
 * never drifts across DST boundaries; the key is already in the user's calendar,
 * so no timezone input is needed.
 */
export function isoWeekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=Sun … 6=Sat
  return dow === 0 ? 7 : dow
}

/**
 * Is the rule in effect on `day`?
 *
 * - Not before it was created, not on/after it was archived.
 * - Not on weekdays outside the schedule in force THAT DAY (see {@link scheduleOn}), which
 *   also covers pauses — a paused stretch has nothing scheduled.
 */
export function ruleInEffectOn(day: string, today: string, r: RuleLifecycle): boolean {
  if (r.createdDay > day) return false
  if (r.archivedDay !== null && day >= r.archivedDay) return false
  return scheduledOnDay(day, today, r)
}

/** How many rules were in effect on `day` — the denominator for that day. */
export function expectedRulesOn(day: string, today: string, rules: RuleLifecycle[]): number {
  let n = 0
  for (const r of rules) if (ruleInEffectOn(day, today, r)) n++
  return n
}

/** The ids of rules in effect on `day` (to pick/filter completions for that day). */
export function ruleIdsInEffectOn(day: string, today: string, rules: RuleLifecycle[]): Set<string> {
  const ids = new Set<string>()
  for (const r of rules) if (ruleInEffectOn(day, today, r)) ids.add(r.id)
  return ids
}

/**
 * Every ISO weekday these rules run on at any point from `sinceDay` on — live schedules plus
 * any superseded one that overlapped the window. Backs the by-weekday breakdown's
 * "scheduled" flag: a rule that ran on Saturdays until last month has real Saturday samples
 * in the window, so that column must not read as a weekday nothing is scheduled on.
 */
export function scheduledWeekdaysOf(rules: RuleLifecycle[], sinceDay: string): Set<number> {
  const out = new Set<number>()
  for (const r of rules) {
    for (const iso of r.activeDays) out.add(iso)
    for (const seg of r.scheduleHistory ?? []) {
      if (seg.until > sinceDay) for (const iso of seg.days) out.add(iso)
    }
  }
  return out
}

/** How many SOFT rules were in effect on `day` — the "you must actively do this" set. */
export function expectedSoftRulesOn(day: string, today: string, rules: RuleLifecycle[]): number {
  let n = 0
  for (const r of rules) if (r.type === 'soft' && ruleInEffectOn(day, today, r)) n++
  return n
}

/**
 * A scheduled soft rule that you neither logged nor marked no-trade brings the day into
 * scope so it scores instead of sitting out as grey. On TODAY it reads as `pending` (the
 * day isn't over — see resolveTodayStatus); on a PAST day it's a real miss (→ red). The
 * future never counts. Callers OR this into {@link dayInScope}.
 */
export function hasUnmetSoftObligation(day: string, today: string, rules: RuleLifecycle[]): boolean {
  return day <= today && expectedSoftRulesOn(day, today, rules) > 0
}

// ─── Two-tier day scoring ────────────────────────────────────────────────────
//
// A day's colour is decided in steps:
//   1. Any HARD rule violated → RED. No exceptions — one revenge trade can't be
//      offset by a tidy prep routine, and it holds even on a no-trade day.
//   2. An explicit NO-TRADE CHECK-IN turns the day into a clean day: GREEN (unless a
//      hard rule broke). Soft habits are often entry/exit-specific and don't apply
//      when you deliberately sat out, so the check-in says "score me as disciplined,
//      ignore the soft tallies" — and this day's soft stats are dropped from every
//      widget (see actions/progress) to avoid a half-ticked day skewing the numbers.
//   3. Otherwise the colour comes from the *share* of soft habits done — including a
//      no-trade day you did NOT check in (its ticked habits still score it). Ratios,
//      not raw counts: with only 2 habits, missing both is a disaster (0%), not a
//      "yellow warning". Below 30% done is red, 30–50% yellow, 50%+ green.
//
// Days with no trades and no explicit check-in (and no ticked rule) are normally OUT
// OF SCOPE — grey. The one exception: a PAST day that had soft rules scheduled is an
// unmet obligation (you neither logged your process nor marked it no-trade), so it
// scores as a miss (→ red) rather than sitting out as grey. See hasUnmetSoftObligation.

// Status of a single day's discipline.
//
//   none      out of scope — nothing was scheduled, or the day is marked away (grey).
//   unlogged  something WAS scheduled, but the day carries no data at all: no rule was
//             ticked or flagged, and the day was never marked reviewed. See below.
//   pending   unsettled — today, still in progress.
//   green/yellow/red  a real verdict, only ever assigned to a day with data.
//
// `unlogged` exists because "I fell short of my process" and "I wasn't using the app
// that day" are different facts, and scoring the second one as red corrupts everything
// downstream: the heatmap, the clean-day count, the rolling average, and above all the
// by-weekday breakdown, which silently turns from "which day do I slip?" into "which day
// do I forget to log?". So red now means only the first thing.
//
// The obvious objection is gaming: if no data were simply neutral, you could keep a
// perfect record by never logging. It isn't neutral — a settled unlogged day BREAKS the
// clean streak and is counted against logging coverage. Inaction still costs something
// real; it just no longer lies about what happened.
export type DayStatus = 'none' | 'unlogged' | 'green' | 'yellow' | 'red' | 'pending'

/**
 * An unfinished day isn't a failed day. While a day is still OPEN — today (see
 * {@link dayIsOpen}) — a day that isn't green yet and has no DEFINITIVE violation (a hard
 * rule already broken / an avoidance slip already logged) shows as `pending` instead of
 * yellow/red: there is still time to finish it. Green (complete) and definitive reds are
 * kept as-is. Settled days pass through unchanged.
 */
export function resolveTodayStatus(status: DayStatus, isOpen: boolean, definitive: boolean): DayStatus {
  if (!isOpen || definitive) return status
  // `unlogged` is held here too: while the day is running it hasn't committed to anything,
  // so the streak grants it grace (the helpers skip `pending`). At midnight it settles as
  // `unlogged` and breaks the run.
  return status === 'yellow' || status === 'red' || status === 'unlogged' ? 'pending' : status
}

/** Below this share of soft habits done → red. */
export const SOFT_RED_MAX_RATIO = 0.3
/** Below this share of soft habits done → yellow; at or above → green. */
export const SOFT_YELLOW_MAX_RATIO = 0.5

/**
 * A day counts toward discipline scoring ("in scope") when it had trades, an
 * explicit check-in, or at least one logged rule row. Single source of truth so the
 * server scorers and the client's optimistic recompute never drift apart.
 */
export function dayInScope(input: { hasTrades: boolean; checkedIn: boolean; hasLoggedRules: boolean }): boolean {
  return input.hasTrades || input.checkedIn || input.hasLoggedRules
}

// ─── Confirmed vs. merely unfilled ───────────────────────────────────────────
//
// A constraint is satisfied by DEFAULT, which means silence looks exactly like
// compliance: a user who never opens the app would score a 100% respect rate. That is
// fine for the day's colour (there is nothing better to show), but it is NOT evidence,
// and evidence is what the discipline→P&L correlation claims to weigh. So the day
// carries a second, independent bit:
//
//   CONFIRMED — the user actually engaged with this day: they ticked or flagged at
//               least one rule, or explicitly marked the day reviewed.
//   UNFILLED  — the day only exists because trades were imported into it. It still gets
//               a colour, but it never enters the payoff buckets.
//
// Without this the widget answers "when did I feel like ticking boxes?" rather than
// "does discipline pay off?". It deliberately does not gate the colour or the streaks:
// nagging every un-reviewed day into red is not this flag's job.

/**
 * Did the user actually confirm this day, rather than leaving it unfilled? Logging any
 * rule row counts as engagement, so a normal day of ticking needs no extra click; an
 * explicit review (check-in) covers the case where there was nothing to tick — e.g. a
 * rule set made only of constraints.
 */
export function dayConfirmed(input: { checkedIn: boolean; hasLoggedRules: boolean }): boolean {
  return input.checkedIn || input.hasLoggedRules
}

// ─── Away days ───────────────────────────────────────────────────────────────
//
// Holiday, illness, a public holiday, a funeral. Without a way to say "don't measure
// this day", every break turns into a run of red squares and a dead streak — which is
// the fastest way to make somebody abandon a habit tracker after their first week off.
// An away day is NEUTRAL, exactly like a weekday no rule is scheduled on: grey, absent
// from every average, and skipped by the streak walk so it neither extends nor breaks
// the run.

/**
 * Is this day marked away *and* eligible to be?
 *
 * Excusing a day removes the OBLIGATION, never the RECORD. So any evidence that you did
 * in fact show up wins over the flag, which self-negates instead of needing a corrective
 * DB write — the same trick {@link isCleanNoTrade} uses for a stale no-trade check-in.
 *
 * `showedUp` is evaluated PER DOMAIN, and that is what makes one shared calendar-day flag
 * safe: the trading side counts trades and logged rules, the habits side counts logged
 * habits. A holiday you nonetheless kept your habits through is excused for trading and
 * still scored — and credited — for habits, which is exactly right. Without this, marking
 * a holiday would quietly delete work the user actually did.
 */
export function dayIsAway(away: boolean, showedUp: boolean): boolean {
  return away && !showedUp
}

// ─── What still overrides an excuse, now that scope exists ───────────────────
//
// `showedUp` used to include LOGGED ROWS — a ticked trading rule, a logged habit — on the
// reasoning that they prove you turned up. That was the only way to express "excused for
// trading, still scored for habits" before {@link AwayScope} existed.
//
// It now fights the control it used to stand in for. Say "don't count this day, trading
// only" on a day whose tasks you had already ticked and the inference cancels the excuse:
// the day stays coloured, the button reads "Not counted", and the user's explicit
// instruction is silently overruled by a guess. An explicit statement must beat an
// inference drawn from the same data.
//
// So only TRADES still override, and only for trading. A trade is a hard fact you cannot
// take back, and it can arrive by import into a day excused months ago — calling such a day
// "not counted" for trading would be false. Ticked rows override nothing: the record is
// kept either way, so nothing is lost by honouring what the user said.
//
// Habits have no equivalent hard fact, so nothing overrides there — "Trading only" is how
// you now say "the markets were shut for me, the gym wasn't".

/** Is `day` excused for TRADING? Trades are the one thing that still beats the flag. */
export function tradingDayExcused(opts: { away: boolean; scope: AwayScope; hasTrades: boolean }): boolean {
  return dayIsAway(opts.away && awayAppliesTo(opts.scope, 'trading'), opts.hasTrades)
}

/** Is `day` excused for HABITS? Nothing overrides — see the note above. */
export function habitDayExcused(opts: { away: boolean; scope: AwayScope }): boolean {
  return opts.away && awayAppliesTo(opts.scope, 'habits')
}

/**
 * Which side of the app an excused day applies to.
 *
 * A holiday is one fact about the day, so the flag stays one row and `both` is the default
 * — the common case must stay one click. But "away" and "didn't trade" are not the same
 * thing, and a trader who takes a week off the markets while still going to the gym had no
 * way to say so: the shared flag greyed out their habits too.
 *
 * This is deliberately NOT a second flag. Two independent booleans would make the ordinary
 * case (really away, from everything) cost two actions to serve the exception, and would
 * let the two drift into states nobody meant.
 */
export type AwayScope = 'both' | 'trading' | 'habits'

/** The domains a scope covers, in the order the UI presents them. */
export const AWAY_SCOPES: readonly AwayScope[] = ['both', 'trading', 'habits']

/**
 * Does an excused day with this scope apply to `domain`?
 *
 * Kept beside {@link dayIsAway} because the two are separate gates and both must pass: the
 * scope says which domain the user MEANT to excuse, the self-negation says whether they
 * turned up anyway. Evidence still wins — excusing trading and then trading is inert, the
 * same as before.
 */
export function awayAppliesTo(scope: AwayScope, domain: 'trading' | 'habits'): boolean {
  return scope === 'both' || scope === domain
}

// ─── Open vs. settled ────────────────────────────────────────────────────────
//
// A day is OPEN while it is still running — that is, today (and, trivially, the future).
// Everything behind it is SETTLED: it has whatever data it has, and it scores.
//
// There used to be a backfill GRACE WINDOW here: the last couple of days also counted as
// open, so a day you forgot to log read as "not logged yet" instead of costing you a
// streak. It was removed because it conflated two different things and got one of them
// wrong:
//
//   • "can I still edit this day?"  — YES, for every past day. Back-filling has no
//     deadline (see toggleRuleCompletion: only the FUTURE is refused). A window that
//     implied otherwise was describing a rule that doesn't exist.
//   • "does this day count yet?"    — the real question, and a grace period made the
//     answer temporarily "no" for reasons the user couldn't see. A streak would hold at 4
//     and then silently drop to 1 two days later when the window closed.
//
// So a settled day with nothing recorded is simply `unlogged`, immediately: it isn't red
// (it's absence of data, not a failure — see the DayStatus note), it stays out of every
// average, and it breaks the streak. One state, no timer.

/**
 * Upper bound on excusing days in one write. Lives here rather than beside the action
 * because a `'use server'` module may only export async functions — the dialog needs the
 * same number to validate before it submits, and the two must not drift.
 */
export const AWAY_BULK_MAX = 31

/**
 * Length limits for a rule's name and description. Here for the same reason as
 * AWAY_BULK_MAX: the zod schema enforces them and the dialog has to know them to stop the
 * user at the boundary rather than rejecting text they've already written.
 */
export const RULE_NAME_MAX = 80
export const RULE_DESC_MAX = 280

/**
 * How far back the rolling stats actually look. Every streak walk, per-rule rate, trend
 * and correlation window in the module is bounded by this, so a day older than it is
 * invisible to everything except its own year heatmap.
 *
 * It therefore also bounds what's worth *editing*: excusing a day the statistics can't
 * see does nothing, and offering the action anyway is a promise the app can't keep. The
 * date pickers clamp to it and the actions reject beyond it.
 */
export const HISTORY_WINDOW_DAYS = 365

/** Is `day` inside the rolling history window (or in the future)? */
export function dayWithinHistory(day: string, today: string, windowDays: number = HISTORY_WINDOW_DAYS): boolean {
  return day >= shiftDayKey(today, -windowDays)
}

/**
 * Is `day` unsettled — i.e. still running? True for today and (vacuously) the future.
 *
 * Kept as a named predicate rather than inlining `day >= today` because that comparison
 * appears in a dozen scorers and it is the *meaning* that matters: an open day can still
 * change before it is judged, so it holds at `pending` instead of committing to a verdict.
 */
export function dayIsOpen(day: string, today: string): boolean {
  return day >= today
}

/** Local day-key shift, so this module stays dependency-free (mirrors lib/date-tz). */
function shiftDayKey(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

/**
 * An explicit no-trade check-in: the user reviewed a day on which they took no
 * trades. Its soft tallies are treated as not-applicable (see computeDayStatus) —
 * the day scores as a clean, disciplined sit-out.
 */
export function isCleanNoTrade(checkedIn: boolean, hasTrades: boolean): boolean {
  return checkedIn && !hasTrades
}

export interface DayScore {
  status: DayStatus
  /** Whether the day counts at all (had trades or an explicit check-in). */
  inScope: boolean
  /**
   * An explicit no-trade check-in day (checked in AND no trades). Its soft tallies
   * are treated as not-applicable: the day is clean-green and its soft stats are
   * excluded from the widgets.
   */
  cleanNoTrade: boolean
  hardTotal: number
  hardViolations: number
  softTotal: number
  softDone: number
  /** softDone / softTotal, or 0 when no soft habits were scheduled. */
  softRatio: number
}

/**
 * Map the day's tallies to a colour. Pure and free of any counting logic so it's
 * trivial to unit-test the thresholds in isolation.
 */
export function computeDayStatus(input: {
  inScope: boolean
  /** Explicit no-trade check-in (checked in and no trades). Soft tallies ignored. */
  cleanNoTrade: boolean
  /**
   * Did the day get any data — a ticked/flagged rule, or an explicit review? Without it
   * there is nothing to judge, so the day is `unlogged` rather than a failing score.
   * Defaults to true so a caller that genuinely has no notion of confirmation keeps the
   * old, purely tally-driven behaviour.
   */
  confirmed?: boolean
  /** Hard rules in effect that day — with softTotal, tells us if ANY rule applied. */
  hardTotal: number
  hardViolations: number
  softTotal: number
  softDone: number
}): DayStatus {
  const { inScope, cleanNoTrade, confirmed = true, hardTotal, hardViolations, softTotal, softDone } = input
  if (!inScope) return 'none'
  // No rule was in effect this day (none created yet, or none scheduled). There's
  // nothing to measure, so it stays grey/out-of-scope for discipline — a day you only
  // traded on, before you had any rules, must not read as "on plan".
  if (hardTotal === 0 && softTotal === 0) return 'none'
  // Scheduled, but nothing was ever recorded: no data, so no verdict. Checked before the
  // tallies precisely so an empty day can't be read as "0% of habits done".
  if (!confirmed) return 'unlogged'
  // A broken hard rule is non-negotiable — red even on a no-trade check-in day.
  if (hardViolations > 0) return 'red'
  // Explicit no-trade check-in → clean day. Soft habits are entry/exit-specific and
  // don't apply when you deliberately sat out, so their tallies never gate the colour.
  if (cleanNoTrade) return 'green'
  // No soft habits scheduled: a clean, in-scope day with hard rules respected.
  if (softTotal === 0) return 'green'
  const ratio = softDone / softTotal
  if (ratio < SOFT_RED_MAX_RATIO) return 'red'
  if (ratio < SOFT_YELLOW_MAX_RATIO) return 'yellow'
  return 'green'
}

/**
 * Score one day from the rules in effect and the set of logged rule ids for that
 * day. A logged id means different things per tier:
 *   soft rule → habit DONE     (counts toward the score)
 *   hard rule → rule VIOLATED  (any single one forces red)
 *
 * `inScope` should be true when the day had trades or an explicit check-in.
 */
export function computeDayScore(
  day: string,
  today: string,
  rules: RuleLifecycle[],
  loggedRuleIds: Set<string>,
  inScope: boolean,
  cleanNoTrade: boolean,
  /** Did the day get any data? Without it the day is `unlogged` — see computeDayStatus. */
  confirmed = true,
): DayScore {
  let hardTotal = 0
  let hardViolations = 0
  let softTotal = 0
  let softDone = 0
  for (const r of rules) {
    if (!ruleInEffectOn(day, today, r)) continue
    if (r.type === 'hard') {
      hardTotal++
      if (loggedRuleIds.has(r.id)) hardViolations++
    } else {
      softTotal++
      if (loggedRuleIds.has(r.id)) softDone++
    }
  }
  const status = computeDayStatus({
    inScope,
    cleanNoTrade,
    confirmed,
    hardTotal,
    hardViolations,
    softTotal,
    softDone,
  })
  return {
    status,
    inScope,
    cleanNoTrade,
    hardTotal,
    hardViolations,
    softTotal,
    softDone,
    softRatio: softTotal > 0 ? softDone / softTotal : 0,
  }
}

// ─── Client-side day tally ───────────────────────────────────────────────────
//
// The day panels recompute a day's score optimistically as the user ticks rules,
// before the server round-trips. This is the single place that turns a set of
// already-in-effect day rules into the trading tallies + colour — enforcing, on the
// client too, that general habits (category 'habit', also stored as 'soft') never
// feed the trading day status. Server parity: mirrors getDayProgress.

/** The minimum a day rule needs to expose for a client-side tally. */
export interface TallyRule {
  type: RuleType
  category: RuleCategory
  /** Good state: soft/habit = done, hard = respected. */
  completed: boolean
}

export interface DayTally {
  status: DayStatus
  hardTotal: number
  hardViolations: number
  softTotal: number
  softDone: number
  /** General-habit tallies — tracked but excluded from `status`. */
  habitTotal: number
  habitDone: number
}

/**
 * Tally already-in-effect day rules into trading scores + colour. Trading rules
 * drive the status; habits are counted separately and never affect it. `hasTrades`
 * / `checkedIn` decide scope and the clean no-trade case, exactly like the server.
 * `isOpen` (today — use {@link dayIsOpen}) holds an unfinished day at `pending`; once the
 * day settles, scheduled-but-unmet soft rules read as a real miss.
 */
export function tallyDayRules(
  rules: TallyRule[],
  ctx: { hasTrades: boolean; checkedIn: boolean; isOpen?: boolean },
): DayTally {
  const trading = rules.filter((r) => r.category !== 'habit')
  const habits = rules.filter((r) => r.category === 'habit')
  const hardRules = trading.filter((r) => r.type === 'hard')
  const softRules = trading.filter((r) => r.type === 'soft')
  const hardViolations = hardRules.filter((r) => !r.completed).length
  const softDone = softRules.filter((r) => r.completed).length
  // Any rule row present for the day: a done task or a flagged constraint. Mirrors the
  // server's `hasLoggedRules` — it's what tells a day with no data apart from a day you
  // engaged with and fell short.
  const hasLoggedRules = trading.some((r) => (r.type === 'hard' ? !r.completed : r.completed))
  const inScope =
    dayInScope({ hasTrades: ctx.hasTrades, checkedIn: ctx.checkedIn, hasLoggedRules }) ||
    // Soft rules scheduled but nothing logged and no no-trade check-in: the day is in
    // scope so it can report as `unlogged` rather than sitting out as grey.
    (!ctx.checkedIn && softRules.length > 0)
  const raw = computeDayStatus({
    inScope,
    cleanNoTrade: isCleanNoTrade(ctx.checkedIn, ctx.hasTrades),
    confirmed: dayConfirmed({ checkedIn: ctx.checkedIn, hasLoggedRules }),
    hardTotal: hardRules.length,
    hardViolations,
    softTotal: softRules.length,
    softDone,
  })
  // An OPEN day's soft incompleteness stays pending (a broken hard rule is definitive →
  // red). Must be derived with dayIsOpen so the client and the server agree — if they
  // disagree about whether a day is settled, the cell flickers on every tick.
  const status = resolveTodayStatus(raw, ctx.isOpen ?? false, hardViolations > 0)
  return {
    status,
    hardTotal: hardRules.length,
    hardViolations,
    softTotal: softRules.length,
    softDone,
    habitTotal: habits.length,
    habitDone: habits.filter((r) => r.completed).length,
  }
}

// ─── Streaks ─────────────────────────────────────────────────────────────────
//
// A clean streak counts consecutive GREEN days, but only over days that had a rule
// scheduled — a day with nothing scheduled (a weekend outside the rule's activeDays,
// or a date before any rule existed) is NEUTRAL: it's skipped, so it neither extends
// nor breaks the run. Among scheduled days, anything other than green (yellow, red, or
// a no-record day) ends the streak.

/**
 * Current clean streak. `daysNewestFirst[0]` must be today, then yesterday, etc.
 * The newest day gets grace: an unlogged today ('none') doesn't reset the streak,
 * it's simply not counted yet.
 */
export function currentCleanStreak(
  daysNewestFirst: string[],
  statusOf: (day: string) => DayStatus,
  scheduledOn: (day: string) => boolean,
): number {
  let streak = 0
  for (let i = 0; i < daysNewestFirst.length; i++) {
    const day = daysNewestFirst[i]
    if (!scheduledOn(day)) continue // nothing scheduled → neutral, skip
    const status = statusOf(day)
    if (status === 'pending') continue // today still in progress → grace, don't count/break
    if (i === 0 && status === 'none') continue // today not logged yet → grace
    if (status !== 'green') break
    streak += 1
  }
  return streak
}

/** Longest run of consecutive GREEN scheduled days in `daysOldestFirst`. */
export function bestCleanStreak(
  daysOldestFirst: string[],
  statusOf: (day: string) => DayStatus,
  scheduledOn: (day: string) => boolean,
): number {
  let best = 0
  let run = 0
  for (const day of daysOldestFirst) {
    if (!scheduledOn(day)) continue // nothing scheduled → neutral, don't reset
    const status = statusOf(day)
    if (status === 'pending') continue // today still in progress → neutral, don't reset
    if (status === 'green') {
      run += 1
      if (run > best) best = run
    } else {
      run = 0
    }
  }
  return best
}

// ─── Habits ──────────────────────────────────────────────────────────────────
//
// Habits reuse the streak helpers above by mapping done/not-done onto DayStatus:
// done → green (extends), missed → red (breaks), except *today* which gets grace
// ('none') while still unlogged — the same grace the discipline streak grants.

/** Map a habit's done-state on a day onto a DayStatus for the streak helpers. */
export function habitDayStatus(done: boolean, day: string, today: string): DayStatus {
  if (done) return 'green'
  return day === today ? 'none' : 'red'
}

/**
 * DayStatus of a single rule/habit on one day, for STREAK counting — extends
 * habitDayStatus with the "done vs kept" distinction on TODAY:
 *
 *   • Building / soft (isHard=false): an ACTIVE completion settles the day green even
 *     today (you did the thing → it counts); not done yet today is graced ('none'),
 *     never a miss while the day is still open.
 *   • Avoidance / hard (isHard=true): staying clean is only PROVISIONAL until the day
 *     ends — an unbroken today is 'pending' (graced, does NOT extend the streak yet),
 *     so a rule kept for the first time only yesterday reads as a 1-day streak, not 2.
 *     A slip / violation already logged today is definitive and breaks the run ('red').
 *
 * Past days are identical for both tiers: good → green, otherwise red.
 */
export function ruleStreakDayStatus(opts: {
  isHard: boolean
  good: boolean
  isToday: boolean
  /**
   * Does the DAY carry a verdict — was anything at all recorded on it?
   *
   * This is what keeps a per-rule flame honest, and it matters most for a CONSTRAINT: on a
   * day the user never opened, no slip was logged, so `good` is true and the rule would
   * otherwise bank a green for a day nobody was watching. A flame that grows while you're
   * not using the app measures attendance, not compliance — and it would disagree with the
   * clean streak beside it, which an unlogged day breaks.
   *
   * So an unlogged day breaks a per-rule streak exactly the way it breaks the day-level
   * one. Defaults to true, which is the old behaviour, for callers that genuinely have no
   * notion of a day's confirmation.
   */
  dayLogged?: boolean
}): DayStatus {
  const { isHard, good, isToday, dayLogged = true } = opts
  if (isToday) {
    if (isHard) return good ? 'pending' : 'red'
    return good ? 'green' : 'none'
  }
  // A settled day with nothing recorded: no evidence either way, so it can't extend a run.
  if (!dayLogged) return 'unlogged'
  return good ? 'green' : 'red'
}

// ─── Avoidance ("No X") habits — never miss twice ─────────────────────────────
//
// A bright-line avoidance habit ("no alcohol", "no phone in bed") is broken by
// LOGGING a slip on a scheduled day. Following Atomic Habits' "never miss twice":
// an isolated slip is a WARNING (yellow) — a single lapse isn't a failure — but a
// slip on two consecutive scheduled days is BROKEN (red), the start of a pattern.
// Staying clean is GREEN. Pure so the escalation is unit-tested in isolation.

export type AvoidanceState = 'clean' | 'warning' | 'broken'

/**
 * Classify an avoidance habit on a scheduled day. `slipped` = a slip was logged
 * that day; `prevScheduledSlip` = its previous SCHEDULED day was also a slip.
 */
export function avoidanceState(slipped: boolean, prevScheduledSlip: boolean): AvoidanceState {
  if (!slipped) return 'clean'
  return prevScheduledSlip ? 'broken' : 'warning'
}

// `pending` sits between green and yellow: it should show over a green tier (you're not
// done yet) but a definitive yellow/red slip still wins. `unlogged` sits just above it —
// a missing day outranks "not finished", but a real verdict (which by definition means
// the day HAS data) outranks a missing one.
const STATUS_RANK: Record<DayStatus, number> = { none: 0, green: 1, pending: 2, unlogged: 3, yellow: 4, red: 5 }

/** The more severe of two day statuses (red > yellow > unlogged > pending > green > none). */
export function worseStatus(a: DayStatus, b: DayStatus): DayStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b
}

/**
 * Aggregate one day's habit colour from both tiers: building habits (TASKS, scored by
 * completion ratio exactly like the trading soft tier) and avoidance habits
 * (CONSTRAINTS, never-miss-twice). The day takes the worse of the two.
 *
 * `ratio` is the day's QUALITY SCORE — what feeds the heatmap's green intensity and the
 * rolling averages — and is defined to mirror the trading day's `disciplineOf`:
 *   • a definitive breach (red) zeroes the day, however many tasks you finished;
 *   • otherwise it's the share of TASKS done (constraints are not tasks — see the model
 *     note at the top of this module, so they never pad the numerator);
 *   • a day with no task scheduled but its constraints intact is a full day (1), the
 *     same way a trading day with no soft habit scheduled scores 1.
 * It is NOT the user-facing "x/y" counter — that is the task tally alone.
 *
 * While the day is still running (`isToday`) two graces apply, for different reasons:
 *   • unfinished TASKS read `pending` rather than failing — there is still time;
 *   • an avoidance habit that merely hasn't been broken YET is provisional, so a day with
 *     no task to finish stays `pending` instead of banking a green it could still lose
 *     before midnight.
 * Once tasks are in play, finishing them earns the green today — the same positive
 * feedback the trading day gives. A definitive slip always colours through.
 */
export function aggregateHabitDayStatus(
  buildingScheduled: number,
  buildingDone: number,
  avoidanceStates: AvoidanceState[],
  isToday = false,
): { status: DayStatus; ratio: number } {
  let building: DayStatus =
    buildingScheduled > 0
      ? computeDayStatus({
          inScope: true,
          cleanNoTrade: false,
          // A habits day has no separate review flag, so "has data" means any row logged
          // that day: a building habit ticked, OR an avoidance slip recorded. Both prove
          // you engaged with the day, and without the second half a day where you honestly
          // logged a slip but did none of your building habits would read as "never filled
          // in". Zero rows on a scheduled day is genuinely a day you never filled in, not
          // a day you scored 0% — see the DayStatus note. (The accepted limitation: a day
          // you truly kept none of your habits is indistinguishable from one you never
          // opened. Both are unlogged, both break the streak, neither averages as a zero.)
          confirmed: buildingDone > 0 || avoidanceStates.some((s) => s !== 'clean'),
          hardTotal: 0,
          hardViolations: 0,
          softTotal: buildingScheduled,
          softDone: buildingDone,
        })
      : 'none'
  // Building habits can still be finished while the day is running.
  building = resolveTodayStatus(building, isToday, false)
  let avoid: DayStatus = 'none'
  for (const s of avoidanceStates) {
    avoid = worseStatus(avoid, s === 'broken' ? 'red' : s === 'warning' ? 'yellow' : 'green')
  }
  // Staying clean is only provisional while the day runs — see the doc comment. Held
  // here rather than in the callers so the day panel, the heatmap and the streak can't
  // disagree about what an avoidance-only today is worth.
  if (isToday && buildingScheduled === 0 && avoid === 'green') avoid = 'pending'
  const status = worseStatus(building, avoid)
  const ratio =
    // An unlogged day has no ratio at all — callers must exclude it from averages rather
    // than fold in a 0. Reported as 0 only because the type is a number.
    status === 'red' || status === 'unlogged'
      ? 0
      : buildingScheduled > 0
        ? buildingDone / buildingScheduled
        : status === 'none'
          ? 0
          : 1
  return { status, ratio }
}

// ─── Habit → trading performance ─────────────────────────────────────────────
//
// "Does this habit pay off?" Split the trading days on which a habit was scheduled
// into two buckets — done vs. missed — and aggregate the payoff of each. Pure so
// the split/averaging is unit-tested independently of the DB query that feeds it.

/**
 * Minimum trading days in EACH bucket before a habit's correlation is shown. Same
 * reasoning as {@link DAY_PERF_MIN_SAMPLE} — and the same threshold, so the two
 * "does X pay off?" widgets hold themselves to one standard of proof.
 */
export const HABIT_PERF_MIN_SAMPLE = 15

/** Below this, a habit's shown split is flagged as an early, indicative read. */
export const HABIT_PERF_SOLID_SAMPLE = 30

export interface HabitPerfSplit {
  doneDays: number
  missedDays: number
  doneAvgPnl: number
  missedAvgPnl: number
  doneWinRate: number
  missedWinRate: number
  /** doneAvgPnl − missedAvgPnl. */
  pnlDelta: number
  /** Both buckets have at least `minSample` days. */
  enoughData: boolean
}

/**
 * Bucket a habit's scheduled trading days by whether the habit was done, and
 * aggregate net P&L and win rate per bucket.
 *
 * @param scheduledDayPnl trading day (habit in effect) → net P&L that day
 * @param doneOn          whether the habit was done that day
 * @param minSample       min days each bucket needs before `enoughData` is true
 */
export function bucketHabitPerformance(
  scheduledDayPnl: Map<string, number>,
  doneOn: (day: string) => boolean,
  minSample: number,
): HabitPerfSplit {
  const acc = { done: { n: 0, sum: 0, win: 0 }, miss: { n: 0, sum: 0, win: 0 } }
  for (const [day, pnl] of scheduledDayPnl) {
    const b = doneOn(day) ? acc.done : acc.miss
    b.n += 1
    b.sum += pnl
    if (pnl > 0) b.win += 1
  }
  const doneAvgPnl = acc.done.n ? acc.done.sum / acc.done.n : 0
  const missedAvgPnl = acc.miss.n ? acc.miss.sum / acc.miss.n : 0
  return {
    doneDays: acc.done.n,
    missedDays: acc.miss.n,
    doneAvgPnl,
    missedAvgPnl,
    doneWinRate: acc.done.n ? acc.done.win / acc.done.n : 0,
    missedWinRate: acc.miss.n ? acc.miss.win / acc.miss.n : 0,
    pnlDelta: doneAvgPnl - missedAvgPnl,
    enoughData: acc.done.n >= minSample && acc.miss.n >= minSample,
  }
}

// ─── Discipline → performance ────────────────────────────────────────────────
//
// "Does discipline pay off?" — bucket each TRADING day by its discipline colour and
// aggregate the payoff. The whole widget is scoped to days that were actually being
// measured: a day whose status is 'none' (no rule was in effect — before any rule
// existed, or a weekday outside every rule's schedule) carries no discipline signal
// and is dropped, so the numbers only ever reflect on-plan-vs-off-plan days.

/**
 * Minimum trading days a discipline bucket needs before its average P&L / R reads as
 * a signal rather than noise. Below this the widget still shows the day count but
 * withholds the headline number, so a single dramatic day can't masquerade as a trend.
 *
 * Daily P&L is a fat-tailed, very high-variance series: with a handful of days one
 * outlier IS the average. A dozen-plus days per bucket is still not a significant
 * result, but it is the point where the number stops being a coin flip dressed up as
 * evidence — and this product's whole claim is data over feelings, so it has to hold
 * itself to that.
 */
export const DAY_PERF_MIN_SAMPLE = 15

/**
 * Above {@link DAY_PERF_MIN_SAMPLE} but below this, a bucket's number is shown as
 * INDICATIVE — visibly flagged as an early read rather than presented as settled fact.
 */
export const DAY_PERF_SOLID_SAMPLE = 30

export interface DayPerfBucket {
  /** Confirmed trading days (with a rule in effect) that landed in this bucket. */
  days: number
  /** Average net P&L across those days. */
  avgPnl: number
  /** Share of those days that were net-positive, 0..1. */
  winRate: number
  /**
   * Average daily R-multiple, averaged only over the bucket's days that had a risked
   * trade (present in `dayR`). null when the bucket has no such day — the UI then
   * shows nothing instead of a misleading 0R.
   */
  avgR: number | null
}

/**
 * Bucket trading days by discipline status and aggregate P&L, win-rate and R.
 *
 * A day only qualifies as evidence when BOTH hold:
 *   • it carries a discipline verdict — a rule was in effect and the day is settled, so
 *     'none' and 'pending' are dropped; and
 *   • the user CONFIRMED it (see {@link dayConfirmed}). A day that exists only because
 *     trades were imported into it says nothing about whether the rules were followed —
 *     counting it would let default-satisfied constraints vote on their own payoff.
 *
 * @param dayPnl      trading day → net P&L that day (defines which days count at all)
 * @param dayR        trading day → summed R-multiple (only days with a risked trade)
 * @param statusOf    day → discipline status
 * @param confirmedOn day → was the day confirmed? Unconfirmed days are excluded and
 *                    reported back in `unconfirmedDays` so the UI can say so out loud
 *                    rather than silently showing a thinner sample.
 */
export function bucketDayPerformance(
  dayPnl: Map<string, number>,
  dayR: Map<string, number>,
  statusOf: (day: string) => DayStatus,
  confirmedOn: (day: string) => boolean = () => true,
): { green: DayPerfBucket; yellow: DayPerfBucket; red: DayPerfBucket; unconfirmedDays: number } {
  const acc = {
    green: { days: 0, sum: 0, win: 0, rSum: 0, rDays: 0 },
    yellow: { days: 0, sum: 0, win: 0, rSum: 0, rDays: 0 },
    red: { days: 0, sum: 0, win: 0, rSum: 0, rDays: 0 },
  }
  let unconfirmedDays = 0
  for (const [day, pnl] of dayPnl) {
    const status = statusOf(day)
    // No discipline signal: no rule in effect ('none'), the day is still open
    // ('pending'), or it carries no data at all ('unlogged'). Only settled
    // green/yellow/red days — days with a real verdict — feed the payoff buckets.
    if (status === 'none' || status === 'pending' || status === 'unlogged') continue
    // Scored, but never reviewed — countable as a colour, not as evidence.
    if (!confirmedOn(day)) {
      unconfirmedDays += 1
      continue
    }
    const b = acc[status]
    b.days += 1
    b.sum += pnl
    if (pnl > 0) b.win += 1
    if (dayR.has(day)) {
      b.rSum += dayR.get(day)!
      b.rDays += 1
    }
  }
  const toBucket = (b: (typeof acc)['green']): DayPerfBucket => ({
    days: b.days,
    avgPnl: b.days ? b.sum / b.days : 0,
    winRate: b.days ? b.win / b.days : 0,
    avgR: b.rDays ? b.rSum / b.rDays : null,
  })
  return {
    green: toBucket(acc.green),
    yellow: toBucket(acc.yellow),
    red: toBucket(acc.red),
    unconfirmedDays,
  }
}
