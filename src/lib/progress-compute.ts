// Effective-dated discipline rules. A rule applies to a given day based on its own
// lifecycle, not on the *current* set of rules — so adding a rule never changes
// past days, and deleting (archiving) one keeps the days it was already in effect
// intact. Pure (no 'use server') for reuse + unit testing.
//
// All days are "yyyy-MM-dd" strings, which compare correctly lexicographically.

export interface RuleLifecycle {
  id: string
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
