import { describe, it, expect } from 'vitest'
import { ruleInEffectOn, expectedRulesOn, ruleIdsInEffectOn, type RuleLifecycle } from './progress-compute'

const TODAY = '2026-06-28'
const rule = (id: string, createdDay: string, archivedDay: string | null = null, active = true): RuleLifecycle => ({
  id,
  createdDay,
  archivedDay,
  active,
})

describe('ruleInEffectOn', () => {
  it('is not in effect before it was created', () => {
    expect(ruleInEffectOn('2026-01-01', TODAY, rule('a', '2026-02-01'))).toBe(false)
    expect(ruleInEffectOn('2026-02-01', TODAY, rule('a', '2026-02-01'))).toBe(true)
  })
  it('stops applying on/after its archive day', () => {
    const r = rule('a', '2026-01-01', '2026-03-10')
    expect(ruleInEffectOn('2026-03-09', TODAY, r)).toBe(true)
    expect(ruleInEffectOn('2026-03-10', TODAY, r)).toBe(false)
  })
  it('ignores the paused flag for past days but not for today', () => {
    const paused = rule('a', '2026-01-01', null, false)
    expect(ruleInEffectOn('2026-03-01', TODAY, paused)).toBe(true) // past: counted
    expect(ruleInEffectOn(TODAY, TODAY, paused)).toBe(false) // today: paused → excluded
  })
})

describe('expectedRulesOn — historical accuracy', () => {
  const a = rule('a', '2026-01-01')
  const b = rule('b', '2026-01-01')

  it('a newly added rule does not change past days', () => {
    const c = rule('c', TODAY) // added today
    const rules = [a, b, c]
    expect(expectedRulesOn('2026-03-15', TODAY, rules)).toBe(2) // past day still 2 rules
    expect(expectedRulesOn(TODAY, TODAY, rules)).toBe(3) // today has all 3
  })

  it('deleting (archiving) a rule keeps the days it was already in effect', () => {
    const bDeleted = rule('b', '2026-01-01', TODAY) // deleted today
    const rules = [a, bDeleted]
    expect(expectedRulesOn('2026-03-15', TODAY, rules)).toBe(2) // past unchanged
    expect(expectedRulesOn(TODAY, TODAY, rules)).toBe(1) // today drops the deleted rule
  })

  it('a perfect 2/2 past day stays 2/2 after adding a third rule', () => {
    const c = rule('c', TODAY)
    const past = '2026-03-15'
    const followedThatDay = ruleIdsInEffectOn(past, TODAY, [a, b, c]) // {a, b}
    expect(followedThatDay).toEqual(new Set(['a', 'b']))
    expect(expectedRulesOn(past, TODAY, [a, b, c])).toBe(2)
  })
})
