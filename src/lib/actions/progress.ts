'use server'

import { auth } from '@clerk/nextjs/server'
import { db, progressRules, ruleCompletions, dailyCheckins } from '@/lib/db'
import { and, eq, sql, gte, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { t } from '@/i18n'
import { readGlobalSettings } from '@/lib/global-settings'
import { dayKeyInTz, shiftDay } from '@/lib/date-tz'
import { expectedRulesOn, ruleIdsInEffectOn, type RuleLifecycle } from '@/lib/progress-compute'

async function getUserId(): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')
  return userId
}

async function todayKey(): Promise<string> {
  const { timezone } = await readGlobalSettings()
  return dayKeyInTz(new Date(), timezone)
}

// Project a rule row onto its effective-dated lifecycle in the user's timezone.
function toLifecycle(tz: string | null) {
  return (r: { id: string; createdAt: Date; archivedAt: Date | null; active: boolean }): RuleLifecycle => ({
    id: r.id,
    createdDay: dayKeyInTz(r.createdAt, tz),
    archivedDay: r.archivedAt ? dayKeyInTz(r.archivedAt, tz) : null,
    active: r.active,
  })
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const dateSchema = z.string().regex(DATE_RE)

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProgressRule {
  id: string
  name: string
  description: string | null
  sortOrder: number
  active: boolean
}

export interface DayRule {
  id: string
  name: string
  description: string | null
  completed: boolean
}

export interface DayProgress {
  date: string
  note: string
  rules: DayRule[]
  completedCount: number
  totalCount: number
}

export interface ProgressCalendarCell {
  date: string
  completed: number
  total: number
  ratio: number // 0..1
  perfect: boolean
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
  completed: number
  rate: number
}

export interface ProgressStats {
  activeRules: number
  currentStreak: number
  bestStreak: number
  perfectDaysTotal: number
  avgDiscipline30: number // 0..1
  loggedDays30: number
  todayRatio: number // 0..1
  todayCompleted: number
  todayTotal: number
  trend: { date: string; ratio: number; completed: number; total: number }[]
  perRule: RuleStat[]
  weekday: { dow: number; ratio: number }[] // 0=Sun … 6=Sat
}

// ─── Validation ─────────────────────────────────────────────────────────────────

const ruleSchema = z.object({
  name: z.string().trim().min(1, t('validation.nameRequired')).max(80),
  description: z.string().trim().max(280).optional().nullable(),
})

export async function getRules(): Promise<ProgressRule[]> {
  const userId = await getUserId()
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
    sortOrder: r.sortOrder,
    active: r.active,
  }))
}

// ─── Rules: CRUD ──────────────────────────────────────────────────────────────

export async function createRule(input: z.infer<typeof ruleSchema>) {
  const userId = await getUserId()
  const { name, description } = ruleSchema.parse(input)

  const maxRow = await db
    .select({ m: sql<number>`coalesce(max(${progressRules.sortOrder}), -1)`.mapWith(Number) })
    .from(progressRules)
    .where(eq(progressRules.userId, userId))
  const nextOrder = (maxRow[0]?.m ?? -1) + 1

  const [rule] = await db
    .insert(progressRules)
    .values({ userId, name, description: description || null, sortOrder: nextOrder })
    .returning()
  revalidatePath('/progress')
  return { success: true, rule }
}

export async function updateRule(id: string, input: z.infer<typeof ruleSchema>) {
  const userId = await getUserId()
  const { name, description } = ruleSchema.parse(input)
  const [rule] = await db
    .update(progressRules)
    .set({ name, description: description || null, updatedAt: new Date() })
    .where(and(eq(progressRules.id, id), eq(progressRules.userId, userId)))
    .returning()
  revalidatePath('/progress')
  return { success: true, rule }
}

export async function toggleRuleActive(id: string, active: boolean) {
  const userId = await getUserId()
  await db
    .update(progressRules)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(progressRules.id, id), eq(progressRules.userId, userId)))
  revalidatePath('/progress')
  return { success: true }
}

export async function deleteRule(id: string) {
  const userId = await getUserId()
  // Soft-delete: archive instead of dropping the row, so the days this rule was
  // already in effect (and its completions) stay intact. It leaves the rules list
  // but still counts toward past days.
  await db
    .update(progressRules)
    .set({ archivedAt: new Date(), active: false, updatedAt: new Date() })
    .where(and(eq(progressRules.id, id), eq(progressRules.userId, userId)))
  revalidatePath('/progress')
  return { success: true }
}

export async function reorderRules(orderedIds: string[]) {
  const userId = await getUserId()
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
}

export async function getDayProgress(date: string): Promise<DayProgress> {
  const userId = await getUserId()
  const day = dateSchema.parse(date)
  const { timezone } = await readGlobalSettings()
  const today = dayKeyInTz(new Date(), timezone)

  const [ruleRows, completions, checkin] = await Promise.all([
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
  ])

  // Show the rules that were in effect on this specific day (not today's set).
  const inEffect = ruleIdsInEffectOn(day, today, ruleRows.map(toLifecycle(timezone)))
  const done = new Set(completions.map((c) => c.ruleId))
  const dayRules: DayRule[] = ruleRows
    .filter((r) => inEffect.has(r.id))
    .map((r) => ({ id: r.id, name: r.name, description: r.description, completed: done.has(r.id) }))

  return {
    date: day,
    note: checkin?.note ?? '',
    rules: dayRules,
    completedCount: dayRules.filter((r) => r.completed).length,
    totalCount: dayRules.length,
  }
}

export async function toggleRuleCompletion(ruleId: string, date: string, completed: boolean) {
  const userId = await getUserId()
  const day = dateSchema.parse(date)

  if (day !== (await todayKey())) {
    throw new Error('Rules can only be tracked for the current day')
  }

  const rule = await db.query.progressRules.findFirst({
    where: and(eq(progressRules.id, ruleId), eq(progressRules.userId, userId)),
    columns: { id: true },
  })
  if (!rule) throw new Error('Rule not found')

  if (completed) {
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
}

const NOTE_MAX = 8_000_000

export async function getDailyNote(date: string): Promise<string> {
  const userId = await getUserId()
  const day = dateSchema.parse(date)
  const row = await db.query.dailyCheckins.findFirst({
    where: and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.date, day)),
    columns: { note: true },
  })
  return row?.note ?? ''
}

export async function setDayNote(date: string, note: string) {
  const userId = await getUserId()
  const day = dateSchema.parse(date)
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
}

export async function getProgressCalendar(year: number, month: number): Promise<ProgressCalendarData> {
  const userId = await getUserId()
  const { timezone } = await readGlobalSettings()
  const today = dayKeyInTz(new Date(), timezone)
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  const [ruleRows, comps, notes] = await Promise.all([
    db.select().from(progressRules).where(eq(progressRules.userId, userId)),
    db
      .select({ date: ruleCompletions.date, ruleId: ruleCompletions.ruleId })
      .from(ruleCompletions)
      .where(and(eq(ruleCompletions.userId, userId), sql`${ruleCompletions.date} like ${prefix + '%'}`)),
    db
      .select({ date: dailyCheckins.date })
      .from(dailyCheckins)
      .where(and(eq(dailyCheckins.userId, userId), sql`${dailyCheckins.date} like ${prefix + '%'}`)),
  ])

  const lifecycles = ruleRows.map(toLifecycle(timezone))
  const byDate = completionsByDate(comps)
  const noteSet = new Set(notes.map((n) => n.date))

  const dates = new Set<string>([...byDate.keys(), ...noteSet])
  const days: ProgressCalendarCell[] = [...dates]
    .sort()
    .map((date) => buildCell(date, today, lifecycles, byDate, noteSet))

  const ratioDays = days.filter((d) => d.completed > 0)
  return {
    year,
    month,
    days,
    activeRules: expectedRulesOn(today, today, lifecycles),
    monthPerfectDays: days.filter((d) => d.perfect).length,
    monthLoggedDays: days.length,
    monthAvgRatio: ratioDays.length ? ratioDays.reduce((a, d) => a + d.ratio, 0) / ratioDays.length : 0,
  }
}

// Build one calendar cell: completed counts only rules that were in effect that day,
// total is the rule count in effect that day (the historically correct denominator).
function buildCell(
  date: string,
  today: string,
  lifecycles: RuleLifecycle[],
  byDate: Map<string, Set<string>>,
  noteSet: Set<string>,
): ProgressCalendarCell {
  const inEffect = ruleIdsInEffectOn(date, today, lifecycles)
  const total = inEffect.size
  let completed = 0
  for (const id of byDate.get(date) ?? []) if (inEffect.has(id)) completed++
  const ratio = total > 0 ? Math.min(1, completed / total) : 0
  return { date, completed, total, ratio, perfect: total > 0 && completed >= total, hasNote: noteSet.has(date) }
}

export async function getProgressStats(): Promise<ProgressStats> {
  const userId = await getUserId()
  const { timezone } = await readGlobalSettings()
  const today = dayKeyInTz(new Date(), timezone)

  const windowStart = shiftDay(today, -365)
  const [ruleRows, completions] = await Promise.all([
    db
      .select()
      .from(progressRules)
      .where(eq(progressRules.userId, userId))
      .orderBy(progressRules.sortOrder, progressRules.name),
    db
      .select({ ruleId: ruleCompletions.ruleId, date: ruleCompletions.date })
      .from(ruleCompletions)
      .where(and(eq(ruleCompletions.userId, userId), gte(ruleCompletions.date, windowStart))),
  ])

  const lifecycles = ruleRows.map(toLifecycle(timezone))
  const liveRules = ruleRows.filter((r) => r.archivedAt === null) // listed rules → per-rule breakdown
  const byDate = completionsByDate(completions)

  // Each day is measured against the rules in effect *that* day.
  const expectedOn = (date: string) => expectedRulesOn(date, today, lifecycles)
  const completedOn = (date: string) => {
    const set = byDate.get(date)
    if (!set) return 0
    const inEffect = ruleIdsInEffectOn(date, today, lifecycles)
    let n = 0
    for (const id of set) if (inEffect.has(id)) n++
    return n
  }
  const isPerfect = (date: string) => {
    const total = expectedOn(date)
    return total > 0 && completedOn(date) >= total
  }

  // — Streaks (perfect days only) —
  const perfectDates = new Set([...byDate.keys()].filter(isPerfect))
  const perfectDaysTotal = perfectDates.size

  let currentStreak = 0
  {
    let cursor = isPerfect(today) ? today : shiftDay(today, -1)
    while (perfectDates.has(cursor)) {
      currentStreak += 1
      cursor = shiftDay(cursor, -1)
    }
  }

  let bestStreak = 0
  if (perfectDates.size > 0) {
    const sorted = [...perfectDates].sort()
    let run = 1
    bestStreak = 1
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === shiftDay(sorted[i - 1], 1)) run += 1
      else run = 1
      if (run > bestStreak) bestStreak = run
    }
  }

  const trend: ProgressStats['trend'] = []
  let sumRatio = 0
  let loggedDays30 = 0
  for (let i = 29; i >= 0; i--) {
    const date = shiftDay(today, -i)
    const total = expectedOn(date)
    const completed = completedOn(date)
    const ratio = total > 0 ? Math.min(1, completed / total) : 0
    trend.push({ date, ratio, completed, total })
    sumRatio += ratio
    if (completed > 0) loggedDays30 += 1
  }
  const avgDiscipline30 = trend.length ? sumRatio / trend.length : 0

  const last30 = new Set<string>()
  for (let i = 0; i < 30; i++) last30.add(shiftDay(today, -i))
  const perRule: RuleStat[] = liveRules.map((r) => {
    let completed = 0
    for (const [date, set] of byDate) {
      if (last30.has(date) && set.has(r.id)) completed += 1
    }
    return { id: r.id, name: r.name, completed, rate: completed / 30 }
  })

  const wdSum = new Array(7).fill(0)
  const wdCount = new Array(7).fill(0)
  for (let i = 0; i < 84; i++) {
    const date = shiftDay(today, -i)
    const [y, m, d] = date.split('-').map(Number)
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    const total = expectedOn(date)
    wdSum[dow] += total > 0 ? Math.min(1, completedOn(date) / total) : 0
    wdCount[dow] += 1
  }
  const weekday = wdSum.map((s, dow) => ({ dow, ratio: wdCount[dow] ? s / wdCount[dow] : 0 }))

  const todayTotal = expectedOn(today)
  const todayCompleted = completedOn(today)
  return {
    activeRules: todayTotal,
    currentStreak,
    bestStreak,
    perfectDaysTotal,
    avgDiscipline30,
    loggedDays30,
    todayRatio: todayTotal > 0 ? Math.min(1, todayCompleted / todayTotal) : 0,
    todayCompleted,
    todayTotal,
    trend,
    perRule,
    weekday,
  }
}

export interface ProgressYearData {
  year: number
  activeRules: number
  days: ProgressCalendarCell[]
  perfectDays: number
  loggedDays: number
  avgRatio: number
}

export async function getProgressYears(): Promise<number[]> {
  const userId = await getUserId()
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
}

export async function getProgressYear(year: number): Promise<ProgressYearData> {
  const userId = await getUserId()
  const { timezone } = await readGlobalSettings()
  const today = dayKeyInTz(new Date(), timezone)
  const prefix = `${year}-`

  const [ruleRows, comps, notes] = await Promise.all([
    db.select().from(progressRules).where(eq(progressRules.userId, userId)),
    db
      .select({ date: ruleCompletions.date, ruleId: ruleCompletions.ruleId })
      .from(ruleCompletions)
      .where(and(eq(ruleCompletions.userId, userId), sql`${ruleCompletions.date} like ${prefix + '%'}`)),
    db
      .select({ date: dailyCheckins.date })
      .from(dailyCheckins)
      .where(and(eq(dailyCheckins.userId, userId), sql`${dailyCheckins.date} like ${prefix + '%'}`)),
  ])

  const lifecycles = ruleRows.map(toLifecycle(timezone))
  const byDate = completionsByDate(comps)
  const noteSet = new Set(notes.map((n) => n.date))
  const dates = new Set<string>([...byDate.keys(), ...noteSet])

  const days: ProgressCalendarCell[] = [...dates]
    .sort()
    .map((date) => buildCell(date, today, lifecycles, byDate, noteSet))

  const ratioDays = days.filter((d) => d.completed > 0)
  return {
    year,
    activeRules: expectedRulesOn(today, today, lifecycles),
    days,
    perfectDays: days.filter((d) => d.perfect).length,
    loggedDays: days.length,
    avgRatio: ratioDays.length ? ratioDays.reduce((a, d) => a + d.ratio, 0) / ratioDays.length : 0,
  }
}

export async function getTodayKey(): Promise<string> {
  return todayKey()
}
