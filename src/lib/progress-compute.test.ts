import { describe, it, expect } from 'vitest'
import {
  ruleInEffectOn,
  expectedRulesOn,
  ruleIdsInEffectOn,
  isoWeekdayOf,
  ALL_WEEKDAYS,
  type RuleLifecycle,
} from './progress-compute'

const TODAY = '2026-06-28'
const rule = (
  id: string,
  createdDay: string,
  archivedDay: string | null = null,
  active = true,
  activeDays: number[] = [...ALL_WEEKDAYS],
): RuleLifecycle => ({
  id,
  createdDay,
  archivedDay,
  active,
  activeDays,
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

describe('isoWeekdayOf', () => {
  it('maps to ISO weekdays (1=Mon … 7=Sun)', () => {
    expect(isoWeekdayOf('2026-06-22')).toBe(1) // Monday
    expect(isoWeekdayOf('2026-06-26')).toBe(5) // Friday
    expect(isoWeekdayOf('2026-06-27')).toBe(6) // Saturday
    expect(isoWeekdayOf('2026-06-28')).toBe(7) // Sunday
  })
  it('is stable across DST boundaries', () => {
    expect(isoWeekdayOf('2026-03-29')).toBe(7) // EU DST start — Sunday
    expect(isoWeekdayOf('2026-10-25')).toBe(7) // EU DST end — Sunday
  })
})

describe('rule schedules (activeDays)', () => {
  const WEEKDAYS = [1, 2, 3, 4, 5]
  // TODAY (2026-06-28) is a Sunday.
  const monFri = rule('a', '2026-01-01', null, true, WEEKDAYS)

  it('a Mon–Fri rule is not in effect on weekends', () => {
    expect(ruleInEffectOn('2026-06-26', TODAY, monFri)).toBe(true) // Fri
    expect(ruleInEffectOn('2026-06-27', TODAY, monFri)).toBe(false) // Sat
    expect(ruleInEffectOn(TODAY, TODAY, monFri)).toBe(false) // Sun (today)
    expect(ruleInEffectOn('2026-06-29', TODAY, monFri)).toBe(true) // next Mon
  })

  it('applies retroactively — past weekends are out of scope too', () => {
    expect(ruleInEffectOn('2026-03-14', TODAY, monFri)).toBe(false) // past Saturday
    expect(ruleInEffectOn('2026-03-16', TODAY, monFri)).toBe(true) // past Monday
  })

  it('drops the denominator to zero on days where nothing is scheduled', () => {
    const rules = [monFri, rule('b', '2026-01-01', null, true, WEEKDAYS)]
    expect(expectedRulesOn('2026-06-27', TODAY, rules)).toBe(0) // Saturday
    expect(expectedRulesOn('2026-06-26', TODAY, rules)).toBe(2) // Friday
    expect(ruleIdsInEffectOn('2026-06-27', TODAY, rules)).toEqual(new Set())
  })

  it('combines with lifecycle: created mid-week, weekend-only rule', () => {
    const weekendOnly = rule('w', '2026-06-24', null, true, [6, 7]) // created Wed
    expect(ruleInEffectOn('2026-06-21', TODAY, weekendOnly)).toBe(false) // Sun before creation
    expect(ruleInEffectOn('2026-06-25', TODAY, weekendOnly)).toBe(false) // Thu — off schedule
    expect(ruleInEffectOn('2026-06-27', TODAY, weekendOnly)).toBe(true) // Sat
  })

  it('schedule does not override pause or archive', () => {
    const pausedMonFri = rule('p', '2026-01-01', null, false, WEEKDAYS)
    expect(ruleInEffectOn(TODAY, TODAY, pausedMonFri)).toBe(false) // paused today
    expect(ruleInEffectOn('2026-06-26', TODAY, pausedMonFri)).toBe(true) // past Fri still counts
    const archived = rule('x', '2026-01-01', '2026-06-01', true, WEEKDAYS)
    expect(ruleInEffectOn('2026-06-05', TODAY, archived)).toBe(false) // Fri after archive
  })
})
