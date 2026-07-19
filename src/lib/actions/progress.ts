'use server'

import { db, progressRules, ruleCompletions, dailyCheckins, trades } from '@/lib/db'
import { and, eq, sql, gte, lt, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { t, tList } from '@/i18n'
import { uuid, uuidArray, dateKey, year as yearSchema, month as monthSchema } from '@/lib/validation'
import { authedAction, mutationAction } from '@/lib/safe-action'
import { NotFoundError, ValidationError } from '@/lib/action-errors'
import { readGlobalSettings } from '@/lib/global-settings'
import { dayKeyInTz, shiftDay } from '@/lib/date-tz'
import {
  expectedRulesOn,
  ruleIdsInEffectOn,
  ruleInEffectOn,
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
} from '@/lib/progress-compute'

async function todayKey(): Promise<string> {
  const { timezone } = await readGlobalSettings()
  return dayKeyInTz(new Date(), timezone)
}

// Project a rule row onto its effective-dated lifecycle in the user's timezone.
function toLifecycle(tz: string | null) {
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

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProgressRule {
  id: string
  name: string
  description: string | null
  type: RuleType
  sortOrder: number
  active: boolean
  activeDays: number[]
}

export interface DayRule {
  id: string
  name: string
  description: string | null
  type: RuleType
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
  hardTotal: number
  hardViolations: number
  softTotal: number
  softDone: number
  ratio: number // soft ratio, 0..1
  hasNote: boolean
}

export interface ProgressCalendarData {
  year: number
  month: number
  days: ProgressCalendarCell[]
  activeRules: number
  monthPerfectDays: number
  monthLoggedDays: number
  monthAvgRatio: number
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
}

export interface ProgressStats {
  activeRules: number
  /** Clean streak: consecutive in-scope days (most recent first) with no hard violation. */
  currentStreak: number
  bestStreak: number
  /** Days scored green. */
  greenDaysTotal: number
  avgDiscipline30: number // avg discipline over in-scope days in the window, 0..1
  loggedDays30: number
  todayStatus: DayStatus
  todaySoftDone: number
  todaySoftTotal: number
  todayHardViolations: number
  todayHardTotal: number
  trend: {
    date: string
    /**
     * Discipline for the day, 0..1 — or null on a day with NO rule scheduled (a day
     * off / before any rule existed). Null draws a gap that the line bridges, so an
     * ordinary day off doesn't read as a crash. A day that WAS scheduled but never
     * logged stays a real 0 (a genuine dip), matching the streak semantics.
     */
    ratio: number | null
    /** Whether at least one rule was in effect this day (drives the gap vs. dip). */
    scheduled: boolean
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
  // Does discipline pay off? Trading days bucketed by their discipline status, with
  // the average daily net P&L and share of up days in each bucket.
  performance: {
    green: DisciplinePerf
    yellow: DisciplinePerf
    red: DisciplinePerf
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

const ruleSchema = z.object({
  name: z.string().trim().min(1, t('validation.nameRequired')).max(80),
  description: z.string().trim().max(280).optional().nullable(),
  // Rule tier. Defaults to 'soft' so older callers keep working.
  type: z.enum(['hard', 'soft']).default('soft'),
  // ISO weekdays (1=Mon … 7=Sun); at least one, no duplicates. Defaults to every day.
  activeDays: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .max(7)
    .refine((d) => new Set(d).size === d.length, 'Duplicate weekdays')
    .default([...ALL_WEEKDAYS]),
})

export const getRules = authedAction([], async ({ userId }): Promise<ProgressRule[]> => {
  // Archived (deleted) rules are kept in the DB for history but never listed.
  const rows = await db
    .select()
    .from(progressRules)
    .where(and(eq(progressRules.userId, userId), isNull(progressRules.archivedAt)))
    .orderBy(progressRules.sortOrder, progressRules.name)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    type: r.ruleType,
    sortOrder: r.sortOrder,
    active: r.active,
    activeDays: r.activeDays,
  }))
})

// ─── Rules: CRUD ──────────────────────────────────────────────────────────────

export const createRule = mutationAction([ruleSchema], async ({ userId }, { name, description, type, activeDays }) => {
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
      ruleType: type,
      sortOrder: nextOrder,
      activeDays: sortDays(activeDays),
    })
    .returning()
  revalidatePath('/progress')
  return { success: true, rule }
})

// One-click starter set for a brand-new user: a few universal non-negotiables and
// quality habits, so the discipline page is useful before they've written any rules.
// Everything is editable/deletable afterwards.
export const createStarterRules = mutationAction([], async ({ userId }) => {
  const existing = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(progressRules)
    .where(and(eq(progressRules.userId, userId), isNull(progressRules.archivedAt)))
  // Don't stack duplicates if the user already has rules.
  if ((existing[0]?.n ?? 0) > 0) return { success: true, count: 0 }

  const hard = tList('progress.stats.starterRules.hard')
  const soft = tList('progress.stats.starterRules.soft')
  const maxRow = await db
    .select({ m: sql<number>`coalesce(max(${progressRules.sortOrder}), -1)`.mapWith(Number) })
    .from(progressRules)
    .where(eq(progressRules.userId, userId))
  let order = (maxRow[0]?.m ?? -1) + 1

  const rows = [
    ...hard.map((name) => ({ type: 'hard' as const, name })),
    ...soft.map((name) => ({ type: 'soft' as const, name })),
  ].map((r) => ({
    userId,
    name: r.name,
    ruleType: r.type,
    sortOrder: order++,
    activeDays: [...ALL_WEEKDAYS],
  }))

  if (rows.length === 0) return { success: true, count: 0 } // guard against an empty VALUES insert
  await db.insert(progressRules).values(rows)
  revalidatePath('/progress')
  return { success: true, count: rows.length }
})

export const updateRule = mutationAction(
  [uuid, ruleSchema],
  async ({ userId }, id, { name, description, type, activeDays }) => {
    const [rule] = await db
      .update(progressRules)
      .set({
        name,
        description: description || null,
        ruleType: type,
        activeDays: sortDays(activeDays),
        updatedAt: new Date(),
      })
      .where(and(eq(progressRules.id, id), eq(progressRules.userId, userId)))
      .returning()
    revalidatePath('/progress')
    return { success: true, rule }
  },
)

export const toggleRuleActive = mutationAction([uuid, z.boolean()], async ({ userId }, id, active) => {
  await db
    .update(progressRules)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(progressRules.id, id), eq(progressRules.userId, userId)))
  revalidatePath('/progress')
  return { success: true }
})

export const deleteRule = mutationAction([uuid], async ({ userId }, id) => {
  // Soft-delete: archive instead of dropping the row, so the days this rule was
  // already in effect (and its completions) stay intact. It leaves the rules list
  // but still counts toward past days.
  await db
    .update(progressRules)
    .set({ archivedAt: new Date(), active: false, updatedAt: new Date() })
    .where(and(eq(progressRules.id, id), eq(progressRules.userId, userId)))
  revalidatePath('/progress')
  return { success: true }
})

export const reorderRules = mutationAction([uuidArray], async ({ userId }, orderedIds) => {
  await Promise.all(
    orderedIds.map((id, i) =>
      db
        .update(progressRules)
        .set({ sortOrder: i })
        .where(and(eq(progressRules.id, id), eq(progressRules.userId, userId))),
    ),
  )
  revalidatePath('/progress')
  return { success: true }
})

export const getDayProgress = authedAction([dateKey], async ({ userId }, day): Promise<DayProgress> => {
  const { timezone } = await readGlobalSettings()
  const today = dayKeyInTz(new Date(), timezone)

  const [ruleRows, completions, checkin, hasTrades] = await Promise.all([
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
  ])

  const lifecycles = ruleRows.map(toLifecycle(timezone))
  // A logged row means: soft = habit done, hard = rule violated.
  const logged = new Set(completions.map((c) => c.ruleId))
  const checkedIn = checkin?.checkedIn ?? false
  const inScope = dayInScope({ hasTrades, checkedIn, hasLoggedRules: logged.size > 0 })
  // A check-in only counts as a no-trade clean day while the day has no trades;
  // adding a trade later auto-negates it (hasTrades wins), with no DB write needed.
  const cleanNoTrade = isCleanNoTrade(checkedIn, hasTrades)
  const score = computeDayScore(day, today, lifecycles, logged, inScope, cleanNoTrade)

  // Show the rules that were in effect on this specific day (not today's set),
  // preserving sort order. `completed` is the good state (see DayRule).
  const inEffect = ruleIdsInEffectOn(day, today, lifecycles)
  const dayRules: DayRule[] = ruleRows
    .filter((r) => inEffect.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.ruleType,
      completed: r.ruleType === 'hard' ? !logged.has(r.id) : logged.has(r.id),
    }))

  return {
    date: day,
    note: checkin?.note ?? '',
    checkedIn,
    hasTrades,
    status: score.status,
    rules: dayRules,
    hardTotal: score.hardTotal,
    hardViolations: score.hardViolations,
    softTotal: score.softTotal,
    softDone: score.softDone,
    completedCount: score.softDone,
    totalCount: score.softTotal,
    anyRules: ruleRows.some((r) => r.archivedAt === null),
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

    const rule = await db.query.progressRules.findFirst({
      where: and(eq(progressRules.id, ruleId), eq(progressRules.userId, userId)),
      columns: { id: true, activeDays: true, ruleType: true, createdAt: true, archivedAt: true, active: true },
    })
    if (!rule) throw new NotFoundError(t('errors.rule.notFound'))
    const life = toLifecycle(timezone)(rule)
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
      await db.delete(ruleCompletions).where(and(eq(ruleCompletions.ruleId, ruleId), eq(ruleCompletions.date, day)))
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
      createdAt: progressRules.createdAt,
      archivedAt: progressRules.archivedAt,
      active: progressRules.active,
      activeDays: progressRules.activeDays,
    })
    .from(progressRules)
    .where(eq(progressRules.userId, userId))

  const toLife = toLifecycle(timezone)
  const softInEffect = ruleRows.filter((r) => r.ruleType === 'soft' && ruleInEffectOn(day, today, toLife(r)))
  if (softInEffect.length === 0) return { success: true, count: 0 }

  await db
    .insert(ruleCompletions)
    .values(softInEffect.map((r) => ({ userId, ruleId: r.id, date: day })))
    .onConflictDoNothing({ target: [ruleCompletions.ruleId, ruleCompletions.date] })

  revalidatePath('/progress')
  revalidatePath(`/progress/${day}`)
  return { success: true, count: softInEffect.length }
})

const NOTE_MAX = 8_000_000

export const getDailyNote = authedAction([dateKey], async ({ userId }, day): Promise<string> => {
  const row = await db.query.dailyCheckins.findFirst({
    where: and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, day)),
    columns: { note: true },
  })
  return row?.note ?? ''
})

export const setDayNote = mutationAction([dateKey, z.string()], async ({ userId }, day, note) => {
  const text = note.slice(0, NOTE_MAX)

  await db
    .insert(dailyCheckins)
    .values({ userId, date: day, note: text })
    .onConflictDoUpdate({
      target: [dailyCheckins.userId, dailyCheckins.date],
      set: { note: text, updatedAt: new Date() },
    })
  revalidatePath('/progress')
  revalidatePath(`/progress/${day}`)
  return { success: true }
})

// Explicitly mark (or unmark) a day as reviewed. This puts an otherwise
// trade-less day into scope so a disciplined "no-trade" day can still score.
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

export const getProgressCalendar = authedAction(
  [yearSchema, monthSchema],
  async ({ userId }, year, month): Promise<ProgressCalendarData> => {
    const { timezone } = await readGlobalSettings()
    const today = dayKeyInTz(new Date(), timezone)
    const prefix = `${year}-${String(month).padStart(2, '0')}`

    const firstDay = `${prefix}-01`
    const lastDay = `${prefix}-31`
    const [ruleRows, comps, checkins, tradeDays] = await Promise.all([
      db.select().from(progressRules).where(eq(progressRules.userId, userId)),
      db
        .select({ date: ruleCompletions.date, ruleId: ruleCompletions.ruleId })
        .from(ruleCompletions)
        .where(and(eq(ruleCompletions.userId, userId), sql`${ruleCompletions.date} like ${prefix + '%'}`)),
      db
        .select({ date: dailyCheckins.date, note: dailyCheckins.note, checkedIn: dailyCheckins.checkedIn })
        .from(dailyCheckins)
        .where(and(eq(dailyCheckins.userId, userId), sql`${dailyCheckins.date} like ${prefix + '%'}`)),
      tradeDayKeys(userId, timezone, firstDay, lastDay),
    ])

    const lifecycles = ruleRows.map(toLifecycle(timezone))
    const byDate = completionsByDate(comps)
    const noteSet = new Set(checkins.filter((c) => c.note && c.note.trim()).map((c) => c.date))
    const checkedInSet = new Set(checkins.filter((c) => c.checkedIn).map((c) => c.date))

    const dates = new Set<string>([...byDate.keys(), ...noteSet, ...checkedInSet, ...tradeDays])
    const days: ProgressCalendarCell[] = [...dates]
      .sort()
      .map((date) => buildCell(date, today, lifecycles, byDate, noteSet, checkedInSet, tradeDays))

    const scoredDays = days.filter((d) => d.status !== 'none')
    const ratioDays = scoredDays.filter((d) => d.softTotal > 0)
    return {
      year,
      month,
      days,
      activeRules: expectedRulesOn(today, today, lifecycles),
      monthPerfectDays: days.filter((d) => d.status === 'green').length,
      monthLoggedDays: scoredDays.length,
      monthAvgRatio: ratioDays.length ? ratioDays.reduce((a, d) => a + d.ratio, 0) / ratioDays.length : 0,
    }
  },
)

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
): ProgressCalendarCell {
  const logged = byDate.get(date) ?? new Set<string>()
  const inScope = dayInScope({
    hasTrades: tradeDays.has(date),
    checkedIn: checkedInSet.has(date),
    hasLoggedRules: logged.size > 0,
  })
  const cleanNoTrade = isCleanNoTrade(checkedInSet.has(date), tradeDays.has(date))
  const score = computeDayScore(date, today, lifecycles, logged, inScope, cleanNoTrade)
  return {
    date,
    status: score.status,
    cleanNoTrade,
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

  const windowStart = shiftDay(today, -365)
  // Trade P&L rows over the window (±1 day padding so tz offsets never clip a boundary
  // day), used to bucket each trading day's net P&L by discipline status below.
  const pnlFromUtc = new Date(`${shiftDay(windowStart, -1)}T00:00:00.000Z`)
  const pnlToUtc = new Date(`${shiftDay(today, 2)}T00:00:00.000Z`)
  const [ruleRows, completions, checkins, tradeDays, tradePnlRows] = await Promise.all([
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
      .select({ date: dailyCheckins.date, checkedIn: dailyCheckins.checkedIn })
      .from(dailyCheckins)
      .where(and(eq(dailyCheckins.userId, userId), gte(dailyCheckins.date, windowStart))),
    tradeDayKeys(userId, timezone, windowStart, today),
    db
      .select({ e: trades.entryDatetime, p: trades.netPnl, risk: trades.riskAmount })
      .from(trades)
      .where(and(eq(trades.userId, userId), gte(trades.entryDatetime, pnlFromUtc), lt(trades.entryDatetime, pnlToUtc))),
  ])

  // Net P&L per calendar day (user tz), plus per-day R-multiple summed over trades
  // that actually carry a risk (R = pnl / riskAmount) — the same convention the
  // calendar uses. Days with no risked trade have no R and are tracked separately so
  // an unrisked day never drags the R average toward 0.
  const dayPnl = new Map<string, number>()
  const dayR = new Map<string, number>()
  for (const r of tradePnlRows) {
    if (!r.e) continue
    const key = dayKeyInTz(r.e, timezone)
    const pnl = Number(r.p ?? 0)
    dayPnl.set(key, (dayPnl.get(key) ?? 0) + pnl)
    const risk = Number(r.risk ?? 0)
    if (risk > 0) dayR.set(key, (dayR.get(key) ?? 0) + pnl / risk)
  }

  const lifecycles = ruleRows.map(toLifecycle(timezone))
  const liveRules = ruleRows.filter((r) => r.archivedAt === null) // listed rules → per-rule breakdown
  const byDate = completionsByDate(completions)
  const checkedInSet = new Set(checkins.filter((c) => c.checkedIn).map((c) => c.date))

  const inScopeOf = (date: string) =>
    dayInScope({
      hasTrades: tradeDays.has(date),
      checkedIn: checkedInSet.has(date),
      hasLoggedRules: (byDate.get(date)?.size ?? 0) > 0,
    })
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
    )
    scoreCache.set(date, s)
    return s
  }

  // — Clean streak: consecutive GREEN *scheduled* days. A day on which no rule was
  //   in effect (weekends outside a rule's activeDays, or before any rule existed)
  //   is NEUTRAL — it's skipped, so it neither extends nor breaks the run. Among the
  //   days that did expect a rule, a yellow, a red, or a no-record day breaks it.
  //   Today gets grace while it's still unlogged. This stops an ordinary non-trading
  //   day off from silently resetting the streak. —
  const statusOf = (date: string) => scoreOf(date).status
  const scheduledOn = (date: string) => expectedRulesOn(date, today, lifecycles) > 0

  // Current clean streak: walk back up to a year; the pure helper skips unscheduled
  // days and grants today grace while it's unlogged.
  const currentStreak = currentCleanStreak(
    [...Array(366)].map((_, i) => shiftDay(today, -i)),
    statusOf,
    scheduledOn,
  )

  const yearPrefix = `${today.slice(0, 4)}-`
  const inScopeDates = [...new Set([...byDate.keys(), ...checkedInSet, ...tradeDays])].sort()

  // Clean-days card, scoped to the current calendar year so it matches the heatmap
  // header (which shows the selected year), not a rolling 12 months.
  let greenDaysTotal = 0
  for (const date of inScopeDates) {
    if (date.startsWith(yearPrefix) && statusOf(date) === 'green') greenDaysTotal += 1
  }

  // Best clean streak, scoped to the current year so it matches the heatmap the user
  // is looking at. The year scan can't see a live streak that reaches back across the
  // New Year, so guarantee best >= current (never "current 40 > best 35").
  const yearDays: string[] = []
  for (let cursor = `${today.slice(0, 4)}-01-01`; cursor <= today; cursor = shiftDay(cursor, 1)) yearDays.push(cursor)
  let bestStreak = bestCleanStreak(yearDays, statusOf, scheduledOn)
  if (currentStreak > bestStreak) bestStreak = currentStreak

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

  // The trend LINE plots all 30 calendar days for shape (an unmeasured day charts at
  // 0 with a "none" status). The headline AVERAGE counts only days that were in scope,
  // had a rule scheduled, and weren't a no-trade check-in — so an ordinary day off, or
  // a deliberate sat-out day, never drags the number toward 0.
  const trend: ProgressStats['trend'] = []
  let sumRatio = 0
  let loggedDays30 = 0
  for (let i = 29; i >= 0; i--) {
    const date = shiftDay(today, -i)
    const s = scoreOf(date)
    const scheduled = scheduledOn(date)
    trend.push({
      date,
      // No rule scheduled → null (a bridged gap); scheduled → the real number,
      // including a 0 for a scheduled day you never logged.
      ratio: scheduled ? disciplineOf(date) : null,
      scheduled,
      completed: s.softDone,
      total: s.softTotal,
      status: s.status,
      hardViolations: s.hardViolations,
      cleanNoTrade: s.cleanNoTrade,
    })
    if (s.inScope && scheduled && !cleanNoTradeOn(date)) {
      sumRatio += disciplineOf(date)
      loggedDays30 += 1
    }
  }
  const avgDiscipline30 = loggedDays30 ? sumRatio / loggedDays30 : 0

  // Per-rule consistency is measured only over TRACKED days — days you actually
  // traded or checked in AND the rule was in effect. This keeps hard and soft
  // symmetric: both are "of the days you were active, how often did you comply?"
  // (soft = habit done, hard = rule respected). It avoids the phantom-denominator
  // asymmetry where soft started near 0 and hard near 100 because of untracked days.
  const last30 = [...Array(30)].map((_, i) => shiftDay(today, -i)).filter(inScopeOf)
  const lifeById = new Map(lifecycles.map((l) => [l.id, l]))
  const perRule: RuleStat[] = liveRules
    .map((r): RuleStat => {
      const life = lifeById.get(r.id)
      let tracked = 0
      let good = 0
      for (const date of last30) {
        if (life && !ruleInEffectOn(date, today, life)) continue
        const logged = byDate.get(date)?.has(r.id) ?? false
        if (r.ruleType === 'hard') {
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
      return {
        id: r.id,
        name: r.name,
        type: r.ruleType,
        completed: good,
        tracked,
        rate: tracked > 0 ? good / tracked : 0,
      }
    })
    // Rules with no tracked days yet sink to the bottom (they carry no signal);
    // among the rest, most consistent first (ties broken by name for stability).
    .sort((a, b) => Number(b.tracked > 0) - Number(a.tracked > 0) || b.rate - a.rate || a.name.localeCompare(b.name))

  // By-weekday average over the last 12 weeks, counting only IN-SCOPE, SCHEDULED,
  // non-check-in days. Empty days off no longer sit in the denominator as 0% and
  // flatten the bars — a weekday you never trade simply has fewer samples.
  const wdSum = new Array(7).fill(0)
  const wdCount = new Array(7).fill(0)
  for (let i = 0; i < 84; i++) {
    const date = shiftDay(today, -i)
    if (!scheduledOn(date) || cleanNoTradeOn(date) || !scoreOf(date).inScope) continue
    const [y, m, d] = date.split('-').map(Number)
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    wdSum[dow] += disciplineOf(date)
    wdCount[dow] += 1
  }
  // Which weekdays any live rule actually schedules (ISO 1=Mon…7=Sun) — lets the UI
  // tell "scheduled but no samples yet" apart from "no rule ever runs this weekday".
  const scheduledWeekdays = new Set<number>()
  for (const r of liveRules) for (const iso of r.activeDays) scheduledWeekdays.add(iso)
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
  const performance = bucketDayPerformance(dayPnl, dayR, (date) => scoreOf(date).status)

  const todayScore = scoreOf(today)
  return {
    activeRules: expectedRulesOn(today, today, lifecycles),
    currentStreak,
    bestStreak,
    greenDaysTotal,
    avgDiscipline30,
    loggedDays30,
    todayStatus: todayScore.status,
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
  const prefix = `${year}-`

  const [ruleRows, comps, checkins, tradeDays] = await Promise.all([
    db.select().from(progressRules).where(eq(progressRules.userId, userId)),
    db
      .select({ date: ruleCompletions.date, ruleId: ruleCompletions.ruleId })
      .from(ruleCompletions)
      .where(and(eq(ruleCompletions.userId, userId), sql`${ruleCompletions.date} like ${prefix + '%'}`)),
    db
      .select({ date: dailyCheckins.date, note: dailyCheckins.note, checkedIn: dailyCheckins.checkedIn })
      .from(dailyCheckins)
      .where(and(eq(dailyCheckins.userId, userId), sql`${dailyCheckins.date} like ${prefix + '%'}`)),
    tradeDayKeys(userId, timezone, `${year}-01-01`, `${year}-12-31`),
  ])

  const lifecycles = ruleRows.map(toLifecycle(timezone))
  const byDate = completionsByDate(comps)
  const noteSet = new Set(checkins.filter((c) => c.note && c.note.trim()).map((c) => c.date))
  const checkedInSet = new Set(checkins.filter((c) => c.checkedIn).map((c) => c.date))
  const dates = new Set<string>([...byDate.keys(), ...noteSet, ...checkedInSet, ...tradeDays])

  const days: ProgressCalendarCell[] = [...dates]
    .sort()
    .map((date) => buildCell(date, today, lifecycles, byDate, noteSet, checkedInSet, tradeDays))

  const scoredDays = days.filter((d) => d.status !== 'none')
  // Average soft completion over days that had soft habits, EXCLUDING no-trade
  // check-in days (their soft tallies are not applicable and are dropped everywhere).
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
    (d) => expectedRulesOn(d, today, lifecycles) > 0,
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

export const getTodayKey = authedAction([], async (): Promise<string> => todayKey())
