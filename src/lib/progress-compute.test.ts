import { describe, it, expect } from 'vitest'
import {
  ruleInEffectOn,
  expectedRulesOn,
  ruleIdsInEffectOn,
  isoWeekdayOf,
  computeDayStatus,
  computeDayScore,
  currentCleanStreak,
  bestCleanStreak,
  bucketDayPerformance,
  dayInScope,
  isCleanNoTrade,
  ALL_WEEKDAYS,
  type RuleLifecycle,
  type RuleType,
  type DayStatus,
} from './progress-compute'

const TODAY = '2026-06-28'
const rule = (
  id: string,
  createdDay: string,
  archivedDay: string | null = null,
  active = true,
  activeDays: number[] = [...ALL_WEEKDAYS],
  type: RuleType = 'soft',
): RuleLifecycle => ({
  id,
  type,
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

describe('computeDayStatus — ratio thresholds (not a check-in day)', () => {
  it('is grey (none) when out of scope, even with a violation logged', () => {
    expect(
      computeDayStatus({
        inScope: false,
        cleanNoTrade: false,
        hardTotal: 2,
        hardViolations: 1,
        softTotal: 8,
        softDone: 0,
      }),
    ).toBe('none')
  })
  it('is grey (none) when no rule was in effect, even if you traded', () => {
    // Traded (in scope) but no hard or soft rule applied → nothing to score.
    expect(
      computeDayStatus({
        inScope: true,
        cleanNoTrade: false,
        hardTotal: 0,
        hardViolations: 0,
        softTotal: 0,
        softDone: 0,
      }),
    ).toBe('none')
  })
  it('a single hard violation forces red regardless of soft habits', () => {
    expect(
      computeDayStatus({
        inScope: true,
        cleanNoTrade: false,
        hardTotal: 1,
        hardViolations: 1,
        softTotal: 8,
        softDone: 8,
      }),
    ).toBe('red')
  })
  it('green at ≥50% done, yellow at 30–50%, red below 30%', () => {
    const t = (softDone: number) =>
      computeDayStatus({ inScope: true, cleanNoTrade: false, hardTotal: 0, hardViolations: 0, softTotal: 8, softDone })
    expect(t(8)).toBe('green') // 100%
    expect(t(4)).toBe('green') // 50%
    expect(t(3)).toBe('yellow') // 37.5%
    expect(t(2)).toBe('red') // 25%
  })
  it('small denominators: missing both of 2 habits is red, not yellow', () => {
    expect(
      computeDayStatus({
        inScope: true,
        cleanNoTrade: false,
        hardTotal: 0,
        hardViolations: 0,
        softTotal: 2,
        softDone: 0,
      }),
    ).toBe('red') // 0%
    expect(
      computeDayStatus({
        inScope: true,
        cleanNoTrade: false,
        hardTotal: 0,
        hardViolations: 0,
        softTotal: 2,
        softDone: 1,
      }),
    ).toBe('green') // 50%
  })
  it('a no-trade day NOT checked in is still scored by its soft ratio', () => {
    // Ticked 2 of 10 habits but did not check in → the low ratio still shows red.
    expect(
      computeDayStatus({
        inScope: true,
        cleanNoTrade: false,
        hardTotal: 0,
        hardViolations: 0,
        softTotal: 10,
        softDone: 2,
      }),
    ).toBe('red')
  })
  it('a clean in-scope day with hard rules but no soft habits is green', () => {
    expect(
      computeDayStatus({
        inScope: true,
        cleanNoTrade: false,
        hardTotal: 2,
        hardViolations: 0,
        softTotal: 0,
        softDone: 0,
      }),
    ).toBe('green')
  })
})

describe('computeDayStatus — no-trade CHECK-IN day', () => {
  it('is green even with soft habits unfilled (habits do not apply when you sat out)', () => {
    expect(
      computeDayStatus({
        inScope: true,
        cleanNoTrade: true,
        hardTotal: 0,
        hardViolations: 0,
        softTotal: 10,
        softDone: 0,
      }),
    ).toBe('green')
  })
  it('stays green regardless of how many soft habits were ticked', () => {
    expect(
      computeDayStatus({
        inScope: true,
        cleanNoTrade: true,
        hardTotal: 0,
        hardViolations: 0,
        softTotal: 10,
        softDone: 4,
      }),
    ).toBe('green')
  })
  it('a broken hard rule still forces red on a check-in day', () => {
    expect(
      computeDayStatus({
        inScope: true,
        cleanNoTrade: true,
        hardTotal: 1,
        hardViolations: 1,
        softTotal: 10,
        softDone: 10,
      }),
    ).toBe('red')
  })
})

describe('computeDayScore — tallies from logged ids', () => {
  const hardA = rule('h1', '2026-01-01', null, true, [...ALL_WEEKDAYS], 'hard')
  const hardB = rule('h2', '2026-01-01', null, true, [...ALL_WEEKDAYS], 'hard')
  const soft1 = rule('s1', '2026-01-01', null, true, [...ALL_WEEKDAYS], 'soft')
  const soft2 = rule('s2', '2026-01-01', null, true, [...ALL_WEEKDAYS], 'soft')
  const rules = [hardA, hardB, soft1, soft2]
  const DAY = '2026-06-20' // Saturday, in effect for all-day rules

  it('counts hard rows as violations and soft rows as done', () => {
    // s1 done, h2 violated (ordinary day, not a check-in)
    const score = computeDayScore(DAY, TODAY, rules, new Set(['s1', 'h2']), true, false)
    expect(score.hardTotal).toBe(2)
    expect(score.hardViolations).toBe(1)
    expect(score.softTotal).toBe(2)
    expect(score.softDone).toBe(1)
    expect(score.status).toBe('red') // one hard violation
  })

  it('respected hard rules (no rows) + all soft done → green', () => {
    const score = computeDayScore(DAY, TODAY, rules, new Set(['s1', 's2']), true, false)
    expect(score.hardViolations).toBe(0)
    expect(score.softDone).toBe(2)
    expect(score.status).toBe('green')
  })

  it('out-of-scope day is none with zeroed status', () => {
    const score = computeDayScore(DAY, TODAY, rules, new Set(), false, false)
    expect(score.inScope).toBe(false)
    expect(score.status).toBe('none')
  })

  it('no-trade CHECK-IN day: unfilled soft habits stay green, but a hard break is red', () => {
    // cleanNoTrade = true, no soft ticked → green (habits do not apply).
    const clean = computeDayScore(DAY, TODAY, rules, new Set(), true, true)
    expect(clean.softDone).toBe(0)
    expect(clean.cleanNoTrade).toBe(true)
    expect(clean.status).toBe('green')
    // Same check-in day but a hard rule was violated → red.
    const broke = computeDayScore(DAY, TODAY, rules, new Set(['h1']), true, true)
    expect(broke.status).toBe('red')
  })

  it('no-trade day NOT checked in is scored by soft ratio, not auto-green', () => {
    // In scope via a ticked habit, but not a check-in → 1/2 soft = green, 0/2 = red.
    const partial = computeDayScore(DAY, TODAY, rules, new Set(['s1']), true, false)
    expect(partial.status).toBe('green') // 50%
    const empty = computeDayScore(DAY, TODAY, rules, new Set(), true, false)
    expect(empty.status).toBe('red') // 0/2
  })

  it('a traded day with no rule in effect yet is grey (none), not green', () => {
    // All rules were created AFTER this day, so none applied — nothing to score.
    const future = [
      rule('h1', '2026-07-01', null, true, [...ALL_WEEKDAYS], 'hard'),
      rule('s1', '2026-07-01', null, true, [...ALL_WEEKDAYS], 'soft'),
    ]
    const score = computeDayScore(DAY, TODAY, future, new Set(), true, false)
    expect(score.hardTotal).toBe(0)
    expect(score.softTotal).toBe(0)
    expect(score.status).toBe('none')
  })
})

// Build statusOf/scheduledOn lookups from plain maps; unknown days default to
// 'none' status and scheduled=true.
function lookups(statuses: Record<string, DayStatus>, scheduled: Record<string, boolean> = {}) {
  return {
    statusOf: (d: string): DayStatus => statuses[d] ?? 'none',
    scheduledOn: (d: string): boolean => scheduled[d] ?? true,
  }
}

describe('currentCleanStreak', () => {
  it('counts consecutive green scheduled days back from today', () => {
    const days = ['2026-06-05', '2026-06-04', '2026-06-03']
    const { statusOf, scheduledOn } = lookups({
      '2026-06-05': 'green',
      '2026-06-04': 'green',
      '2026-06-03': 'yellow',
    })
    expect(currentCleanStreak(days, statusOf, scheduledOn)).toBe(2)
  })

  it('skips unscheduled days (a day off) without breaking the run', () => {
    // Green Fri, weekend (unscheduled), green Thu → still a run of 2.
    const days = ['2026-06-05', '2026-06-04', '2026-06-03', '2026-06-02']
    const { statusOf, scheduledOn } = lookups(
      { '2026-06-05': 'green', '2026-06-02': 'green' },
      { '2026-06-04': false, '2026-06-03': false },
    )
    expect(currentCleanStreak(days, statusOf, scheduledOn)).toBe(2)
  })

  it('grants today grace: an unlogged today (none) does not reset the streak', () => {
    const days = ['2026-06-05', '2026-06-04']
    const { statusOf, scheduledOn } = lookups({ '2026-06-05': 'none', '2026-06-04': 'green' })
    expect(currentCleanStreak(days, statusOf, scheduledOn)).toBe(1)
  })

  it('a missed (none) scheduled day that is NOT today breaks the streak', () => {
    const days = ['2026-06-05', '2026-06-04', '2026-06-03']
    const { statusOf, scheduledOn } = lookups({
      '2026-06-05': 'green',
      '2026-06-04': 'none',
      '2026-06-03': 'green',
    })
    expect(currentCleanStreak(days, statusOf, scheduledOn)).toBe(1)
  })

  it('a red or yellow day breaks it immediately', () => {
    const { statusOf, scheduledOn } = lookups({ '2026-06-05': 'red', '2026-06-04': 'green' })
    expect(currentCleanStreak(['2026-06-05', '2026-06-04'], statusOf, scheduledOn)).toBe(0)
  })
})

describe('bestCleanStreak', () => {
  it('finds the longest run of consecutive green scheduled days', () => {
    const days = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6']
    const { statusOf, scheduledOn } = lookups({
      d1: 'green',
      d2: 'green',
      d3: 'red',
      d4: 'green',
      d5: 'green',
      d6: 'green',
    })
    expect(bestCleanStreak(days, statusOf, scheduledOn)).toBe(3)
  })

  it('treats unscheduled days as neutral — they bridge a run, not reset it', () => {
    const days = ['d1', 'd2', 'd3', 'd4']
    const { statusOf, scheduledOn } = lookups({ d1: 'green', d4: 'green' }, { d2: false, d3: false })
    expect(bestCleanStreak(days, statusOf, scheduledOn)).toBe(2)
  })

  it('is 0 when there are no green days', () => {
    const { statusOf, scheduledOn } = lookups({ d1: 'red', d2: 'yellow' })
    expect(bestCleanStreak(['d1', 'd2'], statusOf, scheduledOn)).toBe(0)
  })
})

describe('dayInScope', () => {
  it('is out of scope when nothing happened', () => {
    expect(dayInScope({ hasTrades: false, checkedIn: false, hasLoggedRules: false })).toBe(false)
  })

  it('is in scope on any single signal', () => {
    expect(dayInScope({ hasTrades: true, checkedIn: false, hasLoggedRules: false })).toBe(true)
    expect(dayInScope({ hasTrades: false, checkedIn: true, hasLoggedRules: false })).toBe(true)
    expect(dayInScope({ hasTrades: false, checkedIn: false, hasLoggedRules: true })).toBe(true)
  })
})

describe('isCleanNoTrade', () => {
  it('is a clean sit-out only when checked in AND no trades', () => {
    expect(isCleanNoTrade(true, false)).toBe(true)
    expect(isCleanNoTrade(true, true)).toBe(false) // a trade negates the sit-out
    expect(isCleanNoTrade(false, false)).toBe(false) // not reviewed → out of scope, not clean
  })
})

describe('bucketDayPerformance', () => {
  const statusMap = (m: Record<string, DayStatus>) => (day: string) => m[day] ?? 'none'

  it('buckets days by status and averages P&L + win-rate', () => {
    const pnl = new Map([
      ['d1', 100],
      ['d2', -40],
      ['d3', 60],
    ])
    const statusOf = statusMap({ d1: 'green', d2: 'green', d3: 'red' })
    const { green, red } = bucketDayPerformance(pnl, new Map(), statusOf)
    expect(green.days).toBe(2)
    expect(green.avgPnl).toBe(30) // (100 + -40) / 2
    expect(green.winRate).toBe(0.5) // 1 of 2 days net-positive
    expect(red.days).toBe(1)
    expect(red.avgPnl).toBe(60)
    expect(red.winRate).toBe(1)
  })

  it("excludes 'none' days entirely — no rule in effect carries no signal", () => {
    const pnl = new Map([
      ['d1', 100],
      ['d2', 999], // no rule that day → must not count anywhere
    ])
    const statusOf = statusMap({ d1: 'green' }) // d2 → 'none'
    const { green, yellow, red } = bucketDayPerformance(pnl, new Map(), statusOf)
    expect(green.days).toBe(1)
    expect(green.avgPnl).toBe(100)
    expect(yellow.days).toBe(0)
    expect(red.days).toBe(0)
  })

  it('averages R only over days with a risked trade; null when none', () => {
    const pnl = new Map([
      ['d1', 100],
      ['d2', 50],
      ['d3', 20],
    ])
    // Only d1 and d3 had a risked trade; d2 has P&L but no R.
    const dayR = new Map([
      ['d1', 2],
      ['d3', -1],
    ])
    const statusOf = statusMap({ d1: 'green', d2: 'green', d3: 'green' })
    const { green, red } = bucketDayPerformance(pnl, dayR, statusOf)
    expect(green.days).toBe(3) // all three feed avgPnl
    expect(green.avgR).toBeCloseTo(0.5) // (2 + -1) / 2 risked days, NOT / 3
    expect(red.days).toBe(0)
    expect(red.avgR).toBeNull() // empty bucket → no R
  })

  it('reports zeroed/null bucket when it has no days', () => {
    const { yellow } = bucketDayPerformance(new Map(), new Map(), () => 'none')
    expect(yellow).toEqual({ days: 0, avgPnl: 0, winRate: 0, avgR: null })
  })

  it('treats a break-even day as not "up"', () => {
    const pnl = new Map([['d1', 0]])
    const { green } = bucketDayPerformance(pnl, new Map(), statusMap({ d1: 'green' }))
    expect(green.days).toBe(1)
    expect(green.winRate).toBe(0) // pnl > 0 is the win test; 0 is not up
  })
})
