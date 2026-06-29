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
}

/**
 * Is the rule in effect on `day`?
 *
 * - Not before it was created.
 * - Not on/after it was archived (deleted).
 * - On `today` and beyond, a paused rule (active === false) is not expected — pausing
 *   is forward-looking and does not rewrite the past.
 */
export function ruleInEffectOn(day: string, today: string, r: RuleLifecycle): boolean {
  if (r.createdDay > day) return false
  if (r.archivedDay !== null && day >= r.archivedDay) return false
  if (day >= today && !r.active) return false
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
