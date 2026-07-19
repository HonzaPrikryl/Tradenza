// Effective-dated discipline rules. A rule applies to a given day based on its own
// lifecycle, not on the *current* set of rules — so adding a rule never changes
// past days, and deleting (archiving) one keeps the days it was already in effect
// intact. Pure (no 'use server') for reuse + unit testing.
//
// All days are "yyyy-MM-dd" strings, which compare correctly lexicographically.

/**
 * A rule tier. 'hard' rules are non-negotiable — one violation makes the day red.
 * 'soft' rules are quality habits scored proportionally.
 */
export type RuleType = 'hard' | 'soft'

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
   * ISO weekdays (1=Mon … 7=Sun) on which the rule applies. A rule is never
   * expected on days outside this set — they don't count toward or against it.
   * Schedule changes apply retroactively (history is recomputed).
   */
  activeDays: number[]
}

/** Every day of the week — the default schedule. */
export const ALL_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7]

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
 * - Not before it was created.
 * - Not on/after it was archived (deleted).
 * - On `today` and beyond, a paused rule (active === false) is not expected — pausing
 *   is forward-looking and does not rewrite the past.
 * - Not on weekdays outside its schedule (`activeDays`), past or future.
 */
export function ruleInEffectOn(day: string, today: string, r: RuleLifecycle): boolean {
  if (r.createdDay > day) return false
  if (r.archivedDay !== null && day >= r.archivedDay) return false
  if (day >= today && !r.active) return false
  if (!r.activeDays.includes(isoWeekdayOf(day))) return false
  return true
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
// Days with no trades and no explicit check-in (and no ticked rule) are OUT OF SCOPE
// — grey, never red. Not logging a day must never look the same as breaking a rule.

/** Status of a single day's discipline. `none` = out of scope (grey). */
export type DayStatus = 'none' | 'green' | 'yellow' | 'red'

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
  /** Hard rules in effect that day — with softTotal, tells us if ANY rule applied. */
  hardTotal: number
  hardViolations: number
  softTotal: number
  softDone: number
}): DayStatus {
  const { inScope, cleanNoTrade, hardTotal, hardViolations, softTotal, softDone } = input
  if (!inScope) return 'none'
  // No rule was in effect this day (none created yet, or none scheduled). There's
  // nothing to measure, so it stays grey/out-of-scope for discipline — a day you only
  // traded on, before you had any rules, must not read as "on plan".
  if (hardTotal === 0 && softTotal === 0) return 'none'
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
  const status = computeDayStatus({ inScope, cleanNoTrade, hardTotal, hardViolations, softTotal, softDone })
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
    if (statusOf(day) === 'green') {
      run += 1
      if (run > best) best = run
    } else {
      run = 0
    }
  }
  return best
}

// ─── Discipline → performance ────────────────────────────────────────────────
//
// "Does discipline pay off?" — bucket each TRADING day by its discipline colour and
// aggregate the payoff. The whole widget is scoped to days that were actually being
// measured: a day whose status is 'none' (no rule was in effect — before any rule
// existed, or a weekday outside every rule's schedule) carries no discipline signal
// and is dropped, so the numbers only ever reflect on-plan-vs-off-plan days.

export interface DayPerfBucket {
  /** Trading days (with a rule in effect) that landed in this bucket. */
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
 * @param dayPnl    trading day → net P&L that day (defines which days count at all)
 * @param dayR      trading day → summed R-multiple (only days with a risked trade)
 * @param statusOf  day → discipline status; 'none' days are excluded from every bucket
 */
export function bucketDayPerformance(
  dayPnl: Map<string, number>,
  dayR: Map<string, number>,
  statusOf: (day: string) => DayStatus,
): { green: DayPerfBucket; yellow: DayPerfBucket; red: DayPerfBucket } {
  const acc = {
    green: { days: 0, sum: 0, win: 0, rSum: 0, rDays: 0 },
    yellow: { days: 0, sum: 0, win: 0, rSum: 0, rDays: 0 },
    red: { days: 0, sum: 0, win: 0, rSum: 0, rDays: 0 },
  }
  for (const [day, pnl] of dayPnl) {
    const status = statusOf(day)
    if (status === 'none') continue // no rule in effect → no discipline signal
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
  return { green: toBucket(acc.green), yellow: toBucket(acc.yellow), red: toBucket(acc.red) }
}
