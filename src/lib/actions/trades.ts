'use server'

import { db, trades, tags, tradeTags, accounts, strategies } from '@/lib/db'
import { eq, and, or, desc, asc, gte, lte, ilike, inArray, count, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { tradeFormSchema, type TradeFilters } from '@/types'
import { calculatePnl, calculateRR } from '@/lib/utils'
import { derivePnl, roundMoney } from '@/lib/trade-pnl'
import { assetMultiplier } from '@/lib/futures'
import { forexContractSize } from '@/lib/forex'
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TradeFormInput = z.infer<typeof tradeFormSchema>

// Maps validated form input to the trade columns shared by create and update,
// including the derived gross/net P&L and planned R-multiple. Centralised so the
// two write paths cannot drift: how a trade is persisted lives in one place.
function buildTradeColumns(v: TradeFormInput, prevExtra?: Record<string, unknown> | null) {
  // Value multiplier per asset class (futures contract size, options ×100, forex
  // standard-lot contract size, else 1) so manually entered P&L matches the
  // execution-based paths. assetClass is the user's explicit signal — avoids
  // misclassifying a stock whose ticker collides with a futures root. Forex is
  // lot-based here (like the manual wizard), unlike CSV import which keeps ×1
  // because exported quantities may already be in units.
  const multiplier = v.assetClass === 'forex' ? forexContractSize(v.symbol) : assetMultiplier(v.assetClass, v.symbol)

  let grossPnl: string | null = null
  let netPnl: string | null = null
  if (v.exitPrice && v.exitQuantity) {
    const pnl = derivePnl({
      direction: v.direction,
      entryPrice: v.entryPrice,
      exitPrice: Number(v.exitPrice),
      quantity: v.entryQuantity,
      fees: v.fees,
      multiplier,
    })
    grossPnl = pnl.grossPnl.toString()
    netPnl = pnl.netPnl.toString()
  }

  let riskRewardRatio: string | null = null
  if (v.stopLoss && v.takeProfit) {
    riskRewardRatio =
      calculateRR(v.direction, v.entryPrice, Number(v.stopLoss), Number(v.takeProfit))?.toString() ?? null
  }

  // Persist the multiplier (only when it differs from 1, i.e. futures/options) so
  // every downstream consumer — the sidebar, notional-based P&L%, R-multiple and
  // the SQL breakeven filter, which all read `extra.contractMultiplier` — values
  // the trade exactly as the P&L above was computed. Merged with any existing
  // extra so riskPlan / executions survive an edit; a class change back to a ×1
  // market drops the stale key.
  const mergedExtra: Record<string, unknown> = {
    ...(prevExtra ?? {}),
    contractMultiplier: multiplier !== 1 ? multiplier : undefined,
  }
  const extra = Object.values(mergedExtra).some((x) => x !== undefined) ? mergedExtra : null

  return {
    symbol: v.symbol,
    direction: v.direction,
    status: v.status,
    assetClass: v.assetClass,
    entryPrice: v.entryPrice.toString(),
    entryQuantity: v.entryQuantity.toString(),
    entryDatetime: new Date(v.entryDatetime),
    exitPrice: v.exitPrice ? v.exitPrice.toString() : null,
    exitQuantity: v.exitQuantity ? v.exitQuantity.toString() : null,
    exitDatetime: v.exitDatetime ? new Date(v.exitDatetime) : null,
    fees: v.fees.toString(),
    grossPnl,
    netPnl,
    stopLoss: v.stopLoss ? v.stopLoss.toString() : null,
    takeProfit: v.takeProfit ? v.takeProfit.toString() : null,
    riskRewardRatio,
    riskAmount: v.riskAmount ? v.riskAmount.toString() : null,
    notes: v.notes || null,
    rating: v.rating ? Number(v.rating) : null,
    emotionBefore: v.emotionBefore || null,
    emotionAfter: v.emotionAfter || null,
    mistakes: v.mistakes || null,
    lessons: v.lessons || null,
    extra,
  }
}

async function assignTags(tradeId: string, userId: string, tagIds: string[]) {
  await db.delete(tradeTags).where(eq(tradeTags.tradeId, tradeId))
  if (tagIds.length === 0) return
  const owned = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)))
  const ownedIds = owned.map((t) => t.id)
  if (ownedIds.length > 0) {
    await db.insert(tradeTags).values(ownedIds.map((tagId) => ({ tradeId, tagId })))
  }
}

// ─── Create trade ─────────────────────────────────────────────────────────────

export const createTrade = mutationAction(
  [tradeFormSchema, uuidArray.default([]), uuid.nullable().default(null)],
  async ({ userId }, validated, tagIds, accountId) => {
    const [trade] = await db
      .insert(trades)
      .values({
        userId,
        accountId: accountId || null,
        ...buildTradeColumns(validated),
        importSource: 'manual',
      })
      .returning()

    await assignTags(trade.id, userId, tagIds)

    revalidatePath('/dashboard')
    revalidatePath('/trades')
    return { success: true, trade }
  },
)

// ─── Update trade ─────────────────────────────────────────────────────────────

export const updateTrade = mutationAction(
  [uuid, tradeFormSchema, uuidArray.optional(), uuid.nullable().optional()],
  async ({ userId }, id, validated, tagIds, accountId) => {
    const existing = await db.query.trades.findFirst({
      where: and(eq(trades.id, id), eq(trades.userId, userId)),
    })
    if (!existing) throw new NotFoundError(t('errors.trade.notFound'))

    const [updated] = await db
      .update(trades)
      .set({
        // accountId is only touched when the caller passes it explicitly.
        ...(accountId !== undefined ? { accountId: accountId || null } : {}),
        ...buildTradeColumns(validated, existing.extra as Record<string, unknown> | null),
        updatedAt: new Date(),
      })
      .where(and(eq(trades.id, id), eq(trades.userId, userId)))
      .returning()

    if (tagIds !== undefined) {
      await assignTags(id, userId, tagIds)
    }

    revalidatePath('/dashboard')
    revalidatePath('/trades')
    revalidatePath(`/trades/${id}`)
    return { success: true, trade: updated }
  },
)

const journalSchema = z.object({
  notes: z.string().max(8_000_000).nullable().optional(),
  rating: z.number().min(0).max(5).multipleOf(0.5).nullable().optional(),
})

export const updateTradeJournal = mutationAction([uuid, journalSchema], async ({ userId }, id, v) => {
  const set: Partial<{ notes: string | null; rating: number | null; updatedAt: Date }> = {
    updatedAt: new Date(),
  }
  if (v.notes !== undefined) set.notes = v.notes
  if (v.rating !== undefined) set.rating = v.rating === 0 ? null : v.rating

  const [updated] = await db
    .update(trades)
    .set(set)
    .where(and(eq(trades.id, id), eq(trades.userId, userId)))
    .returning({ id: trades.id })
  if (!updated) throw new NotFoundError(t('errors.trade.notFound'))

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
  side: z.enum(['buy', 'sell']),
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

  const execs = [...v.executions].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
  for (const e of execs) {
    if (isNaN(new Date(e.datetime).getTime())) throw new ValidationError(t('errors.execution.invalidDate'))
  }

  const direction: 'long' | 'short' = execs[0].side === 'buy' ? 'long' : 'short'
  const entrySide = execs[0].side
  const entries = execs.filter((e) => e.side === entrySide)
  const exits = execs.filter((e) => e.side !== entrySide)

  const sumQty = (rows: typeof execs) => rows.reduce((s, e) => s + e.quantity, 0)
  const avgPrice = (rows: typeof execs) => {
    const qty = sumQty(rows)
    return qty === 0 ? 0 : rows.reduce((s, e) => s + e.price * e.quantity, 0) / qty
  }

  const entryQuantity = sumQty(entries)
  const exitQuantity = sumQty(exits)
  const entryPrice = avgPrice(entries)
  const exitPrice = exits.length > 0 ? avgPrice(exits) : null
  const fees = execs.reduce((s, e) => s + e.commission + e.fee, 0)
  const entryDatetime = new Date(entries[0].datetime)
  const exitDatetime = exits.length > 0 ? new Date(exits[exits.length - 1].datetime) : null

  const prevExtra = (existing.extra as Record<string, unknown> | null) ?? {}
  const storedMult = Number(prevExtra.contractMultiplier)
  const mult = v.contractMultiplier && v.contractMultiplier > 0 ? v.contractMultiplier : storedMult > 0 ? storedMult : 1

  let grossPnl: string | null = null
  let netPnl: string | null = null
  const matchedQty = Math.min(entryQuantity, exitQuantity)
  if (exitPrice !== null && matchedQty > 0) {
    const pnl = calculatePnl(direction, entryPrice, exitPrice, matchedQty, 0)
    const gross = pnl.grossPnl * mult
    grossPnl = roundMoney(gross).toString()
    netPnl = roundMoney(gross - fees).toString()
  }

  const status: 'open' | 'closed' = exitQuantity >= entryQuantity && exits.length > 0 ? 'closed' : 'open'

  const nextExtra = {
    ...prevExtra,
    executions: execs,
    contractMultiplier: v.contractMultiplier ?? prevExtra.contractMultiplier ?? null,
  }

  await db
    .update(trades)
    .set({
      direction,
      status,
      entryPrice: entryPrice.toString(),
      entryQuantity: entryQuantity.toString(),
      entryDatetime,
      exitPrice: exitPrice?.toString() ?? null,
      exitQuantity: exitQuantity > 0 ? exitQuantity.toString() : null,
      exitDatetime,
      fees: fees.toString(),
      grossPnl,
      netPnl,
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
  await db.delete(trades).where(and(eq(trades.id, id), eq(trades.userId, userId)))

  revalidatePath('/dashboard')
  revalidatePath('/trades')
  return { success: true }
})

export const deleteTrades = mutationAction([uuidArray], async ({ userId }, ids) => {
  if (ids.length === 0) return { success: true, count: 0 }
  await db.delete(trades).where(and(eq(trades.userId, userId), inArray(trades.id, ids)))
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
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(500).optional(),
    // `riskRewardRatio` is the legacy key for the R column (it used to sort by the
    // planned R:R); it is still accepted from old URLs/cookies and treated as `rMultiple`.
    sortBy: z.enum(['entryDatetime', 'netPnl', 'symbol', 'rMultiple', 'riskRewardRatio']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .default({})

async function buildTradeConditions(userId: string, filters: TradeFilters) {
  const { direction, status, assetClass, tagId, strategyId, dateFrom, dateTo, minPnl, maxPnl, search } = filters

  const conditions = [eq(trades.userId, userId)]

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
      : orderFn(sortBy === 'netPnl' ? trades.netPnl : sortBy === 'symbol' ? trades.symbol : trades.entryDatetime)

  const [rows, totalResult] = await Promise.all([
    db.query.trades.findMany({
      where: and(...conditions),
      orderBy: [orderBy],
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

const checklistProgressSchema = z.object({
  entry: z.array(z.string().trim().min(1).max(200)).max(30),
  exit: z.array(z.string().trim().min(1).max(200)).max(30),
})

export const setTradeChecklistProgress = mutationAction(
  [uuid, checklistProgressSchema],
  async ({ userId }, tradeId, progress) => {
    const empty = progress.entry.length === 0 && progress.exit.length === 0
    await db
      .update(trades)
      .set({ checklistProgress: empty ? null : progress, updatedAt: new Date() })
      .where(and(eq(trades.id, tradeId), eq(trades.userId, userId)))
    revalidatePath('/trades')
    revalidatePath('/strategies')
    return { success: true }
  },
)
