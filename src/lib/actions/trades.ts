'use server'

import { auth } from '@clerk/nextjs/server'
import { db, trades, tags, tradeTags, accounts } from '@/lib/db'
import { eq, and, or, desc, asc, gte, lte, ilike, inArray, count } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { tradeFormSchema, type TradeFilters } from '@/types'
import { calculatePnl, calculateRR } from '@/lib/utils'
import { derivePnl, roundMoney } from '@/lib/trade-pnl'
import { contractMultiplier } from '@/lib/futures'
import { readGlobalFilters } from '@/lib/global-filters'
import { readGlobalSettings } from '@/lib/global-settings'
import { generalConditions } from './filter-sql'
import { z } from 'zod'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAuthenticatedUserId(): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')
  return userId
}

type TradeFormInput = z.infer<typeof tradeFormSchema>

// Maps validated form input to the trade columns shared by create and update,
// including the derived gross/net P&L and planned R-multiple. Centralised so the
// two write paths cannot drift: how a trade is persisted lives in one place.
function buildTradeColumns(v: TradeFormInput) {
  let grossPnl: string | null = null
  let netPnl: string | null = null
  if (v.exitPrice && v.exitQuantity) {
    // Apply the contract multiplier for futures so manually entered P&L matches
    // the execution-based paths. assetClass is the user's explicit signal here,
    // which avoids misclassifying a stock whose ticker collides with a futures root.
    const multiplier = v.assetClass === 'futures' ? contractMultiplier(v.symbol) || 1 : 1
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
    setupName: v.setupName || null,
    notes: v.notes || null,
    rating: v.rating ? Number(v.rating) : null,
    emotionBefore: v.emotionBefore || null,
    emotionAfter: v.emotionAfter || null,
    mistakes: v.mistakes || null,
    lessons: v.lessons || null,
  }
}

// ─── Create trade ─────────────────────────────────────────────────────────────

export async function createTrade(
  data: z.infer<typeof tradeFormSchema>,
  tagIds: string[] = [],
  accountId: string | null = null,
) {
  const userId = await getAuthenticatedUserId()
  const validated = tradeFormSchema.parse(data)

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

// ─── Update trade ─────────────────────────────────────────────────────────────

export async function updateTrade(
  id: string,
  data: z.infer<typeof tradeFormSchema>,
  tagIds?: string[],
  accountId?: string | null,
) {
  const userId = await getAuthenticatedUserId()
  const validated = tradeFormSchema.parse(data)

  const existing = await db.query.trades.findFirst({
    where: and(eq(trades.id, id), eq(trades.userId, userId)),
  })
  if (!existing) throw new Error('Trade not found')

  const [updated] = await db
    .update(trades)
    .set({
      // accountId is only touched when the caller passes it explicitly.
      ...(accountId !== undefined ? { accountId: accountId || null } : {}),
      ...buildTradeColumns(validated),
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
}

const journalSchema = z.object({
  notes: z.string().max(8_000_000).nullable().optional(),
  rating: z.number().min(0).max(5).multipleOf(0.5).nullable().optional(),
})

export async function updateTradeJournal(id: string, input: z.infer<typeof journalSchema>) {
  const userId = await getAuthenticatedUserId()
  const v = journalSchema.parse(input)

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
  if (!updated) throw new Error('Trade not found')

  revalidatePath('/trades')
  return { success: true }
}

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

export async function updateTradeRiskPlan(id: string, input: z.infer<typeof riskPlanSchema>) {
  const userId = await getAuthenticatedUserId()
  const plan = riskPlanSchema.parse(input)

  const existing = await db.query.trades.findFirst({
    where: and(eq(trades.id, id), eq(trades.userId, userId)),
  })
  if (!existing) throw new Error('Trade not found')

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
}

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

export async function updateTradeExecutions(tradeId: string, input: z.infer<typeof execUpdateSchema>) {
  const userId = await getAuthenticatedUserId()
  const v = execUpdateSchema.parse(input)

  const existing = await db.query.trades.findFirst({
    where: and(eq(trades.id, tradeId), eq(trades.userId, userId)),
  })
  if (!existing) throw new Error('Trade not found')

  const execs = [...v.executions].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
  for (const e of execs) {
    if (isNaN(new Date(e.datetime).getTime())) throw new Error('Invalid execution date')
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
}

// ─── Delete trade ─────────────────────────────────────────────────────────────

export async function deleteTrade(id: string) {
  const userId = await getAuthenticatedUserId()

  await db.delete(trades).where(and(eq(trades.id, id), eq(trades.userId, userId)))

  revalidatePath('/dashboard')
  revalidatePath('/trades')
  return { success: true }
}

export async function deleteTrades(ids: string[]) {
  const userId = await getAuthenticatedUserId()
  if (ids.length === 0) return { success: true, count: 0 }
  await db.delete(trades).where(and(eq(trades.userId, userId), inArray(trades.id, ids)))
  revalidatePath('/dashboard')
  revalidatePath('/trades')
  revalidatePath('/accounts')
  return { success: true, count: ids.length }
}

export async function addTagToTrades(ids: string[], tagId: string) {
  const userId = await getAuthenticatedUserId()
  if (ids.length === 0) return { success: true, added: 0 }

  const tag = await db.query.tags.findFirst({
    where: and(eq(tags.id, tagId), eq(tags.userId, userId)),
    columns: { id: true },
  })
  if (!tag) throw new Error('Tag not found')

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
}

export async function setTradesAccount(ids: string[], accountId: string) {
  const userId = await getAuthenticatedUserId()
  if (ids.length === 0) return { success: true, count: 0 }

  const acc = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, accountId), eq(accounts.userId, userId)),
    columns: { id: true },
  })
  if (!acc) throw new Error('Account not found')

  await db
    .update(trades)
    .set({ accountId, updatedAt: new Date() })
    .where(and(eq(trades.userId, userId), inArray(trades.id, ids)))

  revalidatePath('/trades')
  revalidatePath('/dashboard')
  revalidatePath('/accounts')
  return { success: true, count: ids.length }
}

// ─── Get trades (with filters) ────────────────────────────────────────────────────

async function buildTradeConditions(userId: string, filters: TradeFilters) {
  const { direction, status, assetClass, tagId, dateFrom, dateTo, setupName, minPnl, maxPnl, search } = filters

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
  if (dateFrom) conditions.push(gte(trades.entryDatetime, new Date(dateFrom)))
  if (dateTo) conditions.push(lte(trades.entryDatetime, new Date(`${dateTo}T23:59:59.999`)))
  if (setupName) conditions.push(ilike(trades.setupName, `%${setupName}%`))
  if (minPnl !== undefined && !Number.isNaN(minPnl)) conditions.push(gte(trades.netPnl, minPnl.toString()))
  if (maxPnl !== undefined && !Number.isNaN(maxPnl)) conditions.push(lte(trades.netPnl, maxPnl.toString()))
  if (search) {
    const term = `%${search}%`
    conditions.push(or(ilike(trades.symbol, term), ilike(trades.setupName, term))!)
  }

  const gf = await readGlobalFilters()
  const { breakeven } = await readGlobalSettings()
  conditions.push(...generalConditions(gf, { includeStatus: true, breakeven }))
  return conditions
}

export async function getFilteredTradeIds(filters: TradeFilters = {}): Promise<string[]> {
  const userId = await getAuthenticatedUserId()
  const conditions = await buildTradeConditions(userId, filters)
  const rows = await db
    .select({ id: trades.id })
    .from(trades)
    .where(and(...conditions))
  return rows.map((r) => r.id)
}

export async function getTradeSymbols(): Promise<string[]> {
  const userId = await getAuthenticatedUserId()
  const rows = await db
    .selectDistinct({ symbol: trades.symbol })
    .from(trades)
    .where(eq(trades.userId, userId))
    .orderBy(asc(trades.symbol))
  return rows.map((r) => r.symbol)
}

export async function getTrades(filters: TradeFilters = {}) {
  const userId = await getAuthenticatedUserId()

  const { page = 1, pageSize = 25, sortBy = 'entryDatetime', sortOrder = 'desc' } = filters

  const conditions = await buildTradeConditions(userId, filters)

  const orderFn = sortOrder === 'asc' ? asc : desc
  const orderColumn = sortBy === 'netPnl' ? trades.netPnl : sortBy === 'symbol' ? trades.symbol : trades.entryDatetime

  const [rows, totalResult] = await Promise.all([
    db.query.trades.findMany({
      where: and(...conditions),
      orderBy: [orderFn(orderColumn)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      with: {
        tradeTags: { with: { tag: true } },
        screenshots: true,
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
}

// ─── Get single trade ─────────────────────────────────────────────────────────

export async function getTradeById(id: string) {
  const userId = await getAuthenticatedUserId()

  const trade = await db.query.trades.findFirst({
    where: and(eq(trades.id, id), eq(trades.userId, userId)),
    with: {
      tradeTags: { with: { tag: true } },
      screenshots: true,
      account: true,
    },
  })

  if (!trade) return null
  return trade
}
