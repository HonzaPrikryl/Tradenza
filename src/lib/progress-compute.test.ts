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
  dayConfirmed,
  dayIsAway,
  awayAppliesTo,
  tradingDayExcused,
  habitDayExcused,
  dayIsOpen,
  dayWithinHistory,
  ruleModeOf,
  isConstraintMode,
  isCleanNoTrade,
  habitDayStatus,
  ruleStreakDayStatus,
  avoidanceState,
  worseStatus,
  aggregateHabitDayStatus,
  resolveTodayStatus,
  bucketHabitPerformance,
  tallyDayRules,
  expectedSoftRulesOn,
  hasUnmetSoftObligation,
  scheduledWeekdaysOf,
  ALL_WEEKDAYS,
  AWAY_BULK_MAX,
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

describe('schedule history — a schedule change is forward-only', () => {
  // Segments are oldest first; each ends (exclusively) where its replacement took over.
  const withHistory = (r: RuleLifecycle, history: { until: string; days: number[] }[]): RuleLifecycle => ({
    ...r,
    scheduleHistory: history,
  })
  const MON_FRI = [1, 2, 3, 4, 5]
  const SAT_PAST = '2026-05-30'
  const SAT_RECENT = '2026-06-06'
  const CHANGED = '2026-06-01'

  it('widening does not invent misses behind you', () => {
    // Mon–Fri since January, moved to every day on 1 June.
    const r = withHistory(rule('a', '2026-01-01', null, true, [...ALL_WEEKDAYS]), [{ until: CHANGED, days: MON_FRI }])
    expect(ruleInEffectOn(SAT_PAST, TODAY, r)).toBe(false) // Saturday under the old schedule
    expect(ruleInEffectOn(SAT_RECENT, TODAY, r)).toBe(true) // Saturday under the new one
    expect(ruleInEffectOn('2026-05-29', TODAY, r)).toBe(true) // a Friday was always in scope
  })

  it('narrowing does not erase verdicts you earned', () => {
    // Every day since January, cut back to Mon–Fri on 1 June.
    const r = withHistory(rule('a', '2026-01-01', null, true, MON_FRI), [{ until: CHANGED, days: [...ALL_WEEKDAYS] }])
    expect(ruleInEffectOn(SAT_PAST, TODAY, r)).toBe(true) // still counts — it did that day
    expect(ruleInEffectOn(SAT_RECENT, TODAY, r)).toBe(false) // dropped from the change on
  })

  it('the boundary day itself belongs to the NEW schedule', () => {
    const r = withHistory(rule('a', '2026-01-01', null, true, MON_FRI), [
      { until: '2026-06-06', days: [...ALL_WEEKDAYS] },
    ])
    expect(ruleInEffectOn('2026-06-06', TODAY, r)).toBe(false) // Saturday = boundary → new
    expect(ruleInEffectOn('2026-05-30', TODAY, r)).toBe(true) // the Saturday before → old
  })

  it('reads the right segment when the schedule changed more than once', () => {
    // every day → Mon–Fri (1 May) → weekends only (1 June)
    const r = withHistory(rule('a', '2026-01-01', null, true, [6, 7]), [
      { until: '2026-05-01', days: [...ALL_WEEKDAYS] },
      { until: CHANGED, days: MON_FRI },
    ])
    expect(ruleInEffectOn('2026-04-25', TODAY, r)).toBe(true) // Sat, first segment
    expect(ruleInEffectOn('2026-05-14', TODAY, r)).toBe(true) // Thu, second segment
    expect(ruleInEffectOn(SAT_PAST, TODAY, r)).toBe(false) // Sat, second segment
    expect(ruleInEffectOn(SAT_RECENT, TODAY, r)).toBe(true) // Sat, live segment
    expect(ruleInEffectOn('2026-06-04', TODAY, r)).toBe(false) // Thu, live segment
  })

  it('applies to every rule kind — a widened CONSTRAINT is not breached in the past', () => {
    // Scheduling is the same question for tasks and constraints; only the day's use of the
    // answer differs.
    const hard = withHistory(rule('h', '2026-01-01', null, true, [...ALL_WEEKDAYS], 'hard'), [
      { until: CHANGED, days: MON_FRI },
    ])
    const soft = withHistory(rule('s', '2026-01-01', null, true, [...ALL_WEEKDAYS], 'soft'), [
      { until: CHANGED, days: MON_FRI },
    ])
    expect(expectedRulesOn(SAT_PAST, TODAY, [hard, soft])).toBe(0)
    expect(expectedRulesOn(SAT_RECENT, TODAY, [hard, soft])).toBe(2)
    // The heatmap case: a widened task must not turn old Saturdays into missed days.
    expect(expectedSoftRulesOn(SAT_PAST, TODAY, [hard, soft])).toBe(0)
    expect(hasUnmetSoftObligation(SAT_PAST, TODAY, [hard, soft])).toBe(false)
    expect(hasUnmetSoftObligation(SAT_RECENT, TODAY, [hard, soft])).toBe(true)
  })

  it('a recorded pause excludes the paused days for good, not just while they are today', () => {
    // Paused on 1 May and still paused — the boundary is the newest segment.
    const paused = withHistory(rule('a', '2026-01-01', null, false, MON_FRI), [{ until: '2026-05-01', days: MON_FRI }])
    expect(ruleInEffectOn('2026-04-30', TODAY, paused)).toBe(true) // Thu before the pause
    expect(ruleInEffectOn('2026-05-14', TODAY, paused)).toBe(false) // Thu inside it — a past
    expect(ruleInEffectOn(TODAY, TODAY, paused)).toBe(false) //         day, still excluded
  })

  it('resuming closes the paused stretch and leaves it excluded', () => {
    const resumed = withHistory(rule('a', '2026-01-01', null, true, MON_FRI), [
      { until: '2026-05-01', days: MON_FRI },
      { until: CHANGED, days: [] }, // paused 1 May → 1 June
    ])
    expect(ruleInEffectOn('2026-04-30', TODAY, resumed)).toBe(true)
    expect(ruleInEffectOn('2026-05-14', TODAY, resumed)).toBe(false)
    expect(ruleInEffectOn('2026-06-04', TODAY, resumed)).toBe(true)
  })

  it('a rule paused before histories existed keeps the old forward-only behaviour', () => {
    // No boundary was recorded, and inventing a pause date would erase real history.
    const legacy = rule('a', '2026-01-01', null, false)
    expect(ruleInEffectOn('2026-03-01', TODAY, legacy)).toBe(true)
    expect(ruleInEffectOn(TODAY, TODAY, legacy)).toBe(false)
  })

  it('history never resurrects a rule outside its own lifetime', () => {
    const archived = withHistory(rule('a', '2026-05-01', '2026-06-10', true, [...ALL_WEEKDAYS]), [
      { until: CHANGED, days: MON_FRI },
    ])
    expect(ruleInEffectOn('2026-04-25', TODAY, archived)).toBe(false) // before creation
    expect(ruleInEffectOn('2026-06-20', TODAY, archived)).toBe(false) // after archival
    expect(ruleInEffectOn('2026-06-06', TODAY, archived)).toBe(true) // in between
  })
})

describe('scheduledWeekdaysOf', () => {
  const MON_FRI = [1, 2, 3, 4, 5]

  it('counts a weekday the rule used to run on, if it did so inside the window', () => {
    const r: RuleLifecycle = {
      ...rule('a', '2026-01-01', null, true, MON_FRI),
      scheduleHistory: [{ until: '2026-06-01', days: [...ALL_WEEKDAYS] }],
    }
    // Window opens before the change → the Saturdays it produced are real samples.
    expect(scheduledWeekdaysOf([r], '2026-04-01')).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]))
    // Window opens after it → only the live schedule is left.
    expect(scheduledWeekdaysOf([r], '2026-06-15')).toEqual(new Set(MON_FRI))
  })

  it('falls back to the live schedule for a rule that never changed', () => {
    expect(scheduledWeekdaysOf([rule('a', '2026-01-01', null, true, MON_FRI)], '2026-01-01')).toEqual(new Set(MON_FRI))
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

  it('reads the same in the past for a rule whose schedule never changed', () => {
    // No history → one schedule for life. A rule that moved is covered above.
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

// "Measure honestly": a scheduled day with no data is not a failed day. Red is reserved
// for days you engaged with and fell short, so the heatmap, the averages and the weekday
// breakdown stop conflating "I broke my process" with "I wasn't using the app".
describe("unlogged — no data isn't a zero", () => {
  const base = { inScope: true, cleanNoTrade: false, hardTotal: 0, hardViolations: 0 }

  it('a scheduled day with nothing recorded is unlogged, not red', () => {
    expect(computeDayStatus({ ...base, confirmed: false, softTotal: 4, softDone: 0 })).toBe('unlogged')
    // …whereas engaging and doing none of them IS a real, red day.
    expect(computeDayStatus({ ...base, confirmed: true, softTotal: 4, softDone: 0 })).toBe('red')
  })

  it('an unconfirmed day is unlogged even when only constraints were scheduled', () => {
    // Silence must not buy a green: without a review there is no evidence the limits held.
    expect(
      computeDayStatus({ ...base, confirmed: false, hardTotal: 2, hardViolations: 0, softTotal: 0, softDone: 0 }),
    ).toBe('unlogged')
    expect(
      computeDayStatus({ ...base, confirmed: true, hardTotal: 2, hardViolations: 0, softTotal: 0, softDone: 0 }),
    ).toBe('green')
  })

  it('a logged breach still reddens the day — a flagged rule IS data', () => {
    expect(
      computeDayStatus({ ...base, confirmed: true, hardTotal: 1, hardViolations: 1, softTotal: 4, softDone: 4 }),
    ).toBe('red')
  })

  it('nothing scheduled stays grey regardless of confirmation', () => {
    expect(computeDayStatus({ ...base, confirmed: false, softTotal: 0, softDone: 0 })).toBe('none')
  })

  it('breaks the clean streak once settled — inaction still costs something', () => {
    const days = ['d0', 'd1', 'd2', 'd3']
    const status = (d: string) => (d === 'd1' ? 'unlogged' : 'green') as DayStatus
    // d0 green, d1 unlogged → the run stops at 1 rather than sailing through the gap.
    expect(currentCleanStreak(days, status, () => true)).toBe(1)
  })

  it('is held at pending while the day is still open, so grace works', () => {
    expect(resolveTodayStatus('unlogged', true, false)).toBe('pending')
    expect(resolveTodayStatus('unlogged', false, false)).toBe('unlogged')
  })

  it('outranks pending but loses to a real verdict when statuses combine', () => {
    expect(worseStatus('unlogged', 'pending')).toBe('unlogged')
    expect(worseStatus('unlogged', 'green')).toBe('unlogged')
    expect(worseStatus('unlogged', 'yellow')).toBe('yellow') // a verdict means data exists
    expect(worseStatus('unlogged', 'red')).toBe('red')
  })

  it('keeps out of the payoff buckets — it carries no verdict to bucket by', () => {
    const pnl = new Map([
      ['d1', 100],
      ['d2', -900],
    ])
    const statusOf = (d: string) => (d === 'd1' ? 'green' : 'unlogged') as DayStatus
    const { green, yellow, red } = bucketDayPerformance(pnl, new Map(), statusOf)
    expect(green.days).toBe(1)
    expect(yellow.days + red.days).toBe(0)
  })

  it('habits: a scheduled day with no habit ticked is unlogged, not 0%', () => {
    expect(aggregateHabitDayStatus(4, 0, []).status).toBe('unlogged')
    expect(aggregateHabitDayStatus(4, 1, []).status).toBe('red') // engaged, fell short (25%)
  })

  it('habits: a logged avoidance breach still reddens an otherwise empty day', () => {
    expect(aggregateHabitDayStatus(3, 0, ['broken']).status).toBe('red')
  })

  // Honestly logging a slip IS engaging with the day, so it can't read as "never filled
  // in" — otherwise the one user who records their lapses gets treated like the one who
  // records nothing.
  it('habits: a logged slip counts as data even with no building habit done', () => {
    // The slip is a record, so the day gets a real verdict — and 0 of 3 building habits
    // on a day you did engage with is a genuine red, not a blank.
    expect(aggregateHabitDayStatus(3, 0, ['warning']).status).toBe('red')
    // Nothing logged at all on the same day: no record, no verdict.
    expect(aggregateHabitDayStatus(3, 0, ['clean']).status).toBe('unlogged')
  })
})

// Mirrors the streak-blocker walk in getProgressStats: past the streak's own green run,
// collect the contiguous unlogged days behind it — those are the ones worth offering to
// excuse. Kept here as a spec of the rule, since the action itself isn't unit-testable.
describe('streak blockers — which days are worth excusing', () => {
  const walk = (statuses: DayStatus[], scheduled: (i: number) => boolean = () => true, cap = AWAY_BULK_MAX) => {
    const days = statuses.map((_, i) => `d${i}`)
    const statusOf = (d: string) => statuses[Number(d.slice(1))]
    const scheduledOn = (d: string) => scheduled(Number(d.slice(1)))
    const streak = currentCleanStreak(days, statusOf, scheduledOn)
    const out: string[] = []
    let overflow = false
    for (let i = 0, greens = 0; i < days.length; i++) {
      if (out.length > cap) {
        overflow = true
        break
      }
      const d = days[i]
      if (!scheduledOn(d)) continue
      const s = statusOf(d)
      if (s === 'pending') continue
      if (s === 'green') {
        if (out.length > 0) break
        greens += 1
        if (greens > streak) break
        continue
      }
      if (s === 'unlogged') {
        out.push(d)
        continue
      }
      break
    }
    return overflow ? [] : out
  }

  it('collects the unlogged run sitting directly behind the streak', () => {
    // 2 green (the live streak), then a 3-day gap, then more green history.
    expect(walk(['green', 'green', 'unlogged', 'unlogged', 'unlogged', 'green', 'green'])).toEqual(['d2', 'd3', 'd4'])
  })

  it('stops at a recorded day — a day you logged and failed is not excusable', () => {
    expect(walk(['green', 'unlogged', 'red', 'unlogged'])).toEqual(['d1'])
    expect(walk(['green', 'red', 'unlogged'])).toEqual([])
  })

  it('offers nothing while the streak is unbroken', () => {
    expect(walk(['green', 'green', 'green'])).toEqual([])
  })

  it('skips unscheduled days rather than treating them as a gap', () => {
    // d2 is a weekend the rule never ran on — it must not appear in the offer.
    expect(walk(['green', 'unlogged', 'unlogged', 'green'], (i) => i !== 2)).toEqual(['d1'])
  })

  it('ignores an open day — there is nothing to excuse yet', () => {
    expect(walk(['pending', 'unlogged', 'green'])).toEqual(['d1'])
  })

  // A partial excuse leaves the streak exactly as broken, so a gap too long for one write
  // offers nothing rather than a button that can't keep its promise.
  // An unlogged day you traded on can't be excused at all (dayIsAway lets the trades win),
  // so it keeps breaking the streak no matter what is excused around it.
  it('offers nothing when the gap contains a day that was traded on', () => {
    expect(dayIsAway(true, true)).toBe(false) // the invariant this relies on
    // Walking back: d1 unlogged-and-traded makes the whole run unfixable.
    const traded = new Set(['d1'])
    const statuses: DayStatus[] = ['green', 'unlogged', 'unlogged', 'green']
    const out: string[] = []
    let unfixable = false
    for (let i = 0, greens = 0; i < statuses.length; i++) {
      const d = `d${i}`
      const s = statuses[i]
      if (s === 'green') {
        if (out.length > 0) break
        greens += 1
        if (greens > 1) break
        continue
      }
      if (s === 'unlogged') {
        if (traded.has(d)) {
          unfixable = true
          break
        }
        out.push(d)
        continue
      }
      break
    }
    expect(unfixable).toBe(true)
    expect(unfixable ? [] : out).toEqual([])
  })

  it('offers nothing when the gap is longer than a single bulk write', () => {
    const gap = Array.from({ length: 40 }, () => 'unlogged' as DayStatus)
    expect(walk(['green', ...gap, 'green'])).toEqual([])
  })

  it('still offers a gap that fits exactly', () => {
    const gap = Array.from({ length: 3 }, () => 'unlogged' as DayStatus)
    expect(walk(['green', ...gap, 'green'], () => true, 3)).toEqual(['d1', 'd2', 'd3'])
  })
})

describe('dayConfirmed / dayIsAway / dayIsOpen / ruleModeOf', () => {
  it('logging any rule confirms the day; so does an explicit review', () => {
    expect(dayConfirmed({ checkedIn: false, hasLoggedRules: true })).toBe(true)
    expect(dayConfirmed({ checkedIn: true, hasLoggedRules: false })).toBe(true)
  })

  it('a day that only has imported trades is NOT confirmed', () => {
    expect(dayConfirmed({ checkedIn: false, hasLoggedRules: false })).toBe(false)
  })

  // Excusing a day removes the OBLIGATION, never the RECORD — any evidence you turned up
  // beats the flag, so it can never delete work that was actually done.
  it('away only applies while nothing shows you turned up', () => {
    expect(dayIsAway(true, false)).toBe(true)
    expect(dayIsAway(true, true)).toBe(false) // self-negates, no DB write needed
    expect(dayIsAway(false, false)).toBe(false)
  })

  // `showedUp` is judged per domain, which is what makes ONE shared calendar-day flag
  // safe: a holiday excused for trading must not wipe the habits you kept on it.
  it('a shared excuse is domain-specific: trading excused, habits still scored', () => {
    const excused = true
    const tradedThatDay = false
    const keptHabitsThatDay = true
    expect(dayIsAway(excused, tradedThatDay)).toBe(true) // trading: nothing to measure
    expect(dayIsAway(excused, keptHabitsThatDay)).toBe(false) // habits: you showed up
  })

  it('only today (and the future) is unsettled — every past day is settled', () => {
    const today = '2026-06-28'
    expect(dayIsOpen(today, today)).toBe(true)
    expect(dayIsOpen('2026-06-29', today)).toBe(true) // future is never settled
    expect(dayIsOpen('2026-06-27', today)).toBe(false) // yesterday has settled
    expect(dayIsOpen('2026-05-31', '2026-06-01')).toBe(false) // …across a month boundary too
  })

  it('bounds edits to the window the rolling stats can actually see', () => {
    const today = '2026-06-28'
    expect(dayWithinHistory(today, today)).toBe(true)
    expect(dayWithinHistory('2026-06-29', today)).toBe(true) // future: planning ahead
    expect(dayWithinHistory('2025-06-28', today)).toBe(true) // exactly 365 days back
    expect(dayWithinHistory('2025-06-27', today)).toBe(false) // one day past the horizon
  })

  it('maps the overloaded tier + domain onto one unambiguous mode', () => {
    expect(ruleModeOf({ type: 'hard', category: 'trading' })).toBe('strict')
    expect(ruleModeOf({ type: 'hard', category: 'habit' })).toBe('avoidance')
    expect(ruleModeOf({ type: 'soft', category: 'trading' })).toBe('building')
    expect(ruleModeOf({ type: 'soft', category: 'habit' })).toBe('building')
  })

  it('both constraint flavours are constraints; tasks are not', () => {
    expect(isConstraintMode('strict')).toBe(true)
    expect(isConstraintMode('avoidance')).toBe(true)
    expect(isConstraintMode('building')).toBe(false)
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

  it("excludes a 'pending' day — today isn't over, so it carries no verdict yet", () => {
    const pnl = new Map([
      ['d1', 100],
      ['today', -500], // in progress: habits simply not ticked yet
    ])
    const statusOf = statusMap({ d1: 'green', today: 'pending' })
    const { green, yellow, red } = bucketDayPerformance(pnl, new Map(), statusOf)
    expect(green.days).toBe(1)
    expect(yellow.days).toBe(0)
    expect(red.days).toBe(0) // the unfinished day must not land in the off-plan bucket
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

  // Silence is not evidence: a day nobody reviewed says nothing about whether the rules
  // were followed, so it's excluded and reported instead of quietly inflating a bucket.
  it('excludes un-reviewed days and counts them separately', () => {
    const pnl = new Map([
      ['d1', 100],
      ['d2', 900], // scored green purely because nothing was flagged
    ])
    const statusOf = statusMap({ d1: 'green', d2: 'green' })
    const { green, unconfirmedDays } = bucketDayPerformance(pnl, new Map(), statusOf, (d) => d === 'd1')
    expect(green.days).toBe(1)
    expect(green.avgPnl).toBe(100) // the un-reviewed 900 must not lift this
    expect(unconfirmedDays).toBe(1)
  })

  it("doesn't count an unscored day as unconfirmed — it was never a candidate", () => {
    const pnl = new Map([['d1', 100]])
    const { unconfirmedDays } = bucketDayPerformance(
      pnl,
      new Map(),
      () => 'none',
      () => false,
    )
    expect(unconfirmedDays).toBe(0)
  })

  it('counts every day when no confirmation predicate is supplied', () => {
    const pnl = new Map([['d1', 100]])
    const { green } = bucketDayPerformance(pnl, new Map(), statusMap({ d1: 'green' }))
    expect(green.days).toBe(1)
  })
})

describe('habitDayStatus', () => {
  const TODAY_H = '2026-06-28'

  it('maps a done day to green (extends the streak)', () => {
    expect(habitDayStatus(true, '2026-06-27', TODAY_H)).toBe('green')
    expect(habitDayStatus(true, TODAY_H, TODAY_H)).toBe('green') // done today counts too
  })

  it('maps a missed past day to red (breaks the streak)', () => {
    expect(habitDayStatus(false, '2026-06-27', TODAY_H)).toBe('red')
  })

  it('grants today grace while still unlogged (none, not red)', () => {
    expect(habitDayStatus(false, TODAY_H, TODAY_H)).toBe('none')
  })

  it('feeds the streak helpers so an unlogged today does not reset the run', () => {
    const done = new Set(['2026-06-26', '2026-06-27'])
    const days = ['2026-06-28', '2026-06-27', '2026-06-26'] // newest first, today unlogged
    const streak = currentCleanStreak(
      days,
      (d) => habitDayStatus(done.has(d), d, TODAY_H),
      () => true,
    )
    expect(streak).toBe(2) // today's grace, then two done days
  })
})

describe('ruleStreakDayStatus — done vs kept on today', () => {
  const T = '2026-06-28'
  const past = '2026-06-27'

  it('past days: good→green, otherwise red (both tiers)', () => {
    expect(ruleStreakDayStatus({ isHard: false, good: true, isToday: false })).toBe('green')
    expect(ruleStreakDayStatus({ isHard: false, good: false, isToday: false })).toBe('red')
    expect(ruleStreakDayStatus({ isHard: true, good: true, isToday: false })).toBe('green')
    expect(ruleStreakDayStatus({ isHard: true, good: false, isToday: false })).toBe('red')
  })

  it('building/soft today: an active completion settles green, not-done is graced', () => {
    expect(ruleStreakDayStatus({ isHard: false, good: true, isToday: true })).toBe('green')
    expect(ruleStreakDayStatus({ isHard: false, good: false, isToday: true })).toBe('none')
  })

  it('avoidance/hard today: kept is provisional (pending), a slip breaks (red)', () => {
    expect(ruleStreakDayStatus({ isHard: true, good: true, isToday: true })).toBe('pending')
    expect(ruleStreakDayStatus({ isHard: true, good: false, isToday: true })).toBe('red')
  })

  it('regression: a hard rule/avoidance habit kept only yesterday reads as 1, not 2', () => {
    // Kept every scheduled day (no slip logged), habit created yesterday.
    const days = [T, past, '2026-06-26']
    const scheduledFromYesterday = (d: string) => d >= past
    const streak = currentCleanStreak(
      days,
      (d) => ruleStreakDayStatus({ isHard: true, good: true, isToday: d === T }),
      scheduledFromYesterday,
    )
    expect(streak).toBe(1) // today provisional (grace), only yesterday counts
  })

  it('a building habit done both yesterday and today still counts today → 2', () => {
    const done = new Set([T, past])
    const days = [T, past, '2026-06-26']
    const scheduledFromYesterday = (d: string) => d >= past
    const streak = currentCleanStreak(
      days,
      (d) => ruleStreakDayStatus({ isHard: false, good: done.has(d), isToday: d === T }),
      scheduledFromYesterday,
    )
    expect(streak).toBe(2)
  })
})

describe('bucketHabitPerformance', () => {
  it('splits scheduled trading days into done vs. missed and averages each', () => {
    const pnl = new Map([
      ['d1', 100], // done
      ['d2', 50], // done
      ['d3', -40], // missed
      ['d4', -20], // missed
    ])
    const done = new Set(['d1', 'd2'])
    const s = bucketHabitPerformance(pnl, (d) => done.has(d), 2)
    expect(s.doneDays).toBe(2)
    expect(s.missedDays).toBe(2)
    expect(s.doneAvgPnl).toBe(75) // (100 + 50) / 2
    expect(s.missedAvgPnl).toBe(-30) // (-40 + -20) / 2
    expect(s.pnlDelta).toBe(105) // 75 − (−30)
    expect(s.doneWinRate).toBe(1) // both done days up
    expect(s.missedWinRate).toBe(0)
    expect(s.enoughData).toBe(true)
  })

  it('flags enoughData=false until BOTH buckets clear the sample floor', () => {
    const pnl = new Map([
      ['d1', 10],
      ['d2', 20],
      ['d3', 30], // only one missed day
    ])
    const done = new Set(['d1', 'd2'])
    const s = bucketHabitPerformance(pnl, (d) => done.has(d), 2)
    expect(s.doneDays).toBe(2)
    expect(s.missedDays).toBe(1)
    expect(s.enoughData).toBe(false) // missed bucket below floor
  })

  it('treats a break-even day as not up (pnl > 0 is the win test)', () => {
    const pnl = new Map([['d1', 0]])
    const s = bucketHabitPerformance(pnl, () => true, 1)
    expect(s.doneDays).toBe(1)
    expect(s.doneWinRate).toBe(0)
  })

  it('empty input yields zeroed, not-enough-data split', () => {
    const s = bucketHabitPerformance(new Map(), () => true, 4)
    expect(s).toEqual({
      doneDays: 0,
      missedDays: 0,
      doneAvgPnl: 0,
      missedAvgPnl: 0,
      doneWinRate: 0,
      missedWinRate: 0,
      pnlDelta: 0,
      enoughData: false,
    })
  })
})

describe('tallyDayRules', () => {
  const traded = { hasTrades: true, checkedIn: false }
  const hard = (completed: boolean) => ({ type: 'hard' as const, category: 'trading' as const, completed })
  const soft = (completed: boolean) => ({ type: 'soft' as const, category: 'trading' as const, completed })
  const habit = (completed: boolean) => ({ type: 'soft' as const, category: 'habit' as const, completed })

  it('scores only trading rules; habits are counted separately', () => {
    const tally = tallyDayRules([soft(true), soft(true), habit(false), habit(false)], traded)
    expect(tally.softTotal).toBe(2)
    expect(tally.softDone).toBe(2)
    expect(tally.habitTotal).toBe(2)
    expect(tally.habitDone).toBe(0)
    expect(tally.status).toBe('green') // 2/2 soft — habits missed but irrelevant
  })

  it('a missed habit never turns the day red', () => {
    const allHabitsMissed = tallyDayRules([soft(true), habit(false), habit(false)], traded)
    expect(allHabitsMissed.status).toBe('green')
  })

  it('a broken hard rule is still red regardless of habits', () => {
    const tally = tallyDayRules([hard(false), habit(true)], traded)
    expect(tally.status).toBe('red')
    expect(tally.hardViolations).toBe(1)
  })

  it('a ticked habit alone does not pull an idle day into scope', () => {
    const idle = tallyDayRules([habit(true)], { hasTrades: false, checkedIn: false })
    expect(idle.status).toBe('none') // no trades, no check-in, no trading rule logged
    expect(idle.habitDone).toBe(1)
  })

  it('a no-trade check-in day is clean green even with habits missed', () => {
    const tally = tallyDayRules([soft(false), habit(false)], { hasTrades: false, checkedIn: true })
    expect(tally.status).toBe('green') // clean sat-out — soft tallies ignored
  })
})

describe('expectedSoftRulesOn / hasUnmetSoftObligation', () => {
  const soft = rule('s', '2026-01-01', null, true, [...ALL_WEEKDAYS], 'soft')
  const hard = rule('h', '2026-01-01', null, true, [...ALL_WEEKDAYS], 'hard')

  it('counts only soft rules in effect', () => {
    expect(expectedSoftRulesOn('2026-06-20', TODAY, [soft, hard])).toBe(1)
    expect(expectedSoftRulesOn('2026-06-20', TODAY, [hard])).toBe(0)
  })

  it('a past day with a scheduled soft rule is an unmet obligation', () => {
    expect(hasUnmetSoftObligation('2026-06-20', TODAY, [soft])).toBe(true)
  })

  it('today is in scope too (resolved to pending elsewhere); the future never counts', () => {
    expect(hasUnmetSoftObligation(TODAY, TODAY, [soft])).toBe(true)
    expect(hasUnmetSoftObligation('2026-07-01', TODAY, [soft])).toBe(false)
  })

  it('hard-only schedules create no soft obligation', () => {
    expect(hasUnmetSoftObligation('2026-06-20', TODAY, [hard])).toBe(false)
  })

  it('respects activeDays — a day off carries no obligation', () => {
    const weekdayOnly = rule('w', '2026-01-01', null, true, [1, 2, 3, 4, 5], 'soft')
    expect(hasUnmetSoftObligation('2026-06-27', TODAY, [weekdayOnly])).toBe(false) // Saturday
    expect(hasUnmetSoftObligation('2026-06-26', TODAY, [weekdayOnly])).toBe(true) // Friday
  })
})

describe('tallyDayRules — past scheduled-soft obligation', () => {
  const soft = (completed: boolean) => ({ type: 'soft' as const, category: 'trading' as const, completed })

  it('a settled day with an unmet soft rule (no trade, no check-in) is unlogged', () => {
    // Nothing was recorded, so there is no verdict — it still breaks the streak and
    // counts against coverage, but it is not scored as a day you fell short on.
    const tally = tallyDayRules([soft(false)], { hasTrades: false, checkedIn: false, isOpen: false })
    expect(tally.status).toBe('unlogged')
  })

  it('engaging and still falling short IS a red day', () => {
    // Two soft rules, one ticked → the day has data and lands under the red threshold.
    const tally = tallyDayRules([soft(true), soft(false), soft(false), soft(false)], {
      hasTrades: true,
      checkedIn: false,
      isOpen: false,
    })
    expect(tally.status).toBe('red')
  })

  it('the same day while still open shows pending, never a verdict', () => {
    const tally = tallyDayRules([soft(false)], { hasTrades: false, checkedIn: false, isOpen: true })
    expect(tally.status).toBe('pending')
  })

  it('a no-trade check-in keeps a settled soft day green', () => {
    const tally = tallyDayRules([soft(false)], { hasTrades: false, checkedIn: true, isOpen: false })
    expect(tally.status).toBe('green')
  })

  it('a settled day with the soft rule done is green', () => {
    const tally = tallyDayRules([soft(true)], { hasTrades: false, checkedIn: false, isOpen: false })
    expect(tally.status).toBe('green')
  })

  // The client mirror must take `isOpen` from dayIsOpen, not from its own idea of what
  // counts as unsettled, or the cell would disagree with the refetch.
  it('takes `isOpen` from dayIsOpen: today holds, yesterday has settled', () => {
    const today = '2026-06-28'
    const ctx = { hasTrades: false, checkedIn: false }
    expect(tallyDayRules([soft(false)], { ...ctx, isOpen: dayIsOpen(today, today) }).status).toBe('pending')
    // Settled and empty — no data, so no verdict. See the unlogged suite.
    expect(tallyDayRules([soft(false)], { ...ctx, isOpen: dayIsOpen('2026-06-27', today) }).status).toBe('unlogged')
  })
})

describe('avoidanceState — never miss twice', () => {
  it('no slip → clean', () => {
    expect(avoidanceState(false, false)).toBe('clean')
    expect(avoidanceState(false, true)).toBe('clean')
  })
  it('isolated slip → warning', () => {
    expect(avoidanceState(true, false)).toBe('warning')
  })
  it('slip after a previous scheduled slip → broken', () => {
    expect(avoidanceState(true, true)).toBe('broken')
  })
})

describe('worseStatus', () => {
  it('picks the more severe (red > yellow > green > none)', () => {
    expect(worseStatus('green', 'none')).toBe('green')
    expect(worseStatus('green', 'yellow')).toBe('yellow')
    expect(worseStatus('red', 'green')).toBe('red')
    expect(worseStatus('none', 'none')).toBe('none')
    expect(worseStatus('yellow', 'red')).toBe('red')
  })
})

describe('aggregateHabitDayStatus', () => {
  it('building-only: green at 100%, unlogged at 0% (no data), red once engaged', () => {
    expect(aggregateHabitDayStatus(2, 2, []).status).toBe('green')
    // Nothing ticked = nothing recorded, so there is no verdict to give.
    expect(aggregateHabitDayStatus(2, 0, []).status).toBe('unlogged')
    expect(aggregateHabitDayStatus(4, 1, []).status).toBe('red') // 25%, and recorded
  })
  it('a warning avoidance caps an otherwise-green day at yellow', () => {
    const r = aggregateHabitDayStatus(2, 2, ['warning'])
    expect(r.status).toBe('yellow')
  })
  it('a broken avoidance makes the day red regardless of building', () => {
    const r = aggregateHabitDayStatus(2, 2, ['broken'])
    expect(r.status).toBe('red')
  })
  it('avoidance-only clean day is full green (ratio 1)', () => {
    const r = aggregateHabitDayStatus(0, 0, ['clean'])
    expect(r.status).toBe('green')
    expect(r.ratio).toBe(1)
  })
  it('worst avoidance state wins across habits', () => {
    expect(aggregateHabitDayStatus(0, 0, ['clean', 'warning', 'broken']).status).toBe('red')
    expect(aggregateHabitDayStatus(0, 0, ['clean', 'warning']).status).toBe('yellow')
  })
  it('ratio reflects building completion when building is scheduled', () => {
    expect(aggregateHabitDayStatus(4, 3, []).ratio).toBeCloseTo(0.75)
  })

  // The quality score mirrors the trading day's disciplineOf: constraints never pad the
  // numerator, and a definitive breach zeroes the day.
  it('a broken avoidance zeroes the ratio even with every building habit kept', () => {
    const r = aggregateHabitDayStatus(2, 2, ['broken'])
    expect(r.status).toBe('red')
    expect(r.ratio).toBe(0) // must not average in as a perfect day
  })

  it('a warning leaves the task ratio intact — the colour carries the slip', () => {
    expect(aggregateHabitDayStatus(4, 3, ['warning']).ratio).toBeCloseTo(0.75)
    expect(aggregateHabitDayStatus(0, 0, ['warning']).ratio).toBe(1) // no task to miss
  })

  it('avoidance habits never pad the ratio: 2 clean + 2 of 4 tasks is still 50%', () => {
    const r = aggregateHabitDayStatus(4, 2, ['clean', 'clean'])
    expect(r.status).toBe('green')
    // Were the constraints counted, this would read 4/6 — they add nothing.
    expect(r.ratio).toBeCloseTo(0.5)
  })
})

describe('resolveTodayStatus — today pending grace', () => {
  it('past days pass through unchanged', () => {
    expect(resolveTodayStatus('red', false, false)).toBe('red')
    expect(resolveTodayStatus('yellow', false, false)).toBe('yellow')
    expect(resolveTodayStatus('green', false, false)).toBe('green')
  })
  it('today: incomplete (yellow/red, no violation) → pending', () => {
    expect(resolveTodayStatus('red', true, false)).toBe('pending')
    expect(resolveTodayStatus('yellow', true, false)).toBe('pending')
  })
  it('today: a definitive violation keeps its colour', () => {
    expect(resolveTodayStatus('red', true, true)).toBe('red')
    expect(resolveTodayStatus('yellow', true, true)).toBe('yellow')
  })
  it('today: green (complete) and none (idle) are never downgraded', () => {
    expect(resolveTodayStatus('green', true, false)).toBe('green')
    expect(resolveTodayStatus('none', true, false)).toBe('none')
  })
})

describe('aggregateHabitDayStatus — isToday', () => {
  it("today's building incompleteness shows pending, never a verdict", () => {
    expect(aggregateHabitDayStatus(4, 1, [], true).status).toBe('pending')
    expect(aggregateHabitDayStatus(4, 1, [], false).status).toBe('red') // settled = real miss
    // With nothing ticked at all the settled day is unlogged rather than failed.
    expect(aggregateHabitDayStatus(4, 0, [], false).status).toBe('unlogged')
  })
  it('a definitive avoidance slip still colours through today', () => {
    expect(aggregateHabitDayStatus(3, 0, ['broken'], true).status).toBe('red')
    expect(aggregateHabitDayStatus(3, 3, ['warning'], true).status).toBe('yellow')
  })
  it('fully done today is green (positive feedback), not pending', () => {
    expect(aggregateHabitDayStatus(2, 2, [], true).status).toBe('green')
  })
  it('pending outranks a clean avoidance so building-not-done shows over green', () => {
    expect(aggregateHabitDayStatus(2, 0, ['clean'], true).status).toBe('pending')
  })

  // Staying clean is provisional until midnight. With no task to finish there's nothing
  // else to score, so the day must not bank a green it could still lose.
  it('an avoidance-only today that is merely unbroken reads pending, not green', () => {
    expect(aggregateHabitDayStatus(0, 0, ['clean'], true).status).toBe('pending')
    expect(aggregateHabitDayStatus(0, 0, ['clean'], false).status).toBe('green') // settled past day
  })

  it('finishing the tasks still earns green today, provisional constraints and all', () => {
    expect(aggregateHabitDayStatus(2, 2, ['clean'], true).status).toBe('green')
  })

  // While the day runs, an unfinished task is pending rather than a miss — there is still
  // time. At midnight it commits.
  it('an unfinished task holds at pending while the day is still running', () => {
    expect(aggregateHabitDayStatus(4, 1, [], true).status).toBe('pending')
    expect(aggregateHabitDayStatus(4, 1, [], false).status).toBe('red')
  })
})

describe('streaks — pending is grace (skip, never break)', () => {
  const scheduled = () => true
  it('a pending today neither counts nor breaks the current streak', () => {
    // today pending, then two green days → streak is 2 (today skipped, not broken)
    const days = ['d0', 'd1', 'd2']
    const status = (d: string) => (d === 'd0' ? 'pending' : 'green') as DayStatus
    expect(currentCleanStreak(days, status, scheduled)).toBe(2)
  })
  it('pending does not reset the best streak', () => {
    const days = ['d1', 'd2', 'd3'] // oldest first
    const status = (d: string) => (d === 'd3' ? 'pending' : 'green') as DayStatus
    expect(bestCleanStreak(days, status, scheduled)).toBe(2)
  })
})

// ─── Client/server parity on what counts as settled ─────────────────────────
//
// Both day panels recompute a day optimistically before the server answers, and both
// scorers decide "is this day still open?" the same way. If the two ever disagree, the
// cell flashes a colour and snaps back on the refetch — which is exactly what happened
// when the habits panel let its open-flag default instead of deriving it.
describe('open vs settled — one definition, both domains', () => {
  const today = '2026-07-27'
  const yesterday = '2026-07-26'

  it('habits: today holds at pending, yesterday has committed', () => {
    expect(aggregateHabitDayStatus(3, 1, [], true).status).toBe('pending')
    expect(aggregateHabitDayStatus(3, 1, [], false).status).toBe('yellow')
  })

  it('trading: tallyDayRules agrees, driven by dayIsOpen', () => {
    const rules = [
      { type: 'soft', category: 'trading', completed: true },
      { type: 'soft', category: 'trading', completed: false },
      { type: 'soft', category: 'trading', completed: false },
    ] as const
    const ctx = { hasTrades: true, checkedIn: false }
    expect(tallyDayRules([...rules], { ...ctx, isOpen: dayIsOpen(today, today) }).status).toBe('pending')
    expect(tallyDayRules([...rules], { ...ctx, isOpen: dayIsOpen(yesterday, today) }).status).toBe('yellow')
  })
})

// ─── Per-rule streaks break on an unlogged day ───────────────────────────────
//
// A rate and a streak make different claims about the same days. The rate is "of the days
// I recorded, how often did I comply?", so a day with no verdict is excluded. A streak
// asserts an unbroken RUN, which cannot skip over a day nobody recorded — and the flame
// beside a rule has to agree with the clean-streak card above it.
//
// It matters most for constraints: nothing logged means nothing breached, so before this
// an avoidance habit's flame grew straight through a fortnight of silence.
describe('ruleStreakDayStatus — an unlogged day is not a free pass', () => {
  const past = { isToday: false }

  it('constraint: a settled day with no data breaks instead of banking a green', () => {
    expect(ruleStreakDayStatus({ ...past, isHard: true, good: true, dayLogged: false })).toBe('unlogged')
    // …and that is what the streak walk treats as a break.
    expect(
      currentCleanStreak(
        ['d0'],
        () => 'unlogged',
        () => true,
      ),
    ).toBe(0)
  })

  it('task: a settled day with no data breaks too', () => {
    expect(ruleStreakDayStatus({ ...past, isHard: false, good: false, dayLogged: false })).toBe('unlogged')
  })

  it('a logged day is unaffected — good extends, bad breaks', () => {
    expect(ruleStreakDayStatus({ ...past, isHard: true, good: true, dayLogged: true })).toBe('green')
    expect(ruleStreakDayStatus({ ...past, isHard: true, good: false, dayLogged: true })).toBe('red')
    expect(ruleStreakDayStatus({ ...past, isHard: false, good: true, dayLogged: true })).toBe('green')
  })

  it('today keeps its own semantics: a constraint is provisional, a done task counts', () => {
    expect(ruleStreakDayStatus({ isToday: true, isHard: true, good: true, dayLogged: false })).toBe('pending')
    expect(ruleStreakDayStatus({ isToday: true, isHard: false, good: true, dayLogged: false })).toBe('green')
    expect(ruleStreakDayStatus({ isToday: true, isHard: false, good: false, dayLogged: false })).toBe('none')
  })

  it('a run of unlogged days stops the streak at the gap', () => {
    // newest first: two green, then an unlogged day, then more green
    const days = ['d0', 'd1', 'd2', 'd3', 'd4']
    const status = (d: string) => (d === 'd2' ? 'unlogged' : 'green') as DayStatus
    expect(currentCleanStreak(days, status, () => true)).toBe(2)
  })
})

// ─── Streak repair is only offered when it would repair something ────────────
//
// `streakBlockers` (getProgressStats) walks back from today collecting the run of settled
// unlogged days sitting behind the streak. The walk below mirrors it. The part worth
// pinning is `runBehindGap`: without it the prompt fired for anyone whose scheduled days
// were simply never filled in — including a user a week in with no streak to rescue —
// while the copy promised "the streak carries over". Excusing days there reconnects
// nothing, so the offer must not appear at all.
describe('streakBlockers — needs a run on the far side of the gap', () => {
  const walk = (statuses: DayStatus[], currentStreak: number, scheduled: (i: number) => boolean = () => true) => {
    const out: string[] = []
    let overflow = false
    let runBehindGap = false
    for (let i = 0, greens = 0; i < statuses.length; i++) {
      if (out.length > AWAY_BULK_MAX) {
        overflow = true
        break
      }
      if (!scheduled(i)) continue
      const s = statuses[i]
      if (s === 'pending') continue
      if (s === 'green') {
        if (out.length > 0) {
          runBehindGap = true
          break
        }
        greens += 1
        if (greens > currentStreak) break
        continue
      }
      if (s === 'unlogged') {
        out.push(`d${i}`)
        continue
      }
      break
    }
    if (overflow || !runBehindGap) out.length = 0
    return out
  }

  it('a real streak broken by a gap is offered', () => {
    const days: DayStatus[] = ['pending', 'unlogged', 'unlogged', 'unlogged', 'green', 'green', 'green']
    expect(walk(days, 0)).toHaveLength(3)
  })

  it('a live streak, a gap, then an older run — still offered', () => {
    expect(walk(['green', 'unlogged', 'green', 'green'] as DayStatus[], 1)).toHaveLength(1)
  })

  it('a new user who has simply never logged is NOT nagged', () => {
    expect(walk(['pending', ...Array<DayStatus>(9).fill('unlogged')], 0)).toHaveLength(0)
  })

  it('day one, with nothing scheduled behind it, is not nagged either', () => {
    expect(walk(['pending'] as DayStatus[], 0, (i) => i === 0)).toHaveLength(0)
  })

  it('a gap backing onto a red day is not offered — the red still breaks it', () => {
    expect(walk(['pending', 'unlogged', 'unlogged', 'red', 'green'] as DayStatus[], 0)).toHaveLength(0)
  })
})

// ─── One away flag, two domains ──────────────────────────────────────────────
//
// `away` is a single fact about the calendar day, shared by the Trading and Daily tabs.
// What makes that safe is that its EFFECT is judged per domain: any evidence you turned up
// beats the flag, and the evidence differs (trading counts trades and logged rules, habits
// count logged habits). A holiday you nonetheless kept your habits through is excused for
// trading and still scored — and credited — for habits.
//
// The corollary the UI has to respect: the stored flag and its effective value diverge, so
// a toggle bound to the effective one gets stuck. See DayProgress.awayFlag.
describe('dayIsAway — the flag self-negates per domain', () => {
  it('excuses a day nothing shows you turned up for', () => {
    expect(dayIsAway(true, false)).toBe(true)
  })

  it('but evidence of showing up always wins', () => {
    expect(dayIsAway(true, true)).toBe(false)
  })

  it('a day that was never flagged is never away, evidence or not', () => {
    expect(dayIsAway(false, false)).toBe(false)
    expect(dayIsAway(false, true)).toBe(false)
  })

  it('the same flag can be away for one domain and not the other', () => {
    const flagged = true
    const tradedOrLoggedRules = false // sat out of trading entirely
    const loggedHabits = true // …but still went to the gym
    expect(dayIsAway(flagged, tradedOrLoggedRules)).toBe(true) // trading: excused
    expect(dayIsAway(flagged, loggedHabits)).toBe(false) // habits: scored and credited
  })
})

// ─── Away scope × domain ─────────────────────────────────────────────────────
//
// One flag, one row, but the user can say WHICH side of the app the day off covers. Two
// independent gates guard an excused day and both must pass: `awayAppliesTo` (did you mean
// to excuse this domain?) and `dayIsAway` (did you turn up anyway?). Keeping them separate
// is what lets "a week off the markets" leave the habit streaks running while still being
// negated by evidence, exactly as before.
describe('awayAppliesTo — which domain a day off covers', () => {
  it("'both' covers everything — the default, and what every pre-existing row means", () => {
    expect(awayAppliesTo('both', 'trading')).toBe(true)
    expect(awayAppliesTo('both', 'habits')).toBe(true)
  })

  it("'trading' leaves the daily habits running", () => {
    expect(awayAppliesTo('trading', 'trading')).toBe(true)
    expect(awayAppliesTo('trading', 'habits')).toBe(false)
  })

  it("'habits' leaves trading scoring", () => {
    expect(awayAppliesTo('habits', 'habits')).toBe(true)
    expect(awayAppliesTo('habits', 'trading')).toBe(false)
  })

  it('the two gates compose: scope decides intent, evidence still overrides it', () => {
    // A week off the markets. Habits are outside the excuse, so a missed habit still costs.
    const flagged = true
    const scope = 'trading' as const
    expect(dayIsAway(flagged && awayAppliesTo(scope, 'trading'), false)).toBe(true) // trading excused
    expect(dayIsAway(flagged && awayAppliesTo(scope, 'habits'), false)).toBe(false) // habits still scored
    // …and excusing trading then trading anyway is inert, as it always was.
    expect(dayIsAway(flagged && awayAppliesTo(scope, 'trading'), true)).toBe(false)
  })
})

// ─── Unlogged days score zero in the headline average ────────────────────────
//
// A settled scheduled day nobody filled in is absence of data, and for a long time that
// kept it out of the 30-day average entirely. The effect was perverse: logging a day you
// fell short lowered the number, forgetting the same day did not — silence was the
// cheapest option in a product whose claim is honesty. Recording is part of the process,
// so the headline scores it.
//
// The DIAGNOSTICS deliberately still ignore such days (per-rule rates, weekday bars,
// payoff buckets), because "which weekday do I slip?" must not become "which weekday do I
// forget to log?". This pins the headline arithmetic; the split itself is asserted by the
// scorer's own suites.
describe('30-day average — the denominator is days you were supposed to log', () => {
  // Mirrors the loop in getProgressStats: settled scheduled days count, logged ones
  // contribute their ratio, unlogged ones contribute nothing.
  const avg = (days: { scored: boolean; ratio: number }[]) => {
    let sum = 0
    for (const d of days) if (d.scored) sum += d.ratio
    return days.length ? sum / days.length : 0
  }

  it('a perfect week with three days missed is not 100%', () => {
    const days = [
      { scored: true, ratio: 1 },
      { scored: true, ratio: 1 },
      { scored: false, ratio: 0 },
      { scored: false, ratio: 0 },
      { scored: false, ratio: 0 },
    ]
    expect(avg(days)).toBeCloseTo(0.4)
  })

  it('owning up now costs no more than staying silent', () => {
    const owned = avg([
      { scored: true, ratio: 1 },
      { scored: true, ratio: 0 }, // logged, and fell short
    ])
    const silent = avg([
      { scored: true, ratio: 1 },
      { scored: false, ratio: 0 }, // never filled in
    ])
    expect(owned).toBe(silent)
  })

  it('a fully logged window is unaffected by the change', () => {
    expect(
      avg([
        { scored: true, ratio: 1 },
        { scored: true, ratio: 0.5 },
      ]),
    ).toBeCloseTo(0.75)
  })
})

// ─── An explicit excuse beats an inference ───────────────────────────────────
//
// `showedUp` used to include logged ROWS — a ticked rule, a logged habit. That predated
// AwayScope and was the only way to say "excused for trading, still scored for habits".
// Once the scope existed the inference started overruling the control it stood in for:
// excuse a day whose tasks you had already ticked and the day stayed coloured, the button
// still read "Not counted", and nothing the user did could change it.
//
// Now only a TRADE overrides, and only for trading — a hard fact that can also arrive by
// import into a day excused months ago. Ticked rows override nothing; the record is kept
// either way, so honouring what the user said costs nothing.
describe('tradingDayExcused / habitDayExcused', () => {
  it('a scoped excuse survives ticked rules — the bug that was reported', () => {
    expect(tradingDayExcused({ away: true, scope: 'trading', hasTrades: false })).toBe(true)
    expect(habitDayExcused({ away: true, scope: 'habits' })).toBe(true)
  })

  it('a trade still overrides, for trading only', () => {
    expect(tradingDayExcused({ away: true, scope: 'both', hasTrades: true })).toBe(false)
    // Habits don't care whether you traded.
    expect(habitDayExcused({ away: true, scope: 'both' })).toBe(true)
  })

  it('scope still decides which side an excuse reaches', () => {
    expect(tradingDayExcused({ away: true, scope: 'habits', hasTrades: false })).toBe(false)
    expect(habitDayExcused({ away: true, scope: 'trading' })).toBe(false)
  })

  it('no flag, no excuse', () => {
    expect(tradingDayExcused({ away: false, scope: 'both', hasTrades: false })).toBe(false)
    expect(habitDayExcused({ away: false, scope: 'both' })).toBe(false)
  })

  it('"whole day" still reaches both sides', () => {
    expect(tradingDayExcused({ away: true, scope: 'both', hasTrades: false })).toBe(true)
    expect(habitDayExcused({ away: true, scope: 'both' })).toBe(true)
  })
})
