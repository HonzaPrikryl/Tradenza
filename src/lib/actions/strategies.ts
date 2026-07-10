'use server'

import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db, strategies, trades } from '@/lib/db'
import { t } from '@/i18n'
import { uuid, uuidArray } from '@/lib/validation'
import { authedAction, mutationAction } from '@/lib/safe-action'
import { NotFoundError } from '@/lib/action-errors'
import { readGlobalSettings } from '@/lib/global-settings'
import { readGlobalFilters } from '@/lib/global-filters'
import { generalConditions } from './filter-sql'
import { computeBundle, type StatsBundle, type TradeRow } from '@/lib/stats-compute'
import { multiplierFor, tradeNotional } from '@/lib/breakeven'
import {
  adherenceOf,
  computeChecklistAnalytics,
  type ChecklistAnalytics,
  type ChecklistTrade,
} from '@/lib/strategy-checklist'

// Columns needed to build a `TradeRow` for `computeBundle` (the shared, tested
// P&L/stats engine). Kept in one place so per-strategy stats are computed exactly
// like the dashboard / stats page.
const STAT_COLUMNS = {
  netPnl: true,
  grossPnl: true,
  fees: true,
  direction: true,
  entryDatetime: true,
  exitDatetime: true,
  riskAmount: true,
  riskRewardRatio: true,
  notes: true,
  symbol: true,
  entryPrice: true,
  entryQuantity: true,
  extra: true,
  checklistProgress: true,
} as const

type StatTradeRow = {
  netPnl: string | null
  grossPnl: string | null
  fees: string | null
  direction: 'long' | 'short'
  entryDatetime: Date
  exitDatetime: Date | null
  riskAmount: string | null
  riskRewardRatio: string | null
  notes: string | null
  symbol: string
  entryPrice: string | null
  entryQuantity: string | null
  extra: unknown
  checklistProgress: { entry: string[]; exit: string[] } | null
}

function toTradeRow(r: StatTradeRow): TradeRow {
  return {
    netPnl: Number(r.netPnl ?? 0),
    grossPnl: Number(r.grossPnl ?? 0),
    fees: Number(r.fees ?? 0),
    direction: r.direction,
    entryDatetime: r.entryDatetime,
    exitDatetime: r.exitDatetime ?? null,
    riskAmount: r.riskAmount != null ? Number(r.riskAmount) : null,
    riskRewardRatio: r.riskRewardRatio != null ? Number(r.riskRewardRatio) : null,
    hasNotes: typeof r.notes === 'string' && r.notes.trim().length > 0,
    notional: tradeNotional(Number(r.entryPrice ?? 0), Number(r.entryQuantity ?? 0), multiplierFor(r.extra, r.symbol)),
  }
}

export interface StrategyDTO {
  id: string
  name: string
  description: string | null
  entryChecklist: string[]
  exitChecklist: string[]
  imageUrls: string[]
  color: string
  sortOrder: number
}

// Backward-compat: strategies created before the entry/exit split stored a single
// flat `checklist`. Surface those legacy items as entry criteria until re-saved.
function entryOf(r: { entryChecklist: string[] | null; checklist: string[] | null }): string[] {
  return r.entryChecklist ?? r.checklist ?? []
}

// Keep only images we produced ourselves (under the R2 public base) — never store
// arbitrary client-supplied URLs. Capped at 8.
function safeImageUrls(urls: string[] | undefined): string[] {
  const base = process.env.R2_PUBLIC_URL
  if (!urls || !base) return []
  return urls.filter((u) => typeof u === 'string' && u.startsWith(base)).slice(0, 8)
}

const strategySchema = z.object({
  name: z.string().trim().min(1, t('validation.nameRequired')).max(80),
  // Rich-text HTML; large cap because the editor can embed inline (data-URL)
  // images, exactly like trade notes.
  description: z.string().trim().max(8_000_000).optional().nullable(),
  entryChecklist: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  exitChecklist: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  imageUrls: z.array(z.string().url().max(2048)).max(8).optional(),
  color: z.string().trim().max(20).default('#6366f1'),
})

export const getStrategies = authedAction([], async ({ userId }): Promise<StrategyDTO[]> => {
  const rows = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.userId, userId), isNull(strategies.archivedAt)))
    .orderBy(strategies.sortOrder, strategies.name)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    entryChecklist: entryOf(r),
    exitChecklist: r.exitChecklist ?? [],
    imageUrls: r.imageUrls ?? (r.imageUrl ? [r.imageUrl] : []),
    color: r.color,
    sortOrder: r.sortOrder,
  }))
})

// null-if-empty so an empty list clears the column rather than storing `[]`.
const nonEmpty = (list: string[] | undefined): string[] | null => (list && list.length > 0 ? list : null)

export const createStrategy = mutationAction(
  [strategySchema],
  async ({ userId }, { name, description, entryChecklist, exitChecklist, imageUrls, color }) => {
    const maxRow = await db
      .select({ m: sql<number>`coalesce(max(${strategies.sortOrder}), -1)`.mapWith(Number) })
      .from(strategies)
      .where(eq(strategies.userId, userId))
    const nextOrder = (maxRow[0]?.m ?? -1) + 1

    const images = safeImageUrls(imageUrls)
    const [strategy] = await db
      .insert(strategies)
      .values({
        userId,
        name,
        description: description || null,
        checklist: null, // legacy column — new writes use entry/exit only
        entryChecklist: nonEmpty(entryChecklist),
        exitChecklist: nonEmpty(exitChecklist),
        imageUrls: images.length > 0 ? images : null,
        color,
        sortOrder: nextOrder,
      })
      .returning()
    revalidatePath('/strategies')
    return { success: true, strategy }
  },
)

export const updateStrategy = mutationAction(
  [uuid, strategySchema],
  async ({ userId }, id, { name, description, entryChecklist, exitChecklist, imageUrls, color }) => {
    const images = safeImageUrls(imageUrls)
    const [strategy] = await db
      .update(strategies)
      .set({
        name,
        description: description || null,
        checklist: null, // migrate off the legacy column on any save
        entryChecklist: nonEmpty(entryChecklist),
        exitChecklist: nonEmpty(exitChecklist),
        imageUrls: images.length > 0 ? images : null,
        color,
        updatedAt: new Date(),
      })
      .where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
      .returning()
    revalidatePath('/strategies')
    return { success: true, strategy }
  },
)

export const deleteStrategy = mutationAction([uuid], async ({ userId }, id) => {
  // Soft-delete: archive so past trades keep their link + per-strategy history.
  // It leaves the strategies list but its stats stay computable.
  await db
    .update(strategies)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
  revalidatePath('/strategies')
  return { success: true }
})

export const reorderStrategies = mutationAction([uuidArray], async ({ userId }, orderedIds) => {
  await Promise.all(
    orderedIds.map((id, i) =>
      db
        .update(strategies)
        .set({ sortOrder: i })
        .where(and(eq(strategies.id, id), eq(strategies.userId, userId))),
    ),
  )
  revalidatePath('/strategies')
  return { success: true }
})

// ─── Assignment ───────────────────────────────────────────────────────────────

const nullableStrategyId = z.string().uuid().nullable()

async function assertOwnedOrNull(userId: string, strategyId: string | null): Promise<void> {
  if (!strategyId) return
  const owned = await db.query.strategies.findFirst({
    where: and(eq(strategies.id, strategyId), eq(strategies.userId, userId)),
    columns: { id: true },
  })
  if (!owned) throw new NotFoundError(t('errors.strategy.notFound'))
}

// Assign (or clear, when null) the strategy of a single trade.
export const setTradeStrategy = mutationAction([uuid, nullableStrategyId], async ({ userId }, tradeId, strategyId) => {
  await assertOwnedOrNull(userId, strategyId)
  await db
    .update(trades)
    .set({ strategyId, updatedAt: new Date() })
    .where(and(eq(trades.id, tradeId), eq(trades.userId, userId)))
  revalidatePath('/trades')
  revalidatePath('/strategies')
  return { success: true }
})

// Bulk-assign (or clear) the strategy of many trades at once.
export const setTradesStrategy = mutationAction(
  [uuidArray, nullableStrategyId],
  async ({ userId }, ids, strategyId) => {
    if (ids.length === 0) return { success: true, count: 0 }
    await assertOwnedOrNull(userId, strategyId)
    await db
      .update(trades)
      .set({ strategyId, updatedAt: new Date() })
      .where(and(eq(trades.userId, userId), inArray(trades.id, ids)))
    revalidatePath('/trades')
    revalidatePath('/strategies')
    return { success: true, count: ids.length }
  },
)

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface StrategyOverviewRow extends StrategyDTO {
  tradeCount: number
  netPnl: number
  winRate: number
  adherence: number | null
  daily: { date: string; cumulative: number }[]
}

// Every (live) strategy with its headline numbers, computed via the shared stats
// engine so they match the rest of the app. One query loads the user's closed,
// strategy-tagged trades; they're grouped and each group run through computeBundle.
// Honours the global header filter (account/date/tags/…) like the dashboard.
export const getStrategyOverview = authedAction([], async ({ userId }): Promise<StrategyOverviewRow[]> => {
  const [settings, gf] = await Promise.all([readGlobalSettings(), readGlobalFilters()])
  const filterConds = generalConditions(gf, { includeStatus: false, breakeven: settings.breakeven })

  const [list, rows] = await Promise.all([
    db
      .select()
      .from(strategies)
      .where(and(eq(strategies.userId, userId), isNull(strategies.archivedAt)))
      .orderBy(strategies.sortOrder, strategies.name),
    db.query.trades.findMany({
      where: and(eq(trades.userId, userId), eq(trades.status, 'closed'), isNotNull(trades.strategyId), ...filterConds),
      columns: { ...STAT_COLUMNS, strategyId: true },
    }),
  ])

  // Keep the checklist progress alongside each TradeRow so we can measure both
  // headline stats and playbook adherence from the same grouped data.
  const grouped = new Map<string, ChecklistTrade[]>()
  for (const r of rows) {
    if (!r.strategyId) continue
    const arr = grouped.get(r.strategyId) ?? []
    arr.push({ row: toTradeRow(r), progress: r.checklistProgress ?? null })
    grouped.set(r.strategyId, arr)
  }

  return list.map((s) => {
    const group = grouped.get(s.id) ?? []
    const bundle = group.length
      ? computeBundle(
          group.map((g) => g.row),
          'net',
          settings.breakeven,
        )
      : null
    const entryChecklist = entryOf(s)
    const exitChecklist = s.exitChecklist ?? []

    const byDay = new Map<string, number>()
    for (const g of group) {
      const key = (g.row.exitDatetime ?? g.row.entryDatetime).toISOString().slice(0, 10)
      byDay.set(key, (byDay.get(key) ?? 0) + g.row.netPnl)
    }
    let running = 0
    const daily = [...byDay.keys()].sort().map((date) => ({ date, cumulative: (running += byDay.get(date)!) }))

    return {
      id: s.id,
      name: s.name,
      description: s.description,
      entryChecklist,
      exitChecklist,
      imageUrls: s.imageUrls ?? (s.imageUrl ? [s.imageUrl] : []),
      color: s.color,
      sortOrder: s.sortOrder,
      tradeCount: bundle?.totalTrades ?? 0,
      netPnl: bundle?.totalPnl ?? 0,
      winRate: bundle?.winPct ?? 0,
      adherence: adherenceOf(group, entryChecklist, exitChecklist),
      daily,
    }
  })
})

export interface StrategyDetail {
  strategy: {
    id: string
    name: string
    description: string | null
    entryChecklist: string[]
    exitChecklist: string[]
    imageUrls: string[]
    color: string
  }
  stats: StatsBundle
  curve: { i: number; value: number }[]
  checklist: ChecklistAnalytics
  recentTrades: {
    id: string
    symbol: string
    direction: string
    status: string
    netPnl: number | null
    entryDatetime: string
  }[]
}

// Full analytics for one strategy: the complete stats bundle, a cumulative net-P&L
// equity curve, and its most recent trades. Archived strategies are still viewable
// so their history isn't lost. Returns null for an unknown/other-user id (→ 404).
export const getStrategyDetail = authedAction([uuid], async ({ userId }, id): Promise<StrategyDetail | null> => {
  const row = await db.query.strategies.findFirst({
    where: and(eq(strategies.id, id), eq(strategies.userId, userId)),
    columns: {
      id: true,
      name: true,
      description: true,
      checklist: true,
      entryChecklist: true,
      exitChecklist: true,
      imageUrl: true,
      imageUrls: true,
      color: true,
    },
  })
  if (!row) return null
  const strategy = {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    entryChecklist: entryOf(row),
    exitChecklist: row.exitChecklist ?? [],
    imageUrls: row.imageUrls ?? (row.imageUrl ? [row.imageUrl] : []),
  }

  // Honour the global header filter (account/date/tags/…) like the dashboard, so
  // the detail stats/curve/recent match whatever the user has filtered to.
  const [settings, gf] = await Promise.all([readGlobalSettings(), readGlobalFilters()])
  const filterConds = generalConditions(gf, { includeStatus: false, breakeven: settings.breakeven })

  const closed = await db.query.trades.findMany({
    where: and(eq(trades.userId, userId), eq(trades.strategyId, id), eq(trades.status, 'closed'), ...filterConds),
    columns: STAT_COLUMNS,
  })
  const stats = computeBundle(closed.map(toTradeRow), 'net', settings.breakeven)

  // Playbook adherence: how following each criterion relates to outcomes, plus a
  // full-vs-partial compliance split. Uses the same closed trades as the stats.
  const checklist = computeChecklistAnalytics(
    closed.map((c) => ({ row: toTradeRow(c), progress: c.checklistProgress ?? null })),
    strategy.entryChecklist,
    strategy.exitChecklist,
    'net',
    settings.breakeven,
  )

  // Equity curve: cumulative net P&L over closed trades in chronological order.
  // Starts at a zero baseline (index 0) so the line visually begins from 0 —
  // i.e. starting equity — instead of jumping to the first trade's P&L.
  const ordered = [...closed].sort(
    (a, b) => (a.exitDatetime ?? a.entryDatetime).getTime() - (b.exitDatetime ?? b.entryDatetime).getTime(),
  )
  let running = 0
  const curve = [
    { i: 0, value: 0 },
    ...ordered.map((r, i) => {
      running += Number(r.netPnl ?? 0)
      return { i: i + 1, value: running }
    }),
  ]

  const recent = await db.query.trades.findMany({
    where: and(eq(trades.userId, userId), eq(trades.strategyId, id), ...filterConds),
    orderBy: [desc(trades.entryDatetime)],
    limit: 20,
    columns: { id: true, symbol: true, direction: true, status: true, netPnl: true, entryDatetime: true },
  })
  const recentTrades = recent.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    direction: r.direction,
    status: r.status,
    netPnl: r.netPnl != null ? Number(r.netPnl) : null,
    entryDatetime: r.entryDatetime.toISOString(),
  }))

  return { strategy, stats, curve, checklist, recentTrades }
})
