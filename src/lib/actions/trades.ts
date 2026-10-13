'use server'

import { db, trades, tags, tradeTags, accounts, strategies } from '@/lib/db'
import { eq, ne, and, or, desc, asc, gte, lte, ilike, inArray, count, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import type { TradeFilters } from '@/types'
import { deriveTradeFromExecutions } from '@/lib/trade-pnl'
import { readGlobalFilters } from '@/lib/global-filters'
import { readGlobalSettings } from '@/lib/global-settings'
import { generalConditions } from './filter-sql'
import { getDemoTrades } from '@/lib/demo/trades'
import { realizedR } from '@/lib/r-multiple'
import { userHasTrades } from '@/lib/demo/detect'
import { z } from 'zod'
import { uuid, uuidArray } from '@/lib/validation'
import { authedAction, mutationAction } from '@/lib/safe-action'
import { NotFoundError, ValidationError } from '@/lib/action-errors'
import { t } from '@/i18n'
import { sanitizeRichTextValue } from '@/lib/rich-text'
import { cleanupOrphanedImages, tradeImageKeys } from '@/lib/orphan-images'
import { CRITERIA_WINDOW_HOURS } from '@/lib/adherence'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const journalSchema = z.object({
  notes: z.string().max(8_000_000).nullable().optional().transform(sanitizeRichTextValue),
  rating: z.number().min(0).max(5).multipleOf(0.5).nullable().optional(),
})

export const updateTradeJournal = mutationAction([uuid, journalSchema], async ({ userId }, id, v) => {
  const set: Partial<{ notes: string | null; rating: number | null; updatedAt: Date }> = {
    updatedAt: new Date(),
  }
  if (v.notes !== undefined) set.notes = v.notes
  if (v.rating !== undefined) set.rating = v.rating === 0 ? null : v.rating

  const previousKeys = v.notes !== undefined ? await tradeImageKeys(userId, eq(trades.id, id)) : []

  const [updated] = await db
    .update(trades)
    .set(set)
    .where(and(eq(trades.id, id), eq(trades.userId, userId)))
    .returning({ id: trades.id })
  if (!updated) throw new NotFoundError(t('errors.trade.notFound'))

  await cleanupOrphanedImages(userId, previousKeys)

  revalidatePath('/trades')
  return { success: true }
})

// ─── Risk plan: profit targets + stop losses (ticks/qty) from detail ─────────────

const legSchema = z.object({
  ticks: z.number().min(0),
  qty: z.number().min(0),
})

const riskPlanSchema = z.object({
  tickValue: z.number().min(0),
  profitTargets: z.array(legSchema).max(20),
  stopLosses: z.array(legSchema).max(20),
})

export const updateTradeRiskPlan = mutationAction([uuid, riskPlanSchema], async ({ userId }, id, plan) => {
  const existing = await db.query.trades.findFirst({
    where: and(eq(trades.id, id), eq(trades.userId, userId)),
  })
  if (!existing) throw new NotFoundError(t('errors.trade.notFound'))

  const targetUsd = plan.profitTargets.reduce((s, l) => s + l.ticks * l.qty * plan.tickValue, 0)
  const riskUsd = plan.stopLosses.reduce((s, l) => s + l.ticks * l.qty * plan.tickValue, 0)
  const rr = riskUsd > 0 ? targetUsd / riskUsd : null

  const prevExtra = (existing.extra as Record<string, unknown> | null) ?? {}
  const nextExtra = { ...prevExtra, riskPlan: plan }

  await db
    .update(trades)
    .set({
      extra: nextExtra,
      riskAmount: riskUsd > 0 ? riskUsd.toString() : null,
      riskRewardRatio: rr !== null ? rr.toFixed(4) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(trades.id, id), eq(trades.userId, userId)))

  revalidatePath('/trades')
  revalidatePath(`/trades/${id}`)
  return { success: true, targetUsd, riskUsd, rr }
})

const execEditSchema = z.object({
  datetime: z.string().min(1),
  side: z.enum(['buy', 'sell', 'dividend']),
  quantity: z.coerce.number().positive(),
  price: z.coerce.number().positive(),
  commission: z.coerce.number().min(0).default(0),
  fee: z.coerce.number().min(0).default(0),
})

const execUpdateSchema = z.object({
  contractMultiplier: z.coerce.number().min(0).optional(),
  executions: z.array(execEditSchema).min(1),
})

export const updateTradeExecutions = mutationAction([uuid, execUpdateSchema], async ({ userId }, tradeId, v) => {
  const existing = await db.query.trades.findFirst({
    where: and(eq(trades.id, tradeId), eq(trades.userId, userId)),
  })
  if (!existing) throw new NotFoundError(t('errors.trade.notFound'))

  for (const e of v.executions) {
    if (isNaN(new Date(e.datetime).getTime())) throw new ValidationError(t('errors.execution.invalidDate'))
  }

  const prevExtra = (existing.extra as Record<string, unknown> | null) ?? {}
  const storedMult = Number(prevExtra.contractMultiplier)
  const mult = v.contractMultiplier && v.contractMultiplier > 0 ? v.contractMultiplier : storedMult > 0 ? storedMult : 1

  const d = deriveTradeFromExecutions(v.executions, mult)
  if (!d) throw new ValidationError(t('errors.execution.dividendOnly'))
  const execs = d.sorted

  const nextExtra = {
    ...prevExtra,
    executions: execs,
    contractMultiplier: v.contractMultiplier ?? prevExtra.contractMultiplier ?? null,
  }

  await db
    .update(trades)
    .set({
      direction: d.direction,
      status: d.status,
      entryPrice: d.entryPrice.toString(),
      entryQuantity: d.entryQuantity.toString(),
      entryDatetime: d.entryDatetime,
      exitPrice: d.exitPrice?.toString() ?? null,
      exitQuantity: d.exitQuantity > 0 ? d.exitQuantity.toString() : null,
      exitDatetime: d.exitDatetime,
      fees: d.fees.toString(),
      grossPnl: d.grossPnl?.toString() ?? null,
      netPnl: d.netPnl?.toString() ?? null,
      extra: nextExtra,
      updatedAt: new Date(),
    })
    .where(and(eq(trades.id, tradeId), eq(trades.userId, userId)))

  revalidatePath('/trades')
  revalidatePath(`/trades/${tradeId}`)
  revalidatePath('/dashboard')
  revalidatePath('/accounts')
  return { success: true }
})

// ─── Delete trade ─────────────────────────────────────────────────────────────

export const deleteTrade = mutationAction([uuid], async ({ userId }, id) => {
  const keys = await tradeImageKeys(userId, eq(trades.id, id))
  await db.delete(trades).where(and(eq(trades.id, id), eq(trades.userId, userId)))
  await cleanupOrphanedImages(userId, keys)

  revalidatePath('/dashboard')
  revalidatePath('/trades')
  return { success: true }
})

export const deleteTrades = mutationAction([uuidArray], async ({ userId }, ids) => {
  if (ids.length === 0) return { success: true, count: 0 }
  const keys = await tradeImageKeys(userId, inArray(trades.id, ids))
  await db.delete(trades).where(and(eq(trades.userId, userId), inArray(trades.id, ids)))
  await cleanupOrphanedImages(userId, keys)
  revalidatePath('/dashboard')
  revalidatePath('/trades')
  revalidatePath('/accounts')
  return { success: true, count: ids.length }
})

export const addTagToTrades = mutationAction([uuidArray, uuid], async ({ userId }, ids, tagId) => {
  if (ids.length === 0) return { success: true, added: 0 }

  const tag = await db.query.tags.findFirst({
    where: and(eq(tags.id, tagId), eq(tags.userId, userId)),
    columns: { id: true },
  })
  if (!tag) throw new NotFoundError(t('errors.tag.notFound'))

  const owned = await db
    .select({ id: trades.id })
    .from(trades)
    .where(and(eq(trades.userId, userId), inArray(trades.id, ids)))
  const ownedIds = owned.map((o) => o.id)
  if (ownedIds.length === 0) return { success: true, added: 0 }

  const existing = await db
    .select({ tradeId: tradeTags.tradeId })
    .from(tradeTags)
    .where(and(inArray(tradeTags.tradeId, ownedIds), eq(tradeTags.tagId, tagId)))
  const has = new Set(existing.map((e) => e.tradeId))
  const toAdd = ownedIds.filter((id) => !has.has(id)).map((tradeId) => ({ tradeId, tagId }))
  if (toAdd.length > 0) await db.insert(tradeTags).values(toAdd)

  revalidatePath('/trades')
  return { success: true, added: toAdd.length }
})

export const setTradesAccount = mutationAction([uuidArray, uuid], async ({ userId }, ids, accountId) => {
  if (ids.length === 0) return { success: true, count: 0 }

  const acc = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, accountId), eq(accounts.userId, userId)),
    columns: { id: true },
  })
  if (!acc) throw new NotFoundError(t('errors.account.notFound'))

  await db
    .update(trades)
    .set({ accountId, updatedAt: new Date() })
    .where(and(eq(trades.userId, userId), inArray(trades.id, ids)))

  revalidatePath('/trades')
  revalidatePath('/dashboard')
  revalidatePath('/accounts')
  return { success: true, count: ids.length }
})

// ─── Get trades (with filters) ────────────────────────────────────────────────────

// Filters originate from client UI state, so validate the shape before it reaches SQL.
const tradeFiltersSchema = z
  .object({
    search: z.string().optional(),
    direction: z.enum(['long', 'short', 'all']).optional(),
    status: z.enum(['open', 'closed', 'cancelled', 'all']).optional(),
    assetClass: z.string().optional(),
    tagId: z.string().optional(),
    strategyId: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    minPnl: z.number().optional(),
    maxPnl: z.number().optional(),
    review: z.literal('pending').optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(500).optional(),
    // `riskRewardRatio` is the legacy key for the R column (it used to sort by the
    // planned R:R); it is still accepted from old URLs/cookies and treated as `rMultiple`.
    sortBy: z.enum(['entryDatetime', 'netPnl', 'symbol', 'rMultiple', 'riskRewardRatio', 'review']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .default({})

/**
 * Trades with no adherence review at all — none of the three blocks touched, rather than
 * not all three: which blocks *could* be reviewed depends on the criteria live on the
 * trade's day, and reproducing that in SQL would strand trades here forever. Legacy v1
 * rows count as reviewed; they were assessed under the rules of the day.
 */
const NEEDS_REVIEW = sql`(
  -- Past the review window nothing can be recorded any more, so an untouched old trade
  -- is not "to review" — it is closed. Leaving it in would make the queue a list of
  -- work that cannot be done.
  ${trades.createdAt} > now() - interval '${sql.raw(String(CRITERIA_WINDOW_HOURS))} hours'
) and (
  -- Same reason: with no setup named there are no criteria to record. See applicableItems.
  ${trades.strategyId} is not null
) and (
  ${trades.checklistProgress} is null
  or (
    ${trades.checklistProgress}->>'v' = '2'
    and coalesce((${trades.checklistProgress}->'blocks'->'gate'->>'scored')::boolean, false) = false
    and coalesce((${trades.checklistProgress}->'blocks'->'setup'->>'scored')::boolean, false) = false
    and coalesce((${trades.checklistProgress}->'blocks'->'exit'->>'scored')::boolean, false) = false
  )
)`

/**
 * How reviewed a trade is, as a sortable 0–3. Same logic as NEEDS_REVIEW; v1 rows count as
 * 2 (setup and exit existed, gate did not). Ascending puts the most work first.
 */
const REVIEWED_BLOCKS = sql`case
  when ${trades.checklistProgress} is null then 0
  when ${trades.checklistProgress}->>'v' = '2' then
    coalesce((${trades.checklistProgress}->'blocks'->'gate'->>'scored')::boolean, false)::int
    + coalesce((${trades.checklistProgress}->'blocks'->'setup'->>'scored')::boolean, false)::int
    + coalesce((${trades.checklistProgress}->'blocks'->'exit'->>'scored')::boolean, false)::int
  else 2
end`

async function buildTradeConditions(userId: string, filters: TradeFilters) {
  const { direction, status, assetClass, tagId, strategyId, dateFrom, dateTo, minPnl, maxPnl, search, review } = filters

  const conditions = [eq(trades.userId, userId)]

  if (review === 'pending') conditions.push(NEEDS_REVIEW)

  if (direction && direction !== 'all') conditions.push(eq(trades.direction, direction))
  if (status && status !== 'all') conditions.push(eq(trades.status, status))
  if (assetClass && assetClass !== 'all') {
    conditions.push(eq(trades.assetClass, assetClass as (typeof trades.assetClass.enumValues)[number]))
  }
  if (tagId && tagId !== 'all') {
    conditions.push(
      inArray(trades.id, db.select({ id: tradeTags.tradeId }).from(tradeTags).where(eq(tradeTags.tagId, tagId))),
    )
  }
  if (strategyId && strategyId !== 'all') conditions.push(eq(trades.strategyId, strategyId))
  if (dateFrom) conditions.push(gte(trades.entryDatetime, new Date(dateFrom)))
  if (dateTo) conditions.push(lte(trades.entryDatetime, new Date(`${dateTo}T23:59:59.999`)))
  if (minPnl !== undefined && !Number.isNaN(minPnl)) conditions.push(gte(trades.netPnl, minPnl.toString()))
  if (maxPnl !== undefined && !Number.isNaN(maxPnl)) conditions.push(lte(trades.netPnl, maxPnl.toString()))
  if (search) {
    const term = `%${search}%`
    // Match on symbol or the assigned strategy's name (mirrors the search placeholder).
    const strategyMatch = db
      .select({ id: strategies.id })
      .from(strategies)
      .where(and(eq(strategies.userId, userId), ilike(strategies.name, term)))
    conditions.push(or(ilike(trades.symbol, term), inArray(trades.strategyId, strategyMatch))!)
  }

  const gf = await readGlobalFilters()
  const { breakeven } = await readGlobalSettings()
  conditions.push(...generalConditions(gf, { includeStatus: true, breakeven }))
  return conditions
}

export const getFilteredTradeIds = authedAction([tradeFiltersSchema], async ({ userId }, input): Promise<string[]> => {
  const filters = input as TradeFilters
  const conditions = await buildTradeConditions(userId, filters)
  const rows = await db
    .select({ id: trades.id })
    .from(trades)
    .where(and(...conditions))
  return rows.map((r) => r.id)
})

/**
 * How many trades still have no adherence review. Filtered exactly like the list it links
 * to, header filters included — a chip promising twelve that opens three is worse than none.
 */
export const countTradesToReview = authedAction([], async ({ userId }): Promise<number> => {
  const [gf, { breakeven }] = await Promise.all([readGlobalFilters(), readGlobalSettings()])
  const [row] = await db
    .select({ count: count() })
    .from(trades)
    .where(and(eq(trades.userId, userId), NEEDS_REVIEW, ...generalConditions(gf, { includeStatus: true, breakeven })))
  return row?.count ?? 0
})

export interface NextReviewTrade {
  id: string
  symbol: string
  /** How many are still waiting after this one, so the panel can say "3 left". */
  remaining: number
}

/**
 * The next trade waiting for a review, newest first, excluding the one being looked at —
 * so reviewing is a pass rather than a trip back to the list after every trade.
 */
export const getNextTradeToReview = authedAction(
  [z.string().optional()],
  async ({ userId }, currentId): Promise<NextReviewTrade | null> => {
    const [gf, { breakeven }] = await Promise.all([readGlobalFilters(), readGlobalSettings()])
    const where = and(
      eq(trades.userId, userId),
      NEEDS_REVIEW,
      ...(currentId ? [ne(trades.id, currentId)] : []),
      // Only closed trades can be judged on their exit, like every adherence figure.
      eq(trades.status, 'closed'),
      // Same scope as the chip and the list, so "next" stays inside the working set.
      ...generalConditions(gf, { includeStatus: false, breakeven }),
    )
    const [[next], [total]] = await Promise.all([
      db
        .select({ id: trades.id, symbol: trades.symbol })
        .from(trades)
        .where(where)
        .orderBy(desc(trades.entryDatetime))
        .limit(1),
      db.select({ count: count() }).from(trades).where(where),
    ])
    return next ? { id: next.id, symbol: next.symbol, remaining: (total?.count ?? 1) - 1 } : null
  },
)

export const getTradeSymbols = authedAction([], async ({ userId }): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ symbol: trades.symbol })
    .from(trades)
    .where(eq(trades.userId, userId))
    .orderBy(asc(trades.symbol))
  return rows.map((r) => r.symbol)
})

/** True once the user has at least one trade — used to toggle demo/onboarding. */
export const hasAnyTrades = authedAction([], async ({ userId }): Promise<boolean> => {
  return userHasTrades(userId)
})

export const getTrades = authedAction([tradeFiltersSchema], async ({ userId }, filters) => {
  const { page = 1, pageSize = 25, sortBy = 'entryDatetime', sortOrder = 'desc' } = filters

  // New user with no trades: serve the sample dataset (sorted + paginated the
  // same way) so the table shows a realistic preview instead of an empty state.
  if (!(await userHasTrades(userId))) {
    const all = [...getDemoTrades()]
    all.sort((a, b) => {
      if (sortBy === 'rMultiple' || sortBy === 'riskRewardRatio') {
        // Mirror the SQL ordering: trades without an R always sit at the bottom.
        const av = realizedR(a.netPnl, a.riskAmount)
        const bv = realizedR(b.netPnl, b.riskAmount)
        if (av === null && bv === null) return 0
        if (av === null) return 1
        if (bv === null) return -1
        return sortOrder === 'asc' ? av - bv : bv - av
      }
      let cmp: number
      if (sortBy === 'netPnl') cmp = Number(a.netPnl ?? 0) - Number(b.netPnl ?? 0)
      else if (sortBy === 'symbol') cmp = a.symbol.localeCompare(b.symbol)
      // Demo trades carry no review progress, so 'review' falls back to the date.
      else cmp = a.entryDatetime.getTime() - b.entryDatetime.getTime()
      return sortOrder === 'asc' ? cmp : -cmp
    })
    const total = all.length
    const start = (page - 1) * pageSize
    return {
      trades: all.slice(start, start + pageSize).map((t) => ({ ...t, tradeTags: [], screenshots: [], strategy: null })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  const conditions = await buildTradeConditions(userId, filters)

  const orderFn = sortOrder === 'asc' ? asc : desc
  const orderBy =
    sortBy === 'rMultiple' || sortBy === 'riskRewardRatio'
      ? // Realized R-multiple is derived, not stored — sort on the same expression
        // the R filter uses so the column and the filter always agree. Trades with
        // no initial risk have no R, so they are parked at the bottom in both
        // directions instead of heading the list on the first click.
        sql`(${trades.netPnl}::numeric / nullif(${trades.riskAmount}::numeric, 0)) ${sql.raw(sortOrder === 'asc' ? 'asc' : 'desc')} nulls last`
      : sortBy === 'review'
        ? sql`${REVIEWED_BLOCKS} ${sql.raw(sortOrder === 'asc' ? 'asc' : 'desc')}`
        : orderFn(sortBy === 'netPnl' ? trades.netPnl : sortBy === 'symbol' ? trades.symbol : trades.entryDatetime)

  const [rows, totalResult] = await Promise.all([
    db.query.trades.findMany({
      where: and(...conditions),
      // Newest first within a tie, so the review queue stays chronological.
      orderBy: [orderBy, desc(trades.entryDatetime)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      with: {
        tradeTags: { with: { tag: true } },
        screenshots: true,
        strategy: { columns: { id: true, name: true, color: true } },
      },
    }),
    db
      .select({ count: count() })
      .from(trades)
      .where(and(...conditions)),
  ])

  return {
    trades: rows,
    total: totalResult[0].count,
    page,
    pageSize,
    totalPages: Math.ceil(totalResult[0].count / pageSize),
  }
})

// ─── Get single trade ─────────────────────────────────────────────────────────

export const getTradeById = authedAction([uuid], async ({ userId }, id) => {
  const trade = await db.query.trades.findFirst({
    where: and(eq(trades.id, id), eq(trades.userId, userId)),
    with: {
      tradeTags: { with: { tag: true } },
      screenshots: true,
      account: true,
      strategy: { columns: { id: true, name: true, color: true } },
    },
  })

  if (!trade) return null
  return trade
})

// Checklist progress is written per block by `setTradeBlockProgress` in
// lib/actions/adherence — one write covering both blocks could not express "not assessed".
