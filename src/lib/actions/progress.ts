'use server'

import { db, progressRules, progressRuleSchedules, ruleCompletions, dailyCheckins, trades } from '@/lib/db'
import { runAtomic } from '@/lib/db/atomic'
import { and, eq, sql, gte, lte, lt, isNull, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { t, tList } from '@/i18n'
import { uuid, uuidArray, dateKey, year as yearSchema } from '@/lib/validation'
import { authedAction, mutationAction } from '@/lib/safe-action'
import { NotFoundError, ValidationError } from '@/lib/action-errors'
import { readGlobalSettings } from '@/lib/global-settings'
import { dayKeyInTz, shiftDay } from '@/lib/date-tz'
import {
  expectedRulesOn,
  ruleIdsInEffectOn,
  ruleInEffectOn,
  computeDayScore,
  expectedSoftRulesOn,
  hasUnmetSoftObligation,
  currentCleanStreak,
  bestCleanStreak,
  bucketDayPerformance,
  bucketHabitPerformance,
  HABIT_PERF_MIN_SAMPLE,
  dayInScope,
  dayConfirmed,
  tradingDayExcused,
  habitDayExcused,
  type AwayScope,
  dayIsOpen,
  isCleanNoTrade,
  ruleStreakDayStatus,
  avoidanceState,
  aggregateHabitDayStatus,
  resolveTodayStatus,
  type AvoidanceState,
  ALL_WEEKDAYS,
  WEEKDAYS,
  AWAY_BULK_MAX,
  RULE_NAME_MAX,
  RULE_DESC_MAX,
  HISTORY_WINDOW_DAYS,
  dayWithinHistory,
  scheduledWeekdaysOf,
  type RuleLifecycle,
  type ScheduleSegment,
  type RuleType,
  type RuleCategory,
  type DayStatus,
  type HabitPerfSplit,
} from '@/lib/progress-compute'
import { sanitizeRichTextValue } from '@/lib/rich-text'

// NOTE — the global header filters (account, date range, $/R unit) are deliberately
// NOT read here. Discipline records the trader's process, not a slice of trades:
// rules and check-ins belong to the user rather than to an account, and the heatmap,
// streaks and schedules only mean anything over an unbroken calendar. Everything below
// therefore spans every account and its own fixed window (365 days / the selected
// year). The known caveat is the P&L correlation, which sums net P&L across accounts —
// account-scoped correlation would need its own, explicit control on the page.

async function todayKey(): Promise<string> {
  const { timezone } = await readGlobalSettings()
  return dayKeyInTz(new Date(), timezone)
}

/** Superseded schedules per rule, oldest first. */
type ScheduleHistory = Map<string, ScheduleSegment[]>

/**
 * Every rule's superseded schedules, keyed by rule id, oldest first. One query for the whole
 * user: a schedule change writes a single row, so even a heavily edited account has a few
 * dozen, and every scorer needs the same set. An absent key means "one schedule for life".
 */
async function loadScheduleHistory(userId: string): Promise<ScheduleHistory> {
  const rows = await db
    .select({
      ruleId: progressRuleSchedules.ruleId,
      until: progressRuleSchedules.effectiveTo,
      days: progressRuleSchedules.activeDays,
    })
    .from(progressRuleSchedules)
    .where(eq(progressRuleSchedules.userId, userId))
    .orderBy(progressRuleSchedules.effectiveTo)
  const byRule: ScheduleHistory = new Map()
  for (const r of rows) {
    const list = byRule.get(r.ruleId)
    if (list) list.push({ until: r.until, days: r.days })
    else byRule.set(r.ruleId, [{ until: r.until, days: r.days }])
  }
  return byRule
}

// Project a rule row onto its effective-dated lifecycle in the user's timezone. Omitting
// `history` means "never changed schedule", so every scorer must pass it.
function toLifecycle(tz: string | null, history?: ScheduleHistory) {
  return (r: {
    id: string
    ruleType: RuleType
    createdAt: Date
    archivedAt: Date | null
    active: boolean
    activeDays: number[]
  }): RuleLifecycle => ({
    id: r.id,
    type: r.ruleType,
    createdDay: dayKeyInTz(r.createdAt, tz),
    archivedDay: r.archivedAt ? dayKeyInTz(r.archivedAt, tz) : null,
    active: r.active,
    activeDays: r.activeDays,
    scheduleHistory: history?.get(r.id),
  })
}

// Distinct day keys (in the user's tz) that had at least one trade within a
// UTC-bounded window. The bound is padded ±1 day so timezone offsets never clip
// a boundary day. Used to decide which days are "in scope" for scoring.
async function tradeDayKeys(userId: string, tz: string | null, fromDay: string, toDay: string): Promise<Set<string>> {
  const fromUtc = new Date(`${shiftDay(fromDay, -1)}T00:00:00.000Z`)
  const toUtc = new Date(`${shiftDay(toDay, 2)}T00:00:00.000Z`)
  const rows = await db
    .select({ e: trades.entryDatetime })
    .from(trades)
    .where(and(eq(trades.userId, userId), gte(trades.entryDatetime, fromUtc), lt(trades.entryDatetime, toUtc)))
  const set = new Set<string>()
  for (const r of rows) if (r.e) set.add(dayKeyInTz(r.e, tz))
  return set
}

// Did this single day have any trades (in the user's tz)?
async function dayHasTrades(userId: string, tz: string | null, day: string): Promise<boolean> {
  const set = await tradeDayKeys(userId, tz, day, day)
  return set.has(day)
}

/**
 * Days excused FOR ONE DOMAIN: the flag is set and its scope covers that side of the app.
 *
 * Trading callers must still let a TRADE override (see tradingDayExcused) — a trade can be
 * imported into a day excused months ago. Habits have no such override.
 */
function excusedDays(
  rows: { date: string; away: boolean; awayScope: AwayScope }[],
  domain: 'trading' | 'habits',
): Set<string> {
  const set = new Set<string>()
  for (const r of rows)
    if (
      domain === 'trading'
        ? tradingDayExcused({ away: r.away, scope: r.awayScope, hasTrades: false })
        : habitDayExcused({ away: r.away, scope: r.awayScope })
    )
      set.add(r.date)
  return set
}

// Group completions into date → set of completed rule ids.
function completionsByDate(rows: { date: string; ruleId: string }[]): Map<string, Set<string>> {
  const byDate = new Map<string, Set<string>>()
  for (const c of rows) {
    if (!byDate.has(c.date)) byDate.set(c.date, new Set())
    byDate.get(c.date)!.add(c.ruleId)
  }
  return byDate
}

// Store schedules in canonical Mon→Sun order regardless of click order.
const sortDays = (days: number[]) => [...days].sort((a, b) => a - b)

// Trading-only projection shared by the calendar, year and stats scorers. Only
// 'trading' rules drive the day status and the PnL correlation stats, so habit rows
// and their completions are dropped here (habits are scored by getHabitsReview). One
// place to keep that filter, so a new scorer can't accidentally let habits leak into
// the trading day status.
function tradingScoringView(
  ruleRows: (typeof progressRules.$inferSelect)[],
  comps: { date: string; ruleId: string }[],
  tz: string | null,
  history: ScheduleHistory,
) {
  const trading = ruleRows.filter((r) => r.category !== 'habit')
  const tradingIds = new Set(trading.map((r) => r.id))
  return {
    trading,
    lifecycles: trading.map(toLifecycle(tz, history)),
    byDate: completionsByDate(comps.filter((c) => tradingIds.has(c.ruleId))),
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProgressRule {
  id: string
  name: string
  description: string | null
  type: RuleType
  category: RuleCategory
  sortOrder: number
  active: boolean
  activeDays: number[]
  /**
   * The day this rule's CURRENT schedule took over, or null if it has run on the same
   * schedule since it was created. Days before it were scored under an older schedule and
   * keep it — the list uses this to say so.
   */
  scheduleSince: string | null
}

export interface DayRule {
  id: string
  name: string
  description: string | null
  type: RuleType
  category: RuleCategory
  /**
   * The *good* state of the rule for this day:
   *   soft habit → true = done
   *   hard rule  → true = respected (no violation logged)
   * Toggling a hard rule to false records a violation.
   */
  completed: boolean
}

export interface DayProgress {
  date: string
  note: string
  checkedIn: boolean
  hasTrades: boolean
  /**
   * Away and ACTUALLY excused for trading — i.e. the flag is set and nothing shows you
   * turned up. This is what the scoring uses.
   */
  away: boolean
  /**
   * The raw stored flag, before a trade can override it (see tradingDayExcused).
   *
   * The toggle has to bind to THIS, not to `away`. They differ whenever the flag is set on
   * a day you did turn up for — and there the effective value reads false, so the button
   * said "Don't count this day" about a day already marked, and pressing it just wrote
   * `true` again. The control was stuck with no way to clear the flag.
   */
  awayFlag: boolean
  /** Which domains the excuse covers. Only meaningful while `awayFlag` is set. */
  awayScope: AwayScope
  /**
   * Is this today (in the user's timezone)? `pending` only ever applies to today, so this
   * is what tells a live day apart from a settled one. Mirrors HabitDayData.isToday.
   */
  isToday: boolean
  /**
   * Is the day inside the rolling history window? Beyond it the stats can't see the day,
   * so the excuse control is withheld rather than offered and then rejected.
   */
  withinHistory: boolean
  /**
   * The user engaged with this day (ticked a rule or marked it reviewed) rather than the
   * day merely existing because trades were imported. Drives the "confirm this day"
   * prompt and gates the P&L correlation. See dayConfirmed.
   */
  confirmed: boolean
  status: DayStatus
  rules: DayRule[]
  hardTotal: number
  hardViolations: number
  softTotal: number
  softDone: number
  /** Soft habits done — kept for the progress ring. Equals softDone. */
  completedCount: number
  /** Soft habits scheduled — kept for the progress ring. Equals softTotal. */
  totalCount: number
  anyRules: boolean
}

export interface ProgressCalendarCell {
  date: string
  status: DayStatus
  /** Explicit no-trade check-in day — its soft stats are excluded from averages. */
  cleanNoTrade: boolean
  /** Marked away — neutral, like a day nothing was scheduled on. */
  away: boolean
  hardTotal: number
  hardViolations: number
  softTotal: number
  softDone: number
  ratio: number // soft ratio, 0..1
  hasNote: boolean
}

export interface RuleStat {
  id: string
  name: string
  type: RuleType
  /** soft: days the habit was done; hard: days the rule was respected. */
  completed: number
  /**
   * How many tracked (in-scope, rule-in-effect) days went into `rate`. When 0 the
   * rule has had no chance to be complied with yet, so `rate` is meaningless — the
   * UI must show "no data" rather than a misleading 0%.
   */
  tracked: number
  /** soft: completion rate; hard: respect rate. 0..1. */
  rate: number
  /**
   * Current streak of consecutive tracked days the rule was complied with (soft: done;
   * hard: respected), today granted grace while unlogged — the flame next to the rule.
   * Mirrors the per-habit streak so both consistency lists read the same.
   */
  streak: number
}

// Rolling, always-current discipline stats. The two YEAR-SCOPED cards (best streak,
// clean days) are deliberately NOT here: they follow the year the user has selected on
// the heatmap, so they come from getProgressYear (`bestStreak` / `perfectDays`) and are
// passed to the cards as `yearStats`. Computing them here too would mean two scans that
// can disagree the moment the user scrolls to a past year.
export interface ProgressStats {
  activeRules: number
  /** Clean streak: consecutive in-scope days (most recent first) with no hard violation. */
  currentStreak: number
  /**
   * The contiguous run of settled UNLOGGED days sitting immediately behind the current
   * streak — i.e. exactly the gap that is stopping it from running further back.
   *
   * Marking absence has to be a preemptive act today: nobody opens their trading journal
   * from a hotel to tick "I'm away". In practice it's remembered at the moment the streak
   * dies, so the app offers it there — excuse this run and the streak stitches back
   * together. The run stops at the first day with a real verdict, because a day you
   * recorded and failed is not something you get to excuse afterwards.
   *
   * Empty when the gap is longer than a single bulk write can cover: excusing only part of
   * it would leave the streak exactly as broken, so the offer is all-or-nothing rather
   * than a button that promises a repair it can't deliver. Longer gaps go through the
   * range dialog, which isn't tied to the streak.
   */
  streakBlockers: string[]
  /**
   * Avg discipline over the last 30 days, 0..1. A settled scheduled day you never filled in
   * counts as a ZERO — recording is part of the process, and excluding it made forgetting
   * cheaper than owning up. The denominator is `scheduledDays30`.
   */
  avgDiscipline30: number
  /** Of those scheduled days, how many carry a verdict — the coverage numerator. */
  loggedDays30: number
  /**
   * Settled scheduled days in the last 30, i.e. how many days you were *supposed* to log. `loggedDays30 / scheduledDays30` is logging coverage —
   * the honest companion to the discipline average, which is now computed over recorded
   * days only. Without it a 100% discipline score off two logged days would look like a
   * perfect month.
   */
  scheduledDays30: number
  todayStatus: DayStatus
  todaySoftDone: number
  todaySoftTotal: number
  todayHardViolations: number
  todayHardTotal: number
  trend: {
    date: string
    /**
     * Discipline for the day, 0..1. Never null: days with nothing scheduled are absent from
     * the series entirely, and a scheduled-but-unlogged day plots 0 — the same value the
     * 30-day figure gives it. See the note where the series is built.
     */
    ratio: number
    completed: number
    total: number
    status: DayStatus
    hardViolations: number
    cleanNoTrade: boolean
  }[]
  perRule: RuleStat[]
  // 0=Sun … 6=Sat. `samples` = in-scope scheduled days that fed the average (0 → no
  // data). `scheduled` = at least one live rule runs on this weekday.
  weekday: { dow: number; ratio: number; samples: number; scheduled: boolean }[]
  // Does discipline pay off? CONFIRMED trading days bucketed by their discipline status,
  // with the average daily net P&L and share of up days in each bucket.
  performance: {
    green: DisciplinePerf
    yellow: DisciplinePerf
    red: DisciplinePerf
    /**
     * Scored trading days left out because they were never reviewed. Surfaced so the
     * widget can say why its sample is thinner than the user's trade count, instead of
     * quietly under-reporting.
     */
    unconfirmedDays: number
  }
}

export interface DisciplinePerf {
  /** Trading days that landed in this discipline bucket. */
  days: number
  /** Average net P&L across those days. */
  avgPnl: number
  /** Share of those days that were net-positive, 0..1. */
  winRate: number
  /**
   * Average daily R-multiple across the days in this bucket that had a risked trade
   * (R = pnl / riskAmount, summed per day). null when no such day exists, so the UI
   * shows nothing rather than a misleading 0R.
   */
  avgR: number | null
}

// ─── Validation ─────────────────────────────────────────────────────────────────

/** Scope of an excused day. Optional on the wire — an omitted scope means the whole day. */
const awayScopeSchema = z.enum(['both', 'trading', 'habits']).default('both')

const ruleSchema = z.object({
  name: z.string().trim().min(1, t('validation.nameRequired')).max(RULE_NAME_MAX),
  description: z.string().trim().max(RULE_DESC_MAX).optional().nullable(),
  // Rule tier. Defaults to 'soft' so older callers keep working.
  type: z.enum(['hard', 'soft']).default('soft'),
  // Rule domain. Defaults to 'trading' so older callers keep working. Habits are
  // always 'soft' — the tier is coerced on write.
  category: z.enum(['trading', 'habit']).default('trading'),
  // ISO weekdays (1=Mon … 7=Sun); at least one, no duplicates. Defaults to every day.
  activeDays: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .max(7)
    .refine((d) => new Set(d).size === d.length, 'Duplicate weekdays')
    .default([...ALL_WEEKDAYS]),
})

/**
 * The day the rule's CURRENT schedule took over, or null if it never ran on a different one.
 * The check matters because pauses live in the same table, so a rule that was only paused and
 * resumed has boundaries without ever having changed schedule.
 */
function scheduleChangedSince(history: ScheduleSegment[] | undefined, current: number[]): string | null {
  if (!history?.length) return null
  const everDifferent = history.some((s) => s.days.length > 0 && !sameSchedule(s.days, sortDays(current)))
  return everDifferent ? history[history.length - 1].until : null
}

export const getRules = authedAction([], async ({ userId }): Promise<ProgressRule[]> => {
  // Archived (deleted) rules are kept in the DB for history but never listed.
  const [rows, schedules] = await Promise.all([
    db
      .select()
      .from(progressRules)
      .where(and(eq(progressRules.userId, userId), isNull(progressRules.archivedAt)))
      .orderBy(progressRules.sortOrder, progressRules.name),
    loadScheduleHistory(userId),
  ])
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    type: r.ruleType,
    category: r.category,
    sortOrder: r.sortOrder,
    active: r.active,
    activeDays: r.activeDays,
    scheduleSince: scheduleChangedSince(schedules.get(r.id), r.activeDays),
  }))
})

// ─── Rules: CRUD ──────────────────────────────────────────────────────────────

export const createRule = mutationAction(
  [ruleSchema],
  async ({ userId }, { name, description, type, category, activeDays }) => {
    const maxRow = await db
      .select({ m: sql<number>`coalesce(max(${progressRules.sortOrder}), -1)`.mapWith(Number) })
      .from(progressRules)
      .where(eq(progressRules.userId, userId))
    const nextOrder = (maxRow[0]?.m ?? -1) + 1

    const [rule] = await db
      .insert(progressRules)
      .values({
        userId,
        name,
        description: description || null,
        // Both domains use the tier: trading hard/soft, and for habits hard = an
        // avoidance ("No X") habit, soft = a building habit.
        ruleType: type,
        category,
        sortOrder: nextOrder,
        activeDays: sortDays(activeDays),
      })
      .returning()
    revalidatePath('/progress')
    return { success: true, rule }
  },
)

/**
 * Insert a starter set only if the user has no live rule in that domain yet — as ONE
 * statement, so it cannot race itself.
 *
 * The obvious shape (count, then insert) is two round-trips with a window between them, so
 * a double-click or a second tab could pass the guard twice and stack a duplicate set. It
 * can't be closed by wrapping the two calls: `runAtomic` takes a fixed list of statements,
 * because the neon-http driver has no interactive transactions — there is nowhere to put a
 * JS `if`. Even on the transaction path, splitting the rows across statements wouldn't work,
 * since a transaction sees its own writes and row 2's guard would find row 1.
 *
 * So the guard becomes part of the write: `INSERT … SELECT … WHERE NOT EXISTS`. Postgres
 * evaluates that subquery against the snapshot at statement start, so every row of the set
 * tests the same pre-insert state, and a concurrent duplicate call inserts nothing.
 * `.returning()` reports what actually landed rather than what we hoped would.
 */
async function insertStarterSet(
  userId: string,
  category: RuleCategory,
  rules: { name: string; ruleType: RuleType; activeDays: readonly number[] }[],
): Promise<number> {
  if (rules.length === 0) return 0

  /**
   * `ARRAY[$1, $2, …]::integer[]`, NOT `${array}`.
   *
   * Interpolating a JS array into a `sql` template emits a ROW constructor — `($1, $2, $3)`
   * — and `(1,2,3)::integer[]` is not a cast Postgres will make. It typechecks fine and
   * fails at runtime, which is exactly the sort of thing raw SQL hides; caught by printing
   * the built query rather than by trusting it.
   */
  const sqlIntArray = (nums: readonly number[]) =>
    sql`array[${sql.join(
      nums.map((n) => sql`${n}`),
      sql`, `,
    )}]::integer[]`

  // Rows as a VALUES list. Casts are explicit because a bare VALUES row is `text`/`unknown`
  // to Postgres and the target columns are enums / integer[].
  const values = sql.join(
    rules.map(
      (r, i) => sql`(
        ${userId}::text,
        ${r.name}::text,
        ${r.ruleType}::rule_type,
        ${category}::rule_category,
        (coalesce((select max(sort_order) from ${progressRules} where user_id = ${userId}), -1) + ${i + 1})::integer,
        ${sqlIntArray(r.activeDays)}
      )`,
    ),
    sql`, `,
  )

  const inserted = await db.execute<{ id: string }>(sql`
    insert into ${progressRules} (user_id, name, rule_type, category, sort_order, active_days)
    select * from (values ${values}) as v(user_id, name, rule_type, category, sort_order, active_days)
    where not exists (
      select 1 from ${progressRules}
      where user_id = ${userId} and category = ${category}::rule_category and archived_at is null
    )
    returning id
  `)
  return inserted.rows?.length ?? 0
}

// One-click starter set for a brand-new user: a few universal non-negotiables and
// quality habits, so the discipline page is useful before they've written any rules.
// Everything is editable/deletable afterwards.
export const createStarterRules = mutationAction([], async ({ userId }) => {
  const hard = tList('progress.stats.starterRules.hard')
  const soft = tList('progress.stats.starterRules.soft')
  const count = await insertStarterSet(
    userId,
    'trading',
    [
      ...hard.map((name) => ({ name, ruleType: 'hard' as const })),
      ...soft.map((name) => ({ name, ruleType: 'soft' as const })),
    ].map((r) => ({
      ...r,
      // Mon–Fri, not every day: a scheduled soft rule you never logged scores as a missed
      // process day, so a 7-day starter set would paint every weekend red out of the box.
      // The schedule is per-rule and editable, so weekend traders can widen it.
      activeDays: WEEKDAYS,
    })),
  )
  revalidatePath('/progress')
  return { success: true, count }
})

// What an EXISTING rule may change. The tier (`type`) and domain (`category`) are
// deliberately absent: a completion row carries no meaning of its own — it's read
// through the rule's tier (soft = "habit done", hard = "rule violated") and domain
// (trading rules score the day, habits never do). Flipping either would silently
// reinterpret every row ever logged and rewrite the user's history — a green year
// could turn red on one click. To change the tier, delete the rule (it's archived,
// so the days it governed keep their score) and create a new one alongside it.
const ruleUpdateSchema = ruleSchema.omit({ type: true, category: true })

/** Same weekdays in the same (canonical) order? */
const sameSchedule = (a: number[], b: number[]) => a.length === b.length && a.every((d, i) => d === b[i])

/**
 * What a rule EXPECTS of a day, as one value: its schedule, or nothing at all while paused.
 * Pausing and emptying the schedule are the same fact to every scorer, so the history only
 * ever has to record this one thing.
 */
const effectiveSchedule = (r: { activeDays: number[]; active: boolean }): number[] =>
  r.active ? sortDays(r.activeDays) : []

/**
 * Close off the schedule a rule has been running under, so the change starts TODAY and the
 * days behind it keep the schedule they were scored under. Called on every write that alters
 * what the rule expects — a schedule edit or a pause/resume. Three cases:
 *
 *   • nothing effectively changed → no row (a rename must not create a boundary between two
 *     identical schedules);
 *   • no segment for today → write one holding the OLD schedule, ending today;
 *   • a segment for today exists → a second edit today. It already holds the pre-today state,
 *     so it stays — unless the user landed back on exactly that schedule, in which case the
 *     boundary describes a change that no longer exists and is dropped.
 *
 * Callers must run this BEFORE updating the rule. There is no transaction to lean on (the
 * neon-http driver has no interactive ones, and this needs a read between writes), so the
 * order is what makes a partial failure harmless: a boundary without the update separates two
 * identical schedules, whereas an update without the boundary silently re-scores history.
 */
async function recordScheduleChange(
  userId: string,
  rule: { id: string; createdAt: Date },
  before: number[],
  after: number[],
  today: string,
  tz: string | null,
): Promise<void> {
  if (sameSchedule(before, after)) return
  // A rule created today has no past to protect, and the segment would cover no days.
  if (dayKeyInTz(rule.createdAt, tz) >= today) return
  const ruleId = rule.id

  const [existing] = await db
    .select({ id: progressRuleSchedules.id, days: progressRuleSchedules.activeDays })
    .from(progressRuleSchedules)
    // `userId` is redundant next to the rule id (the caller checks ownership) — defence in
    // depth, and free on the index.
    .where(
      and(
        eq(progressRuleSchedules.userId, userId),
        eq(progressRuleSchedules.ruleId, ruleId),
        eq(progressRuleSchedules.effectiveTo, today),
      ),
    )
    .limit(1)

  if (!existing) {
    await db
      .insert(progressRuleSchedules)
      .values({ userId, ruleId, effectiveTo: today, activeDays: before })
      .onConflictDoNothing({ target: [progressRuleSchedules.ruleId, progressRuleSchedules.effectiveTo] })
    return
  }
  if (sameSchedule(existing.days, after)) {
    await db
      .delete(progressRuleSchedules)
      .where(and(eq(progressRuleSchedules.id, existing.id), eq(progressRuleSchedules.userId, userId)))
  }
}

export const updateRule = mutationAction(
  [uuid, ruleUpdateSchema],
  async ({ userId }, id, { name, description, activeDays }) => {
    const { timezone } = await readGlobalSettings()
    // Archived rules are excluded here and in the update below: they're off the list but
    // still score the days they governed, so letting a stale client rewrite `activeDays`
    // would re-score history for a rule the user believes is gone.
    const previous = await db.query.progressRules.findFirst({
      where: and(eq(progressRules.id, id), eq(progressRules.userId, userId), isNull(progressRules.archivedAt)),
      columns: { id: true, activeDays: true, active: true, createdAt: true },
    })
    if (!previous) throw new NotFoundError(t('errors.rule.notFound'))

    // Close the old schedule first — see recordScheduleChange on why the order matters. A
    // PAUSED rule records nothing: it expected nothing either side of this edit, and the
    // boundary that matters is written when it resumes.
    await recordScheduleChange(
      userId,
      previous,
      effectiveSchedule(previous),
      effectiveSchedule({ activeDays, active: previous.active }),
      dayKeyInTz(new Date(), timezone),
      timezone,
    )

    const [rule] = await db
      .update(progressRules)
      .set({
        name,
        description: description || null,
        activeDays: sortDays(activeDays),
        updatedAt: new Date(),
      })
      .where(and(eq(progressRules.id, id), eq(progressRules.userId, userId), isNull(progressRules.archivedAt)))
      .returning()
    // No row matched — a stale client, or somebody else's id. Say so instead of
    // reporting a silent success the UI would render as "saved".
    if (!rule) throw new NotFoundError(t('errors.rule.notFound'))

    revalidatePath('/progress')
    return { success: true, rule }
  },
)

// Like updateRule, these report a miss instead of a silent success: a stale client (or
// somebody else's id) matching no row must not come back as "saved", or the optimistic UI
// keeps a state the database never took.
export const toggleRuleActive = mutationAction([uuid, z.boolean()], async ({ userId }, id, active) => {
  // Read the state first rather than deriving it from `active`: the call is idempotent, and
  // a client re-sending the state the rule is already in must not be recorded as a pause
  // that never happened.
  const { timezone } = await readGlobalSettings()
  const previous = await db.query.progressRules.findFirst({
    where: and(eq(progressRules.id, id), eq(progressRules.userId, userId)),
    columns: { id: true, activeDays: true, active: true, createdAt: true },
  })
  if (!previous) throw new NotFoundError(t('errors.rule.notFound'))

  // A pause is a stretch with nothing scheduled, recorded like any schedule change — that is
  // what stops a paused day counting as a miss once it is no longer today. Boundary first.
  await recordScheduleChange(
    userId,
    previous,
    effectiveSchedule(previous),
    effectiveSchedule({ activeDays: previous.activeDays, active }),
    dayKeyInTz(new Date(), timezone),
    timezone,
  )

  const [rule] = await db
    .update(progressRules)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(progressRules.id, id), eq(progressRules.userId, userId)))
    .returning({ id: progressRules.id })
  if (!rule) throw new NotFoundError(t('errors.rule.notFound'))
  revalidatePath('/progress')
  return { success: true }
})

export const deleteRule = mutationAction([uuid], async ({ userId }, id) => {
  // Soft-delete: archive instead of dropping the row, so the days this rule was
  // already in effect (and its completions) stay intact. It leaves the rules list
  // but still counts toward past days.
  const [rule] = await db
    .update(progressRules)
    .set({ archivedAt: new Date(), active: false, updatedAt: new Date() })
    .where(and(eq(progressRules.id, id), eq(progressRules.userId, userId), isNull(progressRules.archivedAt)))
    .returning({ id: progressRules.id })
  if (!rule) throw new NotFoundError(t('errors.rule.notFound'))
  revalidatePath('/progress')
  return { success: true }
})

export const reorderRules = mutationAction([uuidArray], async ({ userId }, orderedIds) => {
  if (orderedIds.length === 0) return { success: true }
  // One unit of work: a half-applied reorder would leave duplicate sort keys and the
  // list would shuffle itself on the next read. runAtomic picks a transaction or a
  // batch depending on the driver (see lib/db/atomic).
  await runAtomic((x) => {
    const [first, ...rest] = orderedIds.map((id, i) =>
      x
        .update(progressRules)
        .set({ sortOrder: i })
        .where(and(eq(progressRules.id, id), eq(progressRules.userId, userId))),
    )
    return [first, ...rest] as const // non-empty: guarded above
  })
  revalidatePath('/progress')
  return { success: true }
})

export const getDayProgress = authedAction([dateKey], async ({ userId }, day): Promise<DayProgress> => {
  const { timezone } = await readGlobalSettings()
  const today = dayKeyInTz(new Date(), timezone)

  const [ruleRows, completions, checkin, hasTrades, schedules] = await Promise.all([
    db
      .select()
      .from(progressRules)
      .where(eq(progressRules.userId, userId))
      .orderBy(progressRules.sortOrder, progressRules.name),
    db
      .select({ ruleId: ruleCompletions.ruleId })
      .from(ruleCompletions)
      .where(and(eq(ruleCompletions.userId, userId), eq(ruleCompletions.date, day))),
    db.query.dailyCheckins.findFirst({
      where: and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, day)),
    }),
    dayHasTrades(userId, timezone, day),
    loadScheduleHistory(userId),
  ])

  // The day panel is trading-only — habits live entirely in the Habits tab. Drop
  // habit rows here so they never appear in the day tracker or the day detail.
  const tradingRows = ruleRows.filter((r) => r.category !== 'habit')
  const tradingLifecycles = tradingRows.map(toLifecycle(timezone, schedules))
  const tradingIds = new Set(tradingRows.map((r) => r.id))
  // A logged row means: soft = habit done, hard = rule violated.
  const tradingLogged = new Set(completions.map((c) => c.ruleId).filter((id) => tradingIds.has(id)))
  const checkedIn = checkin?.checkedIn ?? false
  const hasLoggedRules = tradingLogged.size > 0
  // Marked away, and nothing showing you turned up for trading anyway → not measured.
  const awayFlag = checkin?.away ?? false
  const awayScope = checkin?.awayScope ?? 'both'
  // Excused for TRADING when the scope covers it and no TRADE contradicts it. Ticked rules
  // no longer cancel the excuse — see the note on tradingDayExcused.
  const away = tradingDayExcused({ away: awayFlag, scope: awayScope, hasTrades })
  const inScope =
    !away &&
    (dayInScope({ hasTrades, checkedIn, hasLoggedRules }) ||
      // A past day with scheduled soft rules you neither logged nor marked no-trade
      // is a missed process day → in scope (scores red), not grey.
      (!checkedIn && hasUnmetSoftObligation(day, today, tradingLifecycles)))
  // A check-in only counts as a no-trade clean day while the day has no trades;
  // adding a trade later auto-negates it (hasTrades wins), with no DB write needed.
  const cleanNoTrade = isCleanNoTrade(checkedIn, hasTrades)
  const confirmed = dayConfirmed({ checkedIn, hasLoggedRules })
  const score = computeDayScore(day, today, tradingLifecycles, tradingLogged, inScope, cleanNoTrade, confirmed)

  // Show the trading rules that were in effect on this specific day (not today's
  // set), preserving sort order. `completed` is the good state (see DayRule).
  const inEffect = ruleIdsInEffectOn(day, today, tradingLifecycles)
  const dayRules: DayRule[] = tradingRows
    .filter((r) => inEffect.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.ruleType,
      category: r.category,
      completed: r.ruleType === 'hard' ? !tradingLogged.has(r.id) : tradingLogged.has(r.id),
    }))

  return {
    date: day,
    note: checkin?.note ?? '',
    checkedIn,
    hasTrades,
    away,
    awayFlag,
    awayScope,
    isToday: day === today,
    withinHistory: dayWithinHistory(day, today),
    confirmed,
    // Today holds at pending rather than failing; a broken hard rule is definitive and
    // reddens it anyway.
    status: resolveTodayStatus(score.status, dayIsOpen(day, today), score.hardViolations > 0),
    rules: dayRules,
    hardTotal: score.hardTotal,
    hardViolations: score.hardViolations,
    softTotal: score.softTotal,
    softDone: score.softDone,
    completedCount: score.softDone,
    totalCount: score.softTotal,
    anyRules: tradingRows.some((r) => r.archivedAt === null),
  }
})

export const toggleRuleCompletion = mutationAction(
  [uuid, dateKey, z.boolean()],
  // `completed` is the *good* state the caller wants: soft = habit done, hard =
  // rule respected. A DB row always represents the logged event (soft = done,
  // hard = violation), so for hard rules we invert: respected means "no row".
  //
  // Past days are editable (back-fill a day you forgot to log); only the future is
  // off-limits. The rule must actually have been in effect on that day.
  async ({ userId }, ruleId, day, completed) => {
    const { timezone } = await readGlobalSettings()
    const today = dayKeyInTz(new Date(), timezone)
    if (day > today) {
      throw new ValidationError(t('errors.rule.future'))
    }

    const [rule, schedules] = await Promise.all([
      db.query.progressRules.findFirst({
        where: and(eq(progressRules.id, ruleId), eq(progressRules.userId, userId)),
        columns: { id: true, activeDays: true, ruleType: true, createdAt: true, archivedAt: true, active: true },
      }),
      loadScheduleHistory(userId),
    ])
    if (!rule) throw new NotFoundError(t('errors.rule.notFound'))
    // The schedule as it stood THAT day decides whether the tick is allowed: back-filling a
    // Saturday you used to train on can't be refused because the habit has since moved.
    const life = toLifecycle(timezone, schedules)(rule)
    if (!ruleInEffectOn(day, today, life)) {
      throw new ValidationError(t('errors.rule.notScheduled'))
    }

    const rowShouldExist = rule.ruleType === 'hard' ? !completed : completed
    if (rowShouldExist) {
      await db
        .insert(ruleCompletions)
        .values({ userId, ruleId, date: day })
        .onConflictDoNothing({ target: [ruleCompletions.ruleId, ruleCompletions.date] })
    } else {
      await db
        .delete(ruleCompletions)
        .where(
          and(eq(ruleCompletions.userId, userId), eq(ruleCompletions.ruleId, ruleId), eq(ruleCompletions.date, day)),
        )
    }
    revalidatePath('/progress')
    revalidatePath(`/progress/${day}`)
    return { success: true }
  },
)

// Mark every SOFT habit in effect on `day` as done in one shot (the "mark all
// done" shortcut on a trading day). Hard rules are untouched — bulk-flagging a
// day as "all respected" is the default anyway, and we never want a single click
// to mass-log hard violations. Idempotent: already-done habits are left as-is.
export const markAllSoftDone = mutationAction([dateKey], async ({ userId }, day) => {
  const { timezone } = await readGlobalSettings()
  const today = dayKeyInTz(new Date(), timezone)
  if (day > today) {
    throw new ValidationError(t('errors.rule.future'))
  }

  const ruleRows = await db
    .select({
      id: progressRules.id,
      ruleType: progressRules.ruleType,
      category: progressRules.category,
      createdAt: progressRules.createdAt,
      archivedAt: progressRules.archivedAt,
      active: progressRules.active,
      activeDays: progressRules.activeDays,
    })
    .from(progressRules)
    .where(eq(progressRules.userId, userId))

  const toLife = toLifecycle(timezone, await loadScheduleHistory(userId))
  // Trading-only: the shortcut lives on the trading day panel and must never
  // mass-tick general habits as a side effect.
  const softInEffect = ruleRows.filter(
    (r) => r.ruleType === 'soft' && r.category === 'trading' && ruleInEffectOn(day, today, toLife(r)),
  )
  if (softInEffect.length === 0) return { success: true, count: 0 }

  await db
    .insert(ruleCompletions)
    .values(softInEffect.map((r) => ({ userId, ruleId: r.id, date: day })))
    .onConflictDoNothing({ target: [ruleCompletions.ruleId, ruleCompletions.date] })

  revalidatePath('/progress')
  revalidatePath(`/progress/${day}`)
  return { success: true, count: softInEffect.length }
})

/**
 * Ceiling for a daily review, in characters of HTML.
 *
 * The editor stores rich text, and when object storage isn't configured (local dev,
 * a self-host without R2) a pasted screenshot is inlined as a base64 data URL. Those
 * are downscaled to 1280px / q0.82 first, so one runs roughly 200–500 KB of markup —
 * 1 MB comfortably holds a long written review plus a couple of inline charts, while
 * still keeping a single row (and the autosave payload) sane. Beyond that the note is
 * REJECTED rather than truncated: cutting HTML mid-tag corrupts the note the user
 * just wrote, and doing it silently is worse than an error they can act on.
 */
const NOTE_MAX = 1_000_000

export const getDailyNote = authedAction([dateKey], async ({ userId }, day): Promise<string> => {
  const row = await db.query.dailyCheckins.findFirst({
    where: and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, day)),
    columns: { note: true },
  })
  return row?.note ?? ''
})

const dayNoteSchema = z.string().max(NOTE_MAX, t('validation.noteTooLong')).transform(sanitizeRichTextValue)

export const setDayNote = mutationAction([dateKey, dayNoteSchema], async ({ userId }, day, note) => {
  await db
    .insert(dailyCheckins)
    .values({ userId, date: day, note })
    .onConflictDoUpdate({
      target: [dailyCheckins.userId, dailyCheckins.date],
      set: { note, updatedAt: new Date() },
    })
  revalidatePath('/progress')
  revalidatePath(`/progress/${day}`)
  return { success: true }
})

// Explicitly mark (or unmark) a day as REVIEWED. Two jobs (see dailyCheckins.checkedIn):
// it puts an otherwise trade-less day into scope so a disciplined "no-trade" day can
// still score, and it CONFIRMS a day whose rule set gave the user nothing to tick — the
// all-constraints case — so it can count as evidence in the payoff widget.
export const setDayCheckedIn = mutationAction([dateKey, z.boolean()], async ({ userId }, day, checkedIn) => {
  // Past days can be checked in retroactively (mark a disciplined no-trade day you
  // forgot); only the future is disallowed.
  if (day > (await todayKey())) {
    throw new ValidationError(t('errors.rule.future'))
  }
  await db
    .insert(dailyCheckins)
    .values({ userId, date: day, checkedIn })
    .onConflictDoUpdate({
      target: [dailyCheckins.userId, dailyCheckins.date],
      set: { checkedIn, updatedAt: new Date() },
    })
  revalidatePath('/progress')
  revalidatePath(`/progress/${day}`)
  return { success: true }
})

// Mark (or unmark) a day as AWAY — holiday, illness, a public holiday. The day stops
// being measured entirely: grey on both heatmaps, out of every average, and skipped by
// the streaks so a week off doesn't reset a hundred-day run. Marking away also clears the
// review flag, because "I wasn't here" and "I reviewed my trading" are contradictory
// claims; the day's logged rule rows are left untouched so unmarking restores them.
//
// Future days are allowed on purpose: planning next week's holiday in advance is the
// natural way to use this, and a future day is out of scope for scoring anyway.
// Excusing a day the rolling stats can't see would change nothing anyone could observe,
// so it's refused rather than silently accepted. The pickers clamp to the same horizon;
// this is the server-side backstop.
async function assertWithinHistory(days: string[]): Promise<void> {
  const today = await todayKey()
  if (days.some((d) => !dayWithinHistory(d, today))) {
    throw new ValidationError(t('errors.rule.tooOld', { days: HISTORY_WINDOW_DAYS }))
  }
}

export const setDayAway = mutationAction(
  [dateKey, z.boolean(), awayScopeSchema],
  async ({ userId }, day, away, scope) => {
    await assertWithinHistory([day])
    await db
      .insert(dailyCheckins)
      .values({ userId, date: day, away, awayScope: scope })
      .onConflictDoUpdate({
        target: [dailyCheckins.userId, dailyCheckins.date],
        // ONLY the away flag. This used to also force `checkedIn: false`, on the reasoning
        // that "I wasn't here" and "I reviewed my trading" are contradictory claims — but the
        // flag is shared by both tabs, so marking a holiday from the Daily tab silently
        // destroyed the trading review of that day, dropping it out of the payoff sample.
        // And it was destructive: un-marking couldn't put it back.
        //
        // The contradiction resolves itself anyway. `dayIsAway` self-negates on evidence you
        // turned up, per domain, so an away day you did review simply isn't away for trading.
        // No write needed to express that, and nothing of the user's is thrown away.
        // The scope is only meaningful while the flag is on, but it is written either way:
        // keeping the last choice means re-excusing the same day doesn't silently widen a
        // "trading only" excuse back to the whole day.
        set: { away, awayScope: scope, updatedAt: new Date() },
      })
    revalidatePath('/progress')
    revalidatePath(`/progress/${day}`)
    return { success: true }
  },
)

// Excuse several days at once. Marking absence a day at a time is the reason nobody does
// it: a week away is fourteen clicks, and by then the streak is already gone. This backs
// the "those days broke your streak — don't count them" prompt, and any future range
// picker. One statement, so a half-applied excuse can't leave a streak that repairs
// itself only partway.
export const setDaysAway = mutationAction(
  [z.array(dateKey).min(1).max(AWAY_BULK_MAX), z.boolean(), awayScopeSchema],
  async ({ userId }, days, away, scope) => {
    const unique = [...new Set(days)].sort()
    await assertWithinHistory(unique)

    // A trade overrides a TRADING excuse (see tradingDayExcused), so marking a traded day
    // off "for trading" would report a success the user can never see. Days like that are
    // filtered out and reported back as skipped.
    //
    // Only when the excuse is trading-ONLY, though. This filter predates AwayScope and used
    // to drop traded days from every bulk write, which — once scopes existed — silently
    // threw away the half that still applied: excuse a week as "Daily only" and any day you
    // happened to trade on lost its habit excuse too, with the result reported as "you
    // traded on all of those days, nothing to excuse" for an action that had nothing to do
    // with trading. A `both` excuse keeps its habits half for the same reason.
    //
    // And only when MARKING — clearing the flag is meaningful on any day.
    let targets = unique
    let skipped = 0
    if (away && scope === 'trading') {
      const { timezone } = await readGlobalSettings()
      const tradeDays = await tradeDayKeys(userId, timezone, unique[0], unique[unique.length - 1])
      targets = unique.filter((d) => !tradeDays.has(d))
      skipped = unique.length - targets.length
    }
    if (targets.length === 0) return { success: true, count: 0, skipped }

    await db
      .insert(dailyCheckins)
      .values(targets.map((date) => ({ userId, date, away, awayScope: scope })))
      .onConflictDoUpdate({
        target: [dailyCheckins.userId, dailyCheckins.date],
        // Away + scope only — never clears the review flag. See setDayAway for why.
        set: { away, awayScope: scope, updatedAt: new Date() },
      })
    revalidatePath('/progress')
    for (const day of targets) revalidatePath(`/progress/${day}`)
    return { success: true, count: targets.length, skipped }
  },
)

// Days on which soft rules were scheduled must be scored even with no activity: a past
// day is a miss (→ red), today is in progress (→ pending). Add them to the set of dates
// the heatmap iterates. The future never counts.
function addScheduledSoftDays(
  dates: Set<string>,
  rangeStart: string,
  rangeEnd: string,
  today: string,
  lifecycles: RuleLifecycle[],
): void {
  const end = rangeEnd < today ? rangeEnd : today
  for (let d = rangeStart; d <= end; d = shiftDay(d, 1)) {
    if (expectedSoftRulesOn(d, today, lifecycles) > 0) dates.add(d)
  }
}

// Build one calendar cell as a two-tier day score. `byDate` holds logged rows
// (soft = done, hard = violated); a day is in scope when it traded, was checked
// in, or has any logged rule.
function buildCell(
  date: string,
  today: string,
  lifecycles: RuleLifecycle[],
  byDate: Map<string, Set<string>>,
  noteSet: Set<string>,
  checkedInSet: Set<string>,
  tradeDays: Set<string>,
  awaySet: Set<string>,
): ProgressCalendarCell {
  const logged = byDate.get(date) ?? new Set<string>()
  // `awaySet` is already scope-filtered for trading; a trade is the only thing left that
  // beats the flag.
  const away = awaySet.has(date) && !tradeDays.has(date)
  const inScope =
    !away &&
    (dayInScope({
      hasTrades: tradeDays.has(date),
      checkedIn: checkedInSet.has(date),
      hasLoggedRules: logged.size > 0,
    }) ||
      // A past day with scheduled soft rules, not logged and not a no-trade check-in,
      // is a missed process day → scored red instead of grey.
      (!checkedInSet.has(date) && hasUnmetSoftObligation(date, today, lifecycles)))
  const cleanNoTrade = isCleanNoTrade(checkedInSet.has(date), tradeDays.has(date))
  const confirmed = dayConfirmed({ checkedIn: checkedInSet.has(date), hasLoggedRules: logged.size > 0 })
  const score = computeDayScore(date, today, lifecycles, logged, inScope, cleanNoTrade, confirmed)
  return {
    date,
    // Today shows pending; a broken hard rule stays red.
    status: resolveTodayStatus(score.status, dayIsOpen(date, today), score.hardViolations > 0),
    cleanNoTrade,
    away,
    hardTotal: score.hardTotal,
    hardViolations: score.hardViolations,
    softTotal: score.softTotal,
    softDone: score.softDone,
    ratio: score.softRatio,
    hasNote: noteSet.has(date),
  }
}

export const getProgressStats = authedAction([], async ({ userId }): Promise<ProgressStats> => {
  const { timezone } = await readGlobalSettings()
  const today = dayKeyInTz(new Date(), timezone)

  const windowStart = shiftDay(today, -HISTORY_WINDOW_DAYS)
  // Trade P&L rows over the window (±1 day padding so tz offsets never clip a boundary
  // day), used to bucket each trading day's net P&L by discipline status below.
  const pnlFromUtc = new Date(`${shiftDay(windowStart, -1)}T00:00:00.000Z`)
  const pnlToUtc = new Date(`${shiftDay(today, 2)}T00:00:00.000Z`)
  const [ruleRows, completions, checkins, tradePnlRows, schedules] = await Promise.all([
    db
      .select()
      .from(progressRules)
      .where(eq(progressRules.userId, userId))
      .orderBy(progressRules.sortOrder, progressRules.name),
    db
      .select({ ruleId: ruleCompletions.ruleId, date: ruleCompletions.date })
      .from(ruleCompletions)
      .where(and(eq(ruleCompletions.userId, userId), gte(ruleCompletions.date, windowStart))),
    db
      .select({
        date: dailyCheckins.date,
        checkedIn: dailyCheckins.checkedIn,
        away: dailyCheckins.away,
        awayScope: dailyCheckins.awayScope,
      })
      .from(dailyCheckins)
      .where(and(eq(dailyCheckins.userId, userId), gte(dailyCheckins.date, windowStart))),
    db
      .select({ e: trades.entryDatetime, p: trades.netPnl, risk: trades.riskAmount })
      .from(trades)
      .where(and(eq(trades.userId, userId), gte(trades.entryDatetime, pnlFromUtc), lt(trades.entryDatetime, pnlToUtc))),
    loadScheduleHistory(userId),
  ])

  // Net P&L per calendar day (user tz), plus per-day R-multiple summed over trades
  // that actually carry a risk (R = pnl / riskAmount) — the same convention the
  // calendar uses. Days with no risked trade have no R and are tracked separately so
  // an unrisked day never drags the R average toward 0.
  //
  // `tradeDays` is derived from the SAME rows rather than from a second tradeDayKeys()
  // call: that query scanned the identical (padded) window and returned the identical
  // set, so a year of trades was being read twice per request to answer "which days had
  // a trade" and "what did those days make". The day keys are still computed in JS —
  // `timezone` is an unvalidated cookie that may be null, so pushing AT TIME ZONE into
  // SQL would trade a scan for an injection surface and a silent semantic change.
  const dayPnl = new Map<string, number>()
  const dayR = new Map<string, number>()
  const tradeDays = new Set<string>()
  for (const r of tradePnlRows) {
    if (!r.e) continue
    const key = dayKeyInTz(r.e, timezone)
    tradeDays.add(key)
    const pnl = Number(r.p ?? 0)
    dayPnl.set(key, (dayPnl.get(key) ?? 0) + pnl)
    const risk = Number(r.risk ?? 0)
    if (risk > 0) dayR.set(key, (dayR.get(key) ?? 0) + pnl / risk)
  }

  // Every stat below (day status, streaks, trend, weekday, PnL correlation) is
  // trading-only. Habits have their own stats action (getHabitsReview).
  const { trading: tradingRows, lifecycles, byDate } = tradingScoringView(ruleRows, completions, timezone, schedules)
  const liveRules = tradingRows.filter((r) => r.archivedAt === null) // listed rules → per-rule breakdown
  const checkedInSet = new Set(checkins.filter((c) => c.checkedIn).map((c) => c.date))
  const awaySet = excusedDays(checkins, 'trading')
  // Away, unless a trade contradicts it → not measured. One predicate, used by every
  // scorer below including the streak walk, which used to compute its own slightly
  // different version and disagree with the heatmap about the same day.
  const awayOn = (date: string) => awaySet.has(date) && !tradeDays.has(date)
  // Did the user engage with the day, or does it just exist because trades landed in it?
  // Gates the P&L correlation only — never the colour. See dayConfirmed.
  const confirmedOn = (date: string) =>
    dayConfirmed({ checkedIn: checkedInSet.has(date), hasLoggedRules: (byDate.get(date)?.size ?? 0) > 0 })

  const inScopeOf = (date: string) =>
    !awayOn(date) &&
    (dayInScope({
      hasTrades: tradeDays.has(date),
      checkedIn: checkedInSet.has(date),
      hasLoggedRules: (byDate.get(date)?.size ?? 0) > 0,
    }) ||
      // A past day with scheduled soft rules, not logged and not a no-trade check-in,
      // is a missed process day → in scope (scores red), consistent with the heatmap.
      (!checkedInSet.has(date) && hasUnmetSoftObligation(date, today, lifecycles)))
  // Explicit no-trade check-in day: soft tallies are not applicable and are dropped
  // from every soft-based widget below (per-rule soft, discipline avg, weekday avg).
  const cleanNoTradeOn = (date: string) => isCleanNoTrade(checkedInSet.has(date), tradeDays.has(date))
  // Two-tier score for a single day (soft rows = done, hard rows = violated).
  // Memoized: the stats below re-score the same dates several times (streak scan,
  // green-days, best-streak, trend, weekday), each pass iterating every rule.
  const scoreCache = new Map<string, ReturnType<typeof computeDayScore>>()
  const scoreOf = (date: string) => {
    const hit = scoreCache.get(date)
    if (hit) return hit
    const s = computeDayScore(
      date,
      today,
      lifecycles,
      byDate.get(date) ?? new Set<string>(),
      inScopeOf(date),
      cleanNoTradeOn(date),
      confirmedOn(date),
    )
    scoreCache.set(date, s)
    return s
  }

  // — Clean streak: consecutive GREEN *scheduled* days. A day on which no rule was
  //   in effect (weekends outside a rule's activeDays, or before any rule existed) — or
  //   that you marked AWAY — is NEUTRAL: it's skipped, so it neither extends nor breaks
  //   the run. Among the days that did expect a rule, a yellow, a red, or a no-record day
  //   breaks it. Today gets grace while it runs. This stops an
  //   ordinary day off, or a week's holiday, from silently resetting the streak. —
  // An open day's soft incompleteness reads as pending (not a broken streak); a
  // definitive hard violation still colours through. The helpers skip pending as grace.
  const statusOf = (date: string) => {
    const s = scoreOf(date)
    return resolveTodayStatus(s.status, dayIsOpen(date, today), s.hardViolations > 0)
  }
  const scheduledOn = (date: string) => expectedRulesOn(date, today, lifecycles) > 0 && !awayOn(date)

  // Current clean streak: walk back up to a year; the pure helper skips unscheduled
  // days and grants today grace while it's unlogged.
  const daysNewestFirst = [...Array(HISTORY_WINDOW_DAYS + 1)].map((_, i) => shiftDay(today, -i))
  const currentStreak = currentCleanStreak(daysNewestFirst, statusOf, scheduledOn)

  // Walk back the same way the streak helper does — skipping unscheduled/excused days and
  // gracing open ones — past the streak's green run, then collect the unlogged days that
  // immediately follow it. Those are the ones worth offering to excuse; anything with a
  // verdict ends the walk.
  //
  // The offer is all-or-nothing. Excusing only part of the gap leaves the streak exactly
  // as broken as it was, so a partial offer would be a button that promises "the streak
  // carries over" and then doesn't. Collect one past the write limit and, if the run
  // doesn't fit, offer nothing at all — a dormant account with six months of gap has no
  // business being shown a one-click repair anyway.
  const streakBlockers: string[] = []
  let blockerOverflow = false
  // Is there a clean run sitting BEHIND the gap — something for the repair to reconnect
  // to? Without this the offer fired for anyone whose scheduled days were simply never
  // filled in, including a user a week into the app who has no streak to rescue. The copy
  // promises "the streak carries over"; if there is nothing on the far side of the gap,
  // that promise is empty and the prompt is just a nag about days they never logged.
  let runBehindGap = false
  for (let i = 0, greens = 0; i < daysNewestFirst.length; i++) {
    if (streakBlockers.length > AWAY_BULK_MAX) {
      blockerOverflow = true
      break
    }
    const date = daysNewestFirst[i]
    if (!scheduledOn(date)) continue
    const status = statusOf(date)
    if (status === 'pending') continue // still open — nothing to excuse yet
    if (status === 'green') {
      // A green PAST the gap is the run we'd be reconnecting to — record it and stop.
      if (streakBlockers.length > 0) {
        runBehindGap = true
        break
      }
      greens += 1
      if (greens > currentStreak) break
      continue
    }
    if (status === 'unlogged') {
      // An unlogged day you TRADED on can't be excused (trades beat the flag — see
      // tradingDayExcused), so it will keep breaking the streak whatever else is excused around
      // it. That makes the whole offer pointless, not just this day.
      if (tradeDays.has(date)) {
        blockerOverflow = true
        break
      }
      streakBlockers.push(date)
      continue
    }
    break // yellow / red / none — a recorded day, or nothing to measure
  }
  // Unfixable in one write, contains a day that can't be excused at all, or has nothing
  // behind it to reconnect to → don't offer a repair that wouldn't repair anything.
  if (blockerOverflow || !runBehindGap) streakBlockers.length = 0

  // NB: the "clean days" and "best streak" cards are year-scoped and come from
  // getProgressYear (see the ProgressStats doc comment) — they are intentionally not
  // recomputed here.

  // A day's discipline score (trade-quality): a broken hard rule zeroes it, a day
  // with no soft habits scheduled is a full 1.0, otherwise it's the share of soft
  // habits done. No-trade check-in days are excluded from the averages entirely (see
  // the loops below), so they don't need special-casing here.
  const disciplineOf = (date: string) => {
    const s = scoreOf(date)
    if (s.status === 'none') return 0 // out of scope OR no rule in effect → not measured
    if (s.hardViolations > 0) return 0
    if (s.cleanNoTrade) return 1 // clean sat-out day plots as disciplined (excluded from the averages)
    if (s.softTotal === 0) return 1
    return s.softRatio
  }

  /**
   * Does this day carry a real verdict? Only such days may feed a rate or an average.
   * `unlogged` is the important exclusion: it has no data, so folding it in as a 0 would
   * be measuring how often the app was opened and calling it discipline.
   */
  const isScoredOn = (date: string) => {
    const status = statusOf(date)
    return status === 'green' || status === 'yellow' || status === 'red'
  }

  // Headline 30-day AVERAGE — always the full rolling window.
  //
  // A settled scheduled day you never filled in counts as a ZERO here. It used to be
  // excluded, on the reasoning that absence of data isn't a score — which is true, and is
  // still how every DIAGNOSTIC below treats it (per-rule rates, weekday bars, payoff
  // buckets: see isScoredOn). But it made the headline reward silence: log a day you fell
  // short and the number drops; forget the same day and it doesn't. For a product whose
  // whole claim is honesty over feelings, the cheapest path must not be saying nothing.
  //
  // Recording IS part of the process, so the headline scores it. The diagnostics keep to
  // recorded days because their job is different — "which weekday do I slip?" must not
  // quietly become "which weekday do I forget to log?".
  //
  // Still excluded from both: unscheduled days, no-trade check-ins (not applicable), away
  // days (`scheduledOn` already drops them) and today until it's either logged or over.
  let sumRatio = 0
  let loggedDays30 = 0
  let scheduledDays30 = 0
  for (let i = 29; i >= 0; i--) {
    const date = shiftDay(today, -i)
    if (!scheduledOn(date) || cleanNoTradeOn(date)) continue
    // Today isn't overdue yet, so it doesn't count against you — UNLESS you already logged
    // it, in which case it belongs in the denominator too, or a finished today would read
    // as "1 of 0 days logged".
    const scored = isScoredOn(date)
    if (dayIsOpen(date, today) && !scored) continue
    scheduledDays30 += 1
    if (scored) {
      sumRatio += disciplineOf(date)
      loggedDays30 += 1
    }
    // …an unlogged settled day adds nothing to `sumRatio` — i.e. it scores 0.
  }
  // Denominator is every day you were SUPPOSED to log, not just the ones you did.
  // `loggedDays30 / scheduledDays30` is still reported as the coverage line, so the card
  // can say how much of the number is real recording and how much is silence.
  const avgDiscipline30 = scheduledDays30 ? sumRatio / scheduledDays30 : 0

  // The trend LINE uses an EXPANDING window: from the first day any rule existed up to
  // today, capped at 30 days. A brand-new user sees their first day at the left growing
  // rightward, not a lone point pinned to the right of 29 empty days; once 30 days of
  // history exist it's the rolling last-30 window. A day with nothing scheduled — or one
  // you never filled in — charts null (a bridged gap), because neither is a measurement.
  // Only a day with a real verdict plots a point.
  const firstRuleDay = lifecycles.reduce<string>((m, l) => (l.createdDay < m ? l.createdDay : m), today)
  const rollStart = shiftDay(today, -29)
  const trendStart = firstRuleDay > rollStart ? firstRuleDay : rollStart
  // Two kinds of "empty day", and they are NOT the same thing — the line used to plot both
  // as null and got the worst of both:
  //
  //   nothing SCHEDULED (a weekend outside the rule, an away day) — nothing was expected,
  //     so it isn't a measurement at all. Dropped from the series entirely, the way a price
  //     chart skips non-session days. Keeping it as a null left a hole the line couldn't
  //     bridge at the very start or end of the window, so the chart simply stopped drawing
  //     there, and the tooltip had nothing to show mid-series.
  //
  //   scheduled but NOT LOGGED — you were supposed to record it and didn't. That now scores
  //     ZERO, exactly as it does in the 30-day figure this chart sits under (see
  //     avgDiscipline30). Bridging it would have drawn a flat line over the dips the
  //     headline number is made of, so the two widgets would describe the same 30 days
  //     differently. The tooltip still says "not logged" rather than "0%", because the
  //     reason matters even when the score doesn't.
  //
  // Net effect: no nulls in the series, so no gaps, no unbridgeable edges, and a tooltip on
  // every point.
  const trend: ProgressStats['trend'] = []
  for (let date = trendStart; date <= today; date = shiftDay(date, 1)) {
    if (!scheduledOn(date)) continue
    const s = scoreOf(date)
    trend.push({
      date,
      ratio: isScoredOn(date) ? disciplineOf(date) : 0,
      completed: s.softDone,
      total: s.softTotal,
      status: statusOf(date),
      hardViolations: s.hardViolations,
      cleanNoTrade: s.cleanNoTrade,
    })
  }

  // Per-rule consistency is measured only over TRACKED days — days that carry a verdict
  // AND on which the rule was in effect. This keeps hard and soft symmetric: both are
  // "of the days you actually recorded, how often did you comply?" (soft = habit done,
  // hard = rule respected). Days you never filled in are not tracked days: counting them
  // would make every soft rule's rate a measure of how often you opened the app, and the
  // list already knows how to say "no tracked days yet" instead of a phantom 0%.
  const last30 = [...Array(30)].map((_, i) => shiftDay(today, -i)).filter(isScoredOn)
  const lifeById = new Map(lifecycles.map((l) => [l.id, l]))
  const perRule: RuleStat[] = liveRules
    .map((r): RuleStat => {
      const life = lifeById.get(r.id)
      const isHard = r.ruleType === 'hard'
      let tracked = 0
      let good = 0
      for (const date of last30) {
        if (life && !ruleInEffectOn(date, today, life)) continue
        const logged = byDate.get(date)?.has(r.id) ?? false
        if (isHard) {
          // Respect rate over every active day — you can respect a hard rule ("no
          // revenge trading") on a no-trade day too, so those days count.
          tracked += 1
          if (!logged) good += 1
        } else {
          // Soft habits: a no-trade CHECK-IN day is not applicable and is dropped
          // entirely (even if some were ticked), to avoid a half-ticked day skewing
          // the rate. Every other in-scope day (incl. a no-trade day you didn't
          // check in) scores normally.
          if (cleanNoTradeOn(date)) continue
          tracked += 1
          if (logged) good += 1
        }
      }
      // Current compliance streak, mirroring the per-habit flame.
      //
      // Note this deliberately does NOT reuse the rate's tracked-day set: the rate is
      // computed over days that carry a verdict, because an unlogged day is no evidence of
      // compliance. A STREAK is a different claim — it asserts an unbroken run — so an
      // unlogged day has to be visible to it and break it, exactly as it breaks the clean
      // streak on the card above. Skipping it would let a constraint's flame grow through
      // a fortnight the user never opened the app for.
      //
      // Still skipped as neutral: days the rule wasn't in effect, days marked away, and —
      // for tasks only — a no-trade check-in, where the rule doesn't apply.
      const ruleScheduledOn = (date: string) =>
        (life ? ruleInEffectOn(date, today, life) : false) && !awayOn(date) && (isHard || !cleanNoTradeOn(date))
      const ruleGoodOn = (date: string) => {
        const logged = byDate.get(date)?.has(r.id) ?? false
        return isHard ? !logged : logged
      }
      const ruleDayStatus = (date: string) =>
        ruleStreakDayStatus({
          isHard,
          good: ruleGoodOn(date),
          isToday: date === today,
          dayLogged: isScoredOn(date),
        })
      const streak = currentCleanStreak(daysNewestFirst, ruleDayStatus, ruleScheduledOn)
      return {
        id: r.id,
        name: r.name,
        type: r.ruleType,
        completed: good,
        tracked,
        rate: tracked > 0 ? good / tracked : 0,
        streak,
      }
    })
    // Rules with no tracked days yet sink to the bottom (they carry no signal);
    // among the rest, most consistent first (ties broken by name for stability).
    .sort((a, b) => Number(b.tracked > 0) - Number(a.tracked > 0) || b.rate - a.rate || a.name.localeCompare(b.name))

  // By-weekday average over the last 12 weeks, counting only SCHEDULED, non-check-in days
  // that carry a verdict. Empty days off no longer sit in the denominator as 0% and
  // flatten the bars — a weekday you never trade simply has fewer samples. Days you never
  // filled in are excluded for the same reason, and it matters most here: including them
  // would turn "which weekday do I slip?" into "which weekday do I forget to log?".
  const wdSum = new Array(7).fill(0)
  const wdCount = new Array(7).fill(0)
  for (let i = 0; i < 84; i++) {
    const date = shiftDay(today, -i)
    if (!scheduledOn(date) || cleanNoTradeOn(date) || !isScoredOn(date)) continue
    const [y, m, d] = date.split('-').map(Number)
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    wdSum[dow] += disciplineOf(date)
    wdCount[dow] += 1
  }
  // Which weekdays the rules schedule (ISO 1=Mon…7=Sun) — separates "scheduled, no samples
  // yet" from "nothing runs this weekday". Read over the same 84 days the bars cover.
  const scheduledWeekdays = scheduledWeekdaysOf(liveRules.map(toLifecycle(timezone, schedules)), shiftDay(today, -84))
  const weekday = wdSum.map((s, dow) => ({
    dow,
    ratio: wdCount[dow] ? s / wdCount[dow] : 0,
    samples: wdCount[dow],
    // dow is 0=Sun…6=Sat; activeDays is ISO 1=Mon…7=Sun (Sun = 7).
    scheduled: scheduledWeekdays.has(dow === 0 ? 7 : dow),
  }))

  // Discipline → performance: bucket each TRADING day by its status and aggregate the
  // payoff (avg P&L, win-rate, avg R). Pure + unit-tested; days with no rule in effect
  // ('none') are excluded inside the helper, so this stays the on-plan-vs-off-plan view.
  // Uses `statusOf` (NOT the raw score): an open day is still in progress, so it arrives
  // as 'pending' and is dropped — otherwise a day whose habits simply aren't ticked yet
  // lands in the red bucket and drags the headline number down until the evening. And
  // `confirmedOn` keeps never-reviewed days out entirely: a default-satisfied constraint
  // must not get to vote on its own payoff.
  const performance = bucketDayPerformance(dayPnl, dayR, statusOf, confirmedOn)

  const todayScore = scoreOf(today)
  return {
    activeRules: expectedRulesOn(today, today, lifecycles),
    currentStreak,
    streakBlockers,
    avgDiscipline30,
    loggedDays30,
    scheduledDays30,
    todayStatus: statusOf(today),
    todaySoftDone: todayScore.softDone,
    todaySoftTotal: todayScore.softTotal,
    todayHardViolations: todayScore.hardViolations,
    todayHardTotal: todayScore.hardTotal,
    trend,
    perRule,
    weekday,
    performance,
  }
})

export interface ProgressYearData {
  year: number
  activeRules: number
  days: ProgressCalendarCell[]
  perfectDays: number
  loggedDays: number
  avgRatio: number
  /** Best clean streak within this calendar year (drives the year-scoped card). */
  bestStreak: number
}

export const getProgressYears = authedAction([], async ({ userId }): Promise<number[]> => {
  const [rc, dc] = await Promise.all([
    db
      .select({ m: sql<string | null>`min(${ruleCompletions.date})` })
      .from(ruleCompletions)
      .where(eq(ruleCompletions.userId, userId)),
    db
      .select({ m: sql<string | null>`min(${dailyCheckins.date})` })
      .from(dailyCheckins)
      .where(eq(dailyCheckins.userId, userId)),
  ])
  const currentYear = Number((await todayKey()).slice(0, 4))
  const candidates = [rc[0]?.m, dc[0]?.m].filter(Boolean) as string[]
  if (candidates.length === 0) return [currentYear]
  const minYear = Math.min(...candidates.map((d) => Number(d.slice(0, 4))))
  const years: number[] = []
  for (let y = currentYear; y >= minYear; y--) years.push(y)
  return years
})

export const getProgressYear = authedAction([yearSchema], async ({ userId }, year): Promise<ProgressYearData> => {
  const { timezone } = await readGlobalSettings()
  const today = dayKeyInTz(new Date(), timezone)
  // A plain range rather than LIKE 'YYYY-%': the keys are lexicographically ordered
  // "yyyy-MM-dd" strings, so this is the same set of rows — but a prefix LIKE can't use
  // the btree index under a non-C collation, which turns the year heatmap into a table
  // scan of every completion the user has ever logged.
  const yearFrom = `${year}-01-01`
  const yearTo = `${year}-12-31`

  const [ruleRows, comps, checkins, tradeDays, schedules] = await Promise.all([
    db.select().from(progressRules).where(eq(progressRules.userId, userId)),
    db
      .select({ date: ruleCompletions.date, ruleId: ruleCompletions.ruleId })
      .from(ruleCompletions)
      .where(
        and(eq(ruleCompletions.userId, userId), gte(ruleCompletions.date, yearFrom), lte(ruleCompletions.date, yearTo)),
      ),
    db
      .select({
        date: dailyCheckins.date,
        note: dailyCheckins.note,
        checkedIn: dailyCheckins.checkedIn,
        away: dailyCheckins.away,
        awayScope: dailyCheckins.awayScope,
      })
      .from(dailyCheckins)
      .where(and(eq(dailyCheckins.userId, userId), gte(dailyCheckins.date, yearFrom), lte(dailyCheckins.date, yearTo))),
    tradeDayKeys(userId, timezone, yearFrom, yearTo),
    loadScheduleHistory(userId),
  ])

  // Year heatmap is trading-only (see getProgressCalendar).
  const { lifecycles, byDate } = tradingScoringView(ruleRows, comps, timezone, schedules)
  const noteSet = new Set(checkins.filter((c) => c.note && c.note.trim()).map((c) => c.date))
  const checkedInSet = new Set(checkins.filter((c) => c.checkedIn).map((c) => c.date))
  const awaySet = excusedDays(checkins, 'trading')
  // Away days are included so they render as an explicit "away" cell rather than an
  // indistinguishable grey gap.
  const dates = new Set<string>([...byDate.keys(), ...noteSet, ...checkedInSet, ...awaySet, ...tradeDays])
  // Include past days that only had soft rules scheduled, so they surface as `unlogged`
  // rather than sitting out as an indistinguishable grey gap.
  addScheduledSoftDays(dates, `${year}-01-01`, `${year}-12-31`, today, lifecycles)

  const days: ProgressCalendarCell[] = [...dates]
    .sort()
    .map((date) => buildCell(date, today, lifecycles, byDate, noteSet, checkedInSet, tradeDays, awaySet))

  // "Logged" means the day carries a verdict. An `unlogged` day is scheduled-but-empty:
  // it belongs on the heatmap, but counting it here would inflate the very number that is
  // supposed to say how much of the year you actually recorded.
  const scoredDays = days.filter((d) => d.status === 'green' || d.status === 'yellow' || d.status === 'red')
  // Average soft completion over days that had soft habits, EXCLUDING no-trade
  // check-in days (soft tallies are N/A there).
  const ratioDays = scoredDays.filter((d) => d.softTotal > 0 && !d.cleanNoTrade)

  // Best clean streak WITHIN this calendar year, so the stat card can follow the
  // heatmap's selected year. Scans every calendar day of the year (up to today for
  // the current year), skipping unscheduled days as neutral. No current-streak guard
  // here — that's applied client-side only for the current year.
  const statusByDate = new Map(days.map((d) => [d.date, d.status]))
  const yearEnd = `${year}-12-31`
  const scanEnd = yearEnd < today ? yearEnd : today
  const yearScanDays: string[] = []
  for (let c = `${year}-01-01`; c <= scanEnd; c = shiftDay(c, 1)) yearScanDays.push(c)
  const bestStreak = bestCleanStreak(
    yearScanDays,
    (d) => statusByDate.get(d) ?? 'none',
    // An away day is neutral: not "scheduled", so the streak walk skips it instead of
    // treating its grey as a break.
    (d) => expectedRulesOn(d, today, lifecycles) > 0 && !(awaySet.has(d) && !tradeDays.has(d)),
  )

  return {
    year,
    activeRules: expectedRulesOn(today, today, lifecycles),
    days,
    perfectDays: days.filter((d) => d.status === 'green').length,
    loggedDays: scoredDays.length,
    avgRatio: ratioDays.length ? ratioDays.reduce((a, d) => a + d.ratio, 0) / ratioDays.length : 0,
    bestStreak,
  }
})

// ─── Habits (category 'habit') ────────────────────────────────────────────────
//
// General daily habits share the rules engine (lifecycle, schedules, completions)
// but are scored independently: per-habit streaks and completion rates, never the
// trading day status. All stats below reuse the same effective-dating semantics.

// Per-habit consistency over the rolling window — the habit analogue of the trading
// per-rule breakdown.
export interface HabitConsistency {
  id: string
  name: string
  /**
   * 'soft' = building (a TASK: rate = how often you did it), 'hard' = avoidance (a
   * CONSTRAINT: rate = how often you stayed clean). The two rates are not comparable,
   * so the UI lists them under separate headings — exactly like the trading breakdown
   * splits "respect rate" from "completion rate".
   */
  type: RuleType
  active: boolean
  /** Current streak of scheduled-and-good days (today gets grace while unlogged). */
  streak: number
  /** Best streak within the last 365 days. */
  bestStreak: number
  /** Good-day rate over scheduled days in the last 30 days, 0..1. */
  rate30: number
  /** Scheduled days in the last 30 that fed `rate30` (0 → "no data", not 0%). */
  tracked30: number
}

export interface HabitTrendPoint {
  date: string
  /** The day's quality score, 0..1. Never null — see the trading trend note. */
  ratio: number
  /** Building habits (TASKS) done / scheduled — the tooltip's "x/y". */
  done: number
  total: number
  /** Avoidance habits (CONSTRAINTS) that day, and how many stayed clean. */
  avoidTotal: number
  avoidKept: number
  /** Day colour (green/yellow/red), or 'none' on an unscheduled day. */
  status: DayStatus
}

export interface HabitWeekday {
  dow: number // 0=Sun … 6=Sat
  ratio: number
  samples: number
  scheduled: boolean
}

export interface HabitsData {
  habits: HabitConsistency[]
  /** Last 30 calendar days (oldest first) of aggregate completion. */
  trend: HabitTrendPoint[]
  /** Aggregate completion by weekday over the last 12 weeks. */
  weekday: HabitWeekday[]
  /** Current streak of aggregate-green days (today gets grace) — the streak card. */
  currentStreak: number
  /** Average completion over the last 30 days' RECORDED days, 0..1. */
  avg30: number
  /** Days in the last 30 that carry a verdict — the denominator behind `avg30`. */
  loggedDays30: number
  /** Settled scheduled days in the last 30 — the coverage denominator. */
  scheduledDays30: number
}

// Rolling habit stats (consistency, trend, weekday, streak/completion cards) from the
// already-fetched habit rows + completions. Pulled out of the action so getHabitsReview
// can compute it alongside the year cells from a SINGLE DB fetch.
function computeHabitStatsData(
  habitRows: (typeof progressRules.$inferSelect)[],
  doneByRule: Map<string, Set<string>>,
  timezone: string | null,
  today: string,
  awayOn: (day: string) => boolean,
  history: ScheduleHistory,
): HabitsData {
  const daysNewestFirst = [...Array(HISTORY_WINDOW_DAYS + 1)].map((_, i) => shiftDay(today, -i))
  const daysOldestFirst = [...daysNewestFirst].reverse()

  const toLife = toLifecycle(timezone, history)
  // (id, lifecycle) pairs for the aggregate day tally below.
  const habitLives = habitRows.map((r) => ({ id: r.id, life: toLife(r) }))

  // Aggregate day scorer (building ratio + avoidance never-miss-twice), classified
  // over the whole 366-day window so per-habit rates, streak, trend and weekday all read
  // from one source — plus a warm-up run before it, so the oldest day in the window
  // inherits the slip state of the day before it instead of starting clean.
  const classifyDays = [
    ...[...Array(AVOIDANCE_WARMUP_DAYS)].map((_, i) => shiftDay(daysOldestFirst[0], i - AVOIDANCE_WARMUP_DAYS)),
    ...daysOldestFirst,
  ]
  const agg = buildHabitDayScorer(habitRows, doneByRule, timezone, today, classifyDays, awayOn, history)

  // A day only feeds a rate or an average once it carries a verdict. `unlogged` (nothing
  // ticked on a day that had building habits scheduled) is absence of data, not a zero —
  // see the DayStatus note in progress-compute.
  const isScoredOn = (d: string) => {
    const s = agg(d).status
    return s === 'green' || s === 'yellow' || s === 'red'
  }

  // Per-habit consistency (streak / best / 30-day rate). A "good" day is: building →
  // done; avoidance ("No X", hard) → stayed clean (no slip logged). So higher rate is
  // always better for both tiers.
  const habits: HabitConsistency[] = habitRows
    .map((r) => {
      const life = toLife(r)
      const logged = doneByRule.get(r.id) ?? new Set<string>()
      const isAvoid = r.ruleType === 'hard'
      const good = (d: string) => (isAvoid ? !logged.has(d) : logged.has(d))

      // Two different day sets, because a rate and a streak make different claims — the
      // same split the trading per-rule breakdown makes.
      //
      //   RATE  — "of the days I recorded, how often did I comply?" A day with no verdict
      //           is absence of data and is excluded, or the number would measure how
      //           often the app was opened.
      //   STREAK— "how many days running?" An unbroken run cannot skip over a day nobody
      //           recorded, so an unlogged day is visible here and breaks it (see
      //           ruleStreakDayStatus). Otherwise an avoidance habit's flame would grow
      //           straight through a fortnight of silence — nothing was logged, so nothing
      //           was breached — while the streak card beside it correctly reset to zero.
      //
      // Both skip days the habit wasn't scheduled on and days marked away.
      const runsOn = (d: string) => ruleInEffectOn(d, today, life) && !awayOn(d)
      const rateScheduledOn = (d: string) => runsOn(d) && isScoredOn(d)
      // Avoidance (hard) habits: an unbroken TODAY is provisional, not a full green —
      // otherwise a habit kept for the first time yesterday would already read as a
      // 2-day streak today. Building habits keep their active-completion semantics.
      const statusOf = (d: string) =>
        ruleStreakDayStatus({
          isHard: isAvoid,
          good: good(d),
          isToday: d === today,
          dayLogged: isScoredOn(d),
        })

      let tracked30 = 0
      let good30 = 0
      for (let i = 0; i < 30; i++) {
        const d = daysNewestFirst[i]
        if (!rateScheduledOn(d)) continue
        tracked30 += 1
        if (good(d)) good30 += 1
      }

      return {
        id: r.id,
        name: r.name,
        type: r.ruleType,
        active: r.active,
        streak: currentCleanStreak(daysNewestFirst, statusOf, runsOn),
        bestStreak: bestCleanStreak(daysOldestFirst, statusOf, runsOn),
        rate30: tracked30 > 0 ? good30 / tracked30 : 0,
        tracked30,
      }
    })
    // Most consistent first; habits with no tracked days sink to the bottom.
    .sort(
      (a, b) =>
        Number(b.tracked30 > 0) - Number(a.tracked30 > 0) || b.rate30 - a.rate30 || a.name.localeCompare(b.name),
    )

  // Trend with an EXPANDING window: from the first day a habit existed up to today,
  // capped at 30 days. A brand-new user sees their first day at the left growing
  // rightward, not a lone point pinned to the right of 29 empty days; after 30 days it
  // becomes the rolling last-30 window. Matches the trading discipline trend. Null
  // ratio on a day nothing was scheduled bridges a gap in the line.
  const firstHabitDay = habitLives.reduce<string>((m, h) => (h.life.createdDay < m ? h.life.createdDay : m), today)
  const rollStart = shiftDay(today, -29)
  const trendStart = firstHabitDay > rollStart ? firstHabitDay : rollStart
  // Same treatment as the trading trend — see the note there. Unscheduled days are skipped,
  // unfilled ones plot 0 to match the 30-day completion card.
  const trend: HabitTrendPoint[] = []
  for (let date = trendStart; date <= today; date = shiftDay(date, 1)) {
    const { ratio, taskTotal, taskDone, avoidTotal, avoidKept, anyScheduled, status } = agg(date)
    if (anyScheduled === 0) continue
    trend.push({
      date,
      // The canonical quality score, NOT done/scheduled — so a clean avoidance habit
      // can't lift the line and a broken one can't hide inside it (see
      // aggregateHabitDayStatus). This is the same number the heatmap shades by.
      ratio: isScoredOn(date) ? ratio : 0,
      done: taskDone,
      total: taskTotal,
      avoidTotal,
      avoidKept,
      status,
    })
  }

  // By-weekday quality over the last 84 days, counting only scheduled days that carry a
  // verdict — otherwise the bars would report which weekday you forget to log.
  const wdSum = new Array(7).fill(0)
  const wdCount = new Array(7).fill(0)
  for (let i = 0; i < 84; i++) {
    const date = shiftDay(today, -i)
    const { ratio, anyScheduled } = agg(date)
    if (anyScheduled === 0 || !isScoredOn(date)) continue
    const [y, m, d] = date.split('-').map(Number)
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    wdSum[dow] += ratio
    wdCount[dow] += 1
  }
  // Over the same 84 days the bars cover, so a habit that ran on Sundays until last month
  // doesn't read as a weekday nothing is scheduled on.
  const scheduledWeekdays = scheduledWeekdaysOf(habitRows.map(toLife), shiftDay(today, -84))
  const weekday: HabitWeekday[] = wdSum.map((s, dow) => ({
    dow,
    ratio: wdCount[dow] ? s / wdCount[dow] : 0,
    samples: wdCount[dow],
    // dow is 0=Sun…6=Sat; schedules are ISO, where Sunday is 7.
    scheduled: scheduledWeekdays.has(dow === 0 ? 7 : dow),
  }))

  // Aggregate current streak + 30-day average — the streak / completion cards, mirroring
  // the trading overview's rolling stats.
  // The "avoidance-only today is provisional" grace used to be patched in here; it now
  // lives inside aggregateHabitDayStatus, so every surface agrees and this is a plain
  // read of the day's status.
  const currentStreak = currentCleanStreak(
    daysNewestFirst,
    (d) => agg(d).status,
    (d) => agg(d).anyScheduled > 0,
  )
  // Mirrors the trading headline exactly: a settled scheduled day you never filled in
  // scores ZERO, because recording is part of the habit. The per-habit rates and the
  // weekday bars above keep to recorded days — see the note on avgDiscipline30.
  let sum30 = 0
  let loggedDays30 = 0
  let scheduledDays30 = 0
  for (let i = 0; i < 30; i++) {
    const date = daysNewestFirst[i]
    const { ratio, anyScheduled } = agg(date)
    if (anyScheduled === 0) continue
    // Today isn't overdue yet, so it doesn't count against you until it's logged or over.
    const scored = isScoredOn(date)
    if (dayIsOpen(date, today) && !scored) continue
    scheduledDays30 += 1
    if (scored) {
      sum30 += ratio
      loggedDays30 += 1
    }
  }

  return {
    habits,
    trend,
    weekday,
    currentStreak,
    // Denominator = days you were supposed to log, not just the ones you did.
    avg30: scheduledDays30 ? sum30 / scheduledDays30 : 0,
    loggedDays30,
    scheduledDays30,
  }
}

// One-click starter habits, mirroring createStarterRules — and racing-proof the same way.
export const createStarterHabits = mutationAction([], async ({ userId }) => {
  const count = await insertStarterSet(
    userId,
    'habit',
    tList('progress.habits.starter').map((name) => ({
      name,
      ruleType: 'soft' as const,
      activeDays: ALL_WEEKDAYS,
    })),
  )
  revalidatePath('/progress')
  return { success: true, count }
})

// ─── Habit year heatmap ───────────────────────────────────────────────────────
//
// Aggregated contribution-style history for a single calendar year: ONE cell per
// day whose colour is the share of that day's habits you kept, using the SAME
// red/yellow/green ramp as the trading heatmap (so 10+ habits collapse into one
// readable grid instead of a wall of rows). A day with no scheduled habit is out of
// scope (grey). This is the "review" surface; the weekly grid on the overview keeps
// the per-habit quick-log + streaks.

/** One aggregated day: the task tally, the constraint tally, and the colour. */
export interface HabitYearCell {
  date: string
  /** Building habits (TASKS) scheduled that day. Constraints are counted separately. */
  scheduled: number
  /** Building habits done. */
  done: number
  /** The day's quality score, 0..1 — drives the green intensity. See aggregateHabitDayStatus. */
  ratio: number
  /** Avoidance habits (CONSTRAINTS) scheduled that day. */
  avoidTotal: number
  /** Of those, how many stayed clean. */
  avoidKept: number
  /** Marked away — neutral, and shaded as such rather than as an untouched grey day. */
  away: boolean
  /** Same status vocabulary as the trading heatmap (none/green/yellow/red). */
  status: DayStatus
}

export interface HabitYearData {
  year: number
  today: string
  /** In-scope days only (at least one habit scheduled), oldest first. */
  days: HabitYearCell[]
  /** Habits scheduled to run at some point (live, non-archived). */
  activeHabits: number
  /** Days scored green (≥50% of that day's habits done). */
  greenDays: number
  /** Days with at least one habit scheduled. */
  loggedDays: number
  /** Average completion ratio over logged days, 0..1. */
  avgRatio: number
  /** Best run of consecutive green days within the year. */
  bestStreak: number
}

/**
 * How far before a scan range the avoidance walk has to start.
 *
 * "Never miss twice" reads the previous SCHEDULED day, so a walk that begins exactly at
 * the range start always sees `prevSlip = false` on its first day — which turned a slip on
 * 31 Dec + 1 Jan into an amber warning on the year heatmap while the day panel (which
 * looks 90 days back) and the rolling stats both called it broken. Three surfaces, two
 * answers for one day.
 *
 * Two weeks covers a rule scheduled on a single weekday (7 days) with room to spare; the
 * warm-up days are classified and then dropped, so they never produce cells.
 */
const AVOIDANCE_WARMUP_DAYS = 14

// Shared habit-day scorer. Splits habits into building (soft, scored by completion
// ratio) and avoidance (hard "No X", scored never-miss-twice), and returns an
// `agg(date)` that yields the day's aggregate status/ratio/tallies. Avoidance state
// needs the previous SCHEDULED day, so it's precomputed by walking `classifyDays`
// (oldest first) once per avoidance habit. `agg` must only be called for dates within
// `classifyDays`. A completion row on an avoidance habit means a SLIP that day.
function buildHabitDayScorer(
  habitRows: (typeof progressRules.$inferSelect)[],
  doneByRule: Map<string, Set<string>>,
  tz: string | null,
  today: string,
  classifyDays: string[],
  /** Days the user marked away — not measured at all, in either domain. */
  awayOn: (day: string) => boolean = () => false,
  /** Superseded schedules, so each day is read under the schedule it actually had. */
  history?: ScheduleHistory,
) {
  const toLife = toLifecycle(tz, history)
  const lives = habitRows.map((r) => ({ id: r.id, type: r.ruleType, life: toLife(r) }))
  const building = lives.filter((l) => l.type !== 'hard')
  const avoidance = lives.filter((l) => l.type === 'hard')

  // Precompute each scheduled day's avoidance states (across all avoidance habits).
  const avoidByDate = new Map<string, AvoidanceState[]>()
  for (const a of avoidance) {
    const slips = doneByRule.get(a.id) ?? new Set<string>()
    let prevSlip = false // unknown before the window → treat as no prior slip
    for (const d of classifyDays) {
      if (!ruleInEffectOn(d, today, a.life)) continue
      const slip = slips.has(d)
      if (!avoidByDate.has(d)) avoidByDate.set(d, [])
      avoidByDate.get(d)!.push(avoidanceState(slip, prevSlip))
      prevSlip = slip
    }
  }

  const ZERO = {
    status: 'none' as DayStatus,
    ratio: 0,
    taskTotal: 0,
    taskDone: 0,
    avoidTotal: 0,
    avoidKept: 0,
    anyScheduled: 0,
  }

  const score = (date: string) => {
    // Away: nothing was expected of you. Reported as "nothing scheduled" so every
    // consumer (heatmap scope, trend gap, weekday samples, streak neutrality, averages)
    // already handles it without a special case of its own.
    if (awayOn(date)) return ZERO
    // TASK tally (building habits) — the only thing that feeds a counter or a ratio.
    let taskTotal = 0
    let taskDone = 0
    for (const b of building) {
      if (!ruleInEffectOn(date, today, b.life)) continue
      taskTotal += 1
      if (doneByRule.get(b.id)?.has(date)) taskDone += 1
    }
    // CONSTRAINT tally (avoidance habits) — reported separately, never mixed into the
    // task counter; it only gates the colour. See the model note in progress-compute.
    const av = avoidByDate.get(date) ?? []
    const { status, ratio } = aggregateHabitDayStatus(taskTotal, taskDone, av, date === today)
    return {
      status,
      ratio,
      taskTotal,
      taskDone,
      avoidTotal: av.length,
      avoidKept: av.filter((s) => s === 'clean').length,
      /** Anything at all scheduled — what puts the day IN SCOPE (vs. a grey day off). */
      anyScheduled: taskTotal + av.length,
    }
  }

  // Memoized, exactly like the trading side's `scoreCache`. The callers re-score the same
  // dates many times over — `isScoredOn`, `scheduledOn`, the streak walks, the trend and
  // the weekday loop all funnel through here, and the per-habit stats run two 366-day
  // walks PER HABIT. Uncached that is O(habits² × days) rule-in-effect checks on every
  // request, and the Habits tab re-requests on every tick.
  const cache = new Map<string, ReturnType<typeof score>>()
  const agg = (date: string) => {
    const hit = cache.get(date)
    if (hit) return hit
    const v = score(date)
    cache.set(date, v)
    return v
  }

  return agg
}

// Aggregated year cells (heatmap) + year-scoped cards from the already-fetched habit
// rows + completions. See computeHabitStatsData — both share one DB fetch.
function computeHabitYearData(
  year: number,
  habitRows: (typeof progressRules.$inferSelect)[],
  doneByRule: Map<string, Set<string>>,
  timezone: string | null,
  today: string,
  awayOn: (day: string) => boolean,
  history: ScheduleHistory,
): HabitYearData {
  // Scan Jan 1 → year end (clipped to today for the current year), oldest first.
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const scanEnd = yearEnd < today ? yearEnd : today
  const scanDays: string[] = []
  for (let c = yearStart; c <= scanEnd; c = shiftDay(c, 1)) scanDays.push(c)

  // Classify from BEFORE Jan 1 so the avoidance walk carries December's slips into the new
  // year (see AVOIDANCE_WARMUP_DAYS). The warm-up days are only there to seed `prevSlip`;
  // `scanDays` still decides which cells exist.
  const classifyDays: string[] = []
  for (let c = shiftDay(yearStart, -AVOIDANCE_WARMUP_DAYS); c <= scanEnd; c = shiftDay(c, 1)) classifyDays.push(c)

  const agg = buildHabitDayScorer(habitRows, doneByRule, timezone, today, classifyDays, awayOn, history)

  const statusByDate = new Map<string, DayStatus>()
  const days: HabitYearCell[] = []
  let greenDays = 0
  let ratioSum = 0
  let ratioDays = 0 // scheduled days with a verdict — the only ones that feed avgRatio
  for (const date of scanDays) {
    // An away day is reported by `agg` as "nothing scheduled" (so it stays out of every
    // average), but it still gets a cell — an explicitly marked day off has to look
    // different from a day nothing happened to be scheduled on.
    if (awayOn(date)) {
      days.push({
        date,
        scheduled: 0,
        done: 0,
        ratio: 0,
        avoidTotal: 0,
        avoidKept: 0,
        away: true,
        status: 'none',
      })
      continue
    }
    const { status, ratio, taskTotal, taskDone, avoidTotal, avoidKept, anyScheduled } = agg(date)
    // Scope is "anything scheduled" — a day with only avoidance habits still belongs on
    // the heatmap even though its task counter is 0/0.
    if (anyScheduled === 0) continue // no habit ran that day → out of scope (grey)
    if (status === 'green') greenDays += 1
    // Only a day with a verdict feeds the year average: `pending` isn't settled yet and
    // `unlogged` carries no data, so neither may enter as a 0.
    if (status === 'green' || status === 'yellow' || status === 'red') {
      ratioSum += ratio
      ratioDays += 1
    }
    statusByDate.set(date, status)
    days.push({ date, scheduled: taskTotal, done: taskDone, ratio, avoidTotal, avoidKept, away: false, status })
  }

  const bestStreak = bestCleanStreak(
    scanDays,
    (d) => statusByDate.get(d) ?? 'none',
    (d) => agg(d).anyScheduled > 0,
  )

  return {
    year,
    today,
    days,
    activeHabits: habitRows.length,
    greenDays,
    loggedDays: days.length,
    avgRatio: ratioDays ? ratioSum / ratioDays : 0,
    bestStreak,
  }
}

export interface HabitsReviewData {
  year: HabitYearData
  stats: HabitsData
}

// Single fetch powering the Habits tab's heatmap + stats. Merges what used to be two
// actions (getHabitYear + getHabitStats) so a mutation re-fetches the shared habit
// rows + completions ONCE instead of twice. The day panel and correlation stay
// separate (different windows / lazy). Completions cover both the selected year and
// the rolling 365-day stats window.
export const getHabitsReview = authedAction([yearSchema], async ({ userId }, year): Promise<HabitsReviewData> => {
  const { timezone } = await readGlobalSettings()
  const today = dayKeyInTz(new Date(), timezone)
  const yearStart = `${year}-01-01`
  const rollStart = shiftDay(today, -HISTORY_WINDOW_DAYS)
  // Reach back past the earliest day either view scores, by the avoidance warm-up: the
  // never-miss-twice walk needs the slips immediately BEFORE the range to classify its
  // first day correctly, and a row that isn't fetched reads as "no slip".
  const windowStart = shiftDay(yearStart < rollStart ? yearStart : rollStart, -AVOIDANCE_WARMUP_DAYS)

  // Habits first: their ids narrow the completions query to the rows this action can
  // actually use. Fetching every completion in the window and discarding the trading ones
  // in JS meant the busiest table was read in full to serve a tab that ignores most of it.
  const habitRows = await db
    .select()
    .from(progressRules)
    .where(and(eq(progressRules.userId, userId), eq(progressRules.category, 'habit'), isNull(progressRules.archivedAt)))
    .orderBy(progressRules.sortOrder, progressRules.name)
  const habitIds = habitRows.map((r) => r.id)

  const [comps, awayRows, schedules] = await Promise.all([
    habitIds.length === 0
      ? Promise.resolve([] as { ruleId: string; date: string }[])
      : db
          .select({ ruleId: ruleCompletions.ruleId, date: ruleCompletions.date })
          .from(ruleCompletions)
          .where(
            and(
              eq(ruleCompletions.userId, userId),
              inArray(ruleCompletions.ruleId, habitIds),
              gte(ruleCompletions.date, windowStart),
            ),
          ),
    db
      .select({ date: dailyCheckins.date, away: dailyCheckins.away, awayScope: dailyCheckins.awayScope })
      .from(dailyCheckins)
      .where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.away, true), gte(dailyCheckins.date, windowStart))),
    loadScheduleHistory(userId),
    // No trade lookup here on purpose: whether you traded says nothing about whether you
    // kept your habits, so this domain judges "did you show up" on habit rows alone.
  ])

  const doneByRule = new Map<string, Set<string>>()
  for (const c of comps) {
    if (!doneByRule.has(c.ruleId)) doneByRule.set(c.ruleId, new Set())
    doneByRule.get(c.ruleId)!.add(c.date)
  }
  const awaySet = excusedDays(awayRows, 'habits')
  // Nothing overrides a habit excuse: "excused for trading, still scored for habits" is now
  // said with the scope ("Trading only") rather than inferred from logged rows, which used
  // to silently cancel an excuse the user had just given. `awaySet` is already
  // scope-filtered for habits.
  const awayOn = (day: string) => awaySet.has(day)

  return {
    year: computeHabitYearData(year, habitRows, doneByRule, timezone, today, awayOn, schedules),
    stats: computeHabitStatsData(habitRows, doneByRule, timezone, today, awayOn, schedules),
  }
})

// ─── Habit day panel (back-fill any day) ──────────────────────────────────────
//
// The habits that ran on a single day with their done state — powers the day panel
// in the Habits tab, so any day (today or past) can be back-filled the same way the
// trading day panel works. Toggling reuses toggleRuleCompletion.

export interface HabitDayItem {
  id: string
  name: string
  description: string | null
  /** 'soft' = building (check = done); 'hard' = avoidance "No X" (check = log a slip). */
  type: RuleType
  /** Good state: building → done; avoidance → stayed clean (no slip logged). */
  completed: boolean
  /** Avoidance only: the previous scheduled day was also a slip (→ never-miss-twice). */
  prevSlip?: boolean
}

export interface HabitDayData {
  date: string
  /**
   * Building habits (TASKS) in effect that day — the day's `x/y` denominator. Avoidance
   * habits are constraints and are counted in `avoidTotal` instead, never here: an
   * untouched day must not read as partly done just because nothing was breached yet.
   * Mirrors DayProgress.softTotal / softDone on the trading side.
   */
  scheduled: number
  /** Building habits done. */
  done: number
  /** Avoidance habits (CONSTRAINTS) in effect that day. */
  avoidTotal: number
  /** Of those, how many stayed clean (no slip logged). */
  avoidKept: number
  /** Anything scheduled at all — distinguishes a real day off from an empty task list. */
  anyScheduled: number
  /** Aggregate colour — same RYG model as the heatmap cell. */
  status: DayStatus
  /** Scheduled habits with their state, in sort order. */
  items: HabitDayItem[]
  isToday: boolean
  isFuture: boolean
  /** Marked away AND not negated by a logged habit — the day isn't measured. */
  away: boolean
  /** The raw stored flag, before self-negation. The toggle binds to this — see DayProgress. */
  awayFlag: boolean
  /** Which domains the excuse covers. Only meaningful while `awayFlag` is set. */
  awayScope: AwayScope
  /** Any live habit exists at all (drives the empty vs. day-off message). */
  anyHabits: boolean
}

export const getHabitDay = authedAction([dateKey], async ({ userId }, date): Promise<HabitDayData> => {
  const { timezone } = await readGlobalSettings()
  const today = dayKeyInTz(new Date(), timezone)
  // Look back far enough to find each avoidance habit's previous scheduled day.
  const windowStart = shiftDay(date, -90)

  const [habitRows, completions, checkin, schedules] = await Promise.all([
    db
      .select()
      .from(progressRules)
      .where(
        and(eq(progressRules.userId, userId), eq(progressRules.category, 'habit'), isNull(progressRules.archivedAt)),
      )
      .orderBy(progressRules.sortOrder, progressRules.name),
    db
      .select({ ruleId: ruleCompletions.ruleId, date: ruleCompletions.date })
      .from(ruleCompletions)
      .where(
        and(
          eq(ruleCompletions.userId, userId),
          gte(ruleCompletions.date, windowStart),
          lt(ruleCompletions.date, shiftDay(date, 1)),
        ),
      ),
    db.query.dailyCheckins.findFirst({
      where: and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, date)),
      columns: { away: true, awayScope: true },
    }),
    loadScheduleHistory(userId),
  ])

  const slipsByRule = new Map<string, Set<string>>()
  for (const c of completions) {
    if (!slipsByRule.has(c.ruleId)) slipsByRule.set(c.ruleId, new Set())
    slipsByRule.get(c.ruleId)!.add(c.date)
  }

  const toLife = toLifecycle(timezone, schedules)
  // Previous SCHEDULED day for an avoidance habit slipped? Walk back within the window.
  const prevScheduledSlip = (r: (typeof habitRows)[number]): boolean => {
    const life = toLife(r)
    const slips = slipsByRule.get(r.id) ?? new Set<string>()
    for (let d = shiftDay(date, -1); d >= windowStart; d = shiftDay(d, -1)) {
      if (!ruleInEffectOn(d, today, life)) continue
      return slips.has(d)
    }
    return false
  }

  const items: HabitDayItem[] = habitRows
    .filter((r) => ruleInEffectOn(date, today, toLife(r)))
    .map((r) => {
      const loggedToday = slipsByRule.get(r.id)?.has(date) ?? false
      if (r.ruleType === 'hard') {
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          type: 'hard' as const,
          completed: !loggedToday, // respected = no slip
          prevSlip: prevScheduledSlip(r),
        }
      }
      return { id: r.id, name: r.name, description: r.description, type: 'soft' as const, completed: loggedToday }
    })

  // Habits judge "did you show up" on habit rows, not on trades — see getHabitsReview.
  // Any row logged on this day (a building tick or an avoidance slip) means you engaged,
  // so the excuse doesn't apply and the day scores normally.
  const awayFlag = checkin?.away ?? false
  const awayScope = checkin?.awayScope ?? 'both'
  const away = habitDayExcused({ away: awayFlag, scope: awayScope })
  const buildingScheduled = items.filter((i) => i.type === 'soft').length
  const buildingDone = items.filter((i) => i.type === 'soft' && i.completed).length
  const avoidanceStates: AvoidanceState[] = items
    .filter((i) => i.type === 'hard')
    .map((i) => avoidanceState(!i.completed, i.prevSlip ?? false))
  const { status } = aggregateHabitDayStatus(buildingScheduled, buildingDone, avoidanceStates, date === today)

  return {
    date,
    // Task tally only — constraints are reported alongside, not folded in.
    scheduled: buildingScheduled,
    done: buildingDone,
    avoidTotal: avoidanceStates.length,
    avoidKept: avoidanceStates.filter((s) => s === 'clean').length,
    anyScheduled: items.length,
    // An away day is not measured: the rows still render (so you can log something if it
    // turns out you did keep a habit), but the day carries no colour.
    status: items.length === 0 || away ? 'none' : status,
    items,
    isToday: date === today,
    isFuture: date > today,
    away,
    awayFlag,
    awayScope,
    anyHabits: habitRows.length > 0,
  }
})

// Mark every habit scheduled on `date` as done in one shot (the day panel's "mark
// all" shortcut). Past days are editable (back-fill); only the future is off-limits.
export const markAllHabitsDone = mutationAction([dateKey], async ({ userId }, date) => {
  const { timezone } = await readGlobalSettings()
  const today = dayKeyInTz(new Date(), timezone)
  if (date > today) throw new ValidationError(t('errors.rule.future'))

  const habitRows = await db
    .select()
    .from(progressRules)
    .where(and(eq(progressRules.userId, userId), eq(progressRules.category, 'habit'), isNull(progressRules.archivedAt)))

  const toLife = toLifecycle(timezone, await loadScheduleHistory(userId))
  // Building (soft) habits only — a row on an avoidance habit is a SLIP, so "mark all
  // done" must never touch them (they're kept clean by leaving them untouched).
  const inEffect = habitRows.filter((r) => r.ruleType === 'soft' && ruleInEffectOn(date, today, toLife(r)))
  if (inEffect.length === 0) return { success: true, count: 0 }

  await db
    .insert(ruleCompletions)
    .values(inEffect.map((r) => ({ userId, ruleId: r.id, date })))
    .onConflictDoNothing({ target: [ruleCompletions.ruleId, ruleCompletions.date] })

  revalidatePath('/progress')
  return { success: true, count: inEffect.length }
})

// ─── Habit → trading performance ──────────────────────────────────────────────
//
// "Does this habit pay off?" For each habit, split the TRADING days on which it was
// scheduled into two buckets — habit done vs. missed — and compare the average net
// P&L and win rate. Only trading days count (a habit can't move P&L on a day you
// didn't trade), and only the days the habit was actually in effect. A bucket needs
// a minimum sample before we show a number, so a one-off day never masquerades as a
// trend.

// Per-habit split (doneDays, avgPnl, winRate, pnlDelta, enoughData — see
// HabitPerfSplit) plus its identity. The numeric fields come straight from the
// pure bucketHabitPerformance helper, so they stay defined and tested in one place.
export interface HabitPerf extends HabitPerfSplit {
  id: string
  name: string
}

export interface HabitPerformanceData {
  habits: HabitPerf[]
  /** At least one habit cleared the sample threshold in both buckets. */
  anySignal: boolean
}

export const getHabitPerformance = authedAction([], async ({ userId }): Promise<HabitPerformanceData> => {
  const { timezone } = await readGlobalSettings()
  const today = dayKeyInTz(new Date(), timezone)
  const windowStart = shiftDay(today, -HISTORY_WINDOW_DAYS)
  const pnlFromUtc = new Date(`${shiftDay(windowStart, -1)}T00:00:00.000Z`)
  const pnlToUtc = new Date(`${shiftDay(today, 2)}T00:00:00.000Z`)

  const [habitRows, completions, tradePnlRows, awayRows, schedules] = await Promise.all([
    db
      .select()
      .from(progressRules)
      .where(
        and(eq(progressRules.userId, userId), eq(progressRules.category, 'habit'), isNull(progressRules.archivedAt)),
      )
      .orderBy(progressRules.sortOrder, progressRules.name),
    db
      .select({ ruleId: ruleCompletions.ruleId, date: ruleCompletions.date })
      .from(ruleCompletions)
      .where(and(eq(ruleCompletions.userId, userId), gte(ruleCompletions.date, windowStart))),
    db
      .select({ e: trades.entryDatetime, p: trades.netPnl })
      .from(trades)
      .where(and(eq(trades.userId, userId), gte(trades.entryDatetime, pnlFromUtc), lt(trades.entryDatetime, pnlToUtc))),
    db
      .select({ date: dailyCheckins.date, away: dailyCheckins.away, awayScope: dailyCheckins.awayScope })
      .from(dailyCheckins)
      .where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.away, true), gte(dailyCheckins.date, windowStart))),
    loadScheduleHistory(userId),
  ])

  // Net P&L per trading day (user tz) — the only days a habit can be correlated with.
  //
  // Days excused for HABITS are dropped. Nothing was expected of you on them, so an
  // unlogged habit there is not a miss — and this widget's whole method is to compare
  // "kept" against "missed". Leaving them in filed every excused day under "missed" and
  // quietly argued that your habits don't pay off, using days you were away.
  //
  // It bites in a narrow but real case: a day excused as "Daily only" that you also traded
  // on. `getHabitsReview` has always excluded them; this action was written before scopes
  // and never learned to.
  const excusedForHabits = excusedDays(awayRows, 'habits')
  const dayPnl = new Map<string, number>()
  for (const r of tradePnlRows) {
    if (!r.e) continue
    const key = dayKeyInTz(r.e, timezone)
    if (excusedForHabits.has(key)) continue
    dayPnl.set(key, (dayPnl.get(key) ?? 0) + Number(r.p ?? 0))
  }

  const habitIds = new Set(habitRows.map((r) => r.id))
  const doneByRule = new Map<string, Set<string>>()
  for (const c of completions) {
    if (!habitIds.has(c.ruleId)) continue
    if (!doneByRule.has(c.ruleId)) doneByRule.set(c.ruleId, new Set())
    doneByRule.get(c.ruleId)!.add(c.date)
  }

  const toLife = toLifecycle(timezone, schedules)
  const habits: HabitPerf[] = habitRows.map((r) => {
    const life = toLife(r)
    const done = doneByRule.get(r.id) ?? new Set<string>()
    // Restrict to trading days on which this habit was actually scheduled.
    const scheduledDayPnl = new Map<string, number>()
    for (const [day, pnl] of dayPnl) if (ruleInEffectOn(day, today, life)) scheduledDayPnl.set(day, pnl)
    const split = bucketHabitPerformance(scheduledDayPnl, (day) => done.has(day), HABIT_PERF_MIN_SAMPLE)
    return { id: r.id, name: r.name, ...split }
  })

  // Habits with signal first (biggest positive lift on top), the rest after.
  habits.sort(
    (a, b) => Number(b.enoughData) - Number(a.enoughData) || b.pnlDelta - a.pnlDelta || a.name.localeCompare(b.name),
  )

  return { habits, anySignal: habits.some((h) => h.enoughData) }
})

export const getTodayKey = authedAction([], async (): Promise<string> => todayKey())
