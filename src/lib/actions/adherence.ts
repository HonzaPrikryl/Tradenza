'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db, checklistItems, strategies, trades } from '@/lib/db'
import { t } from '@/i18n'
import { uuid, uuidArray } from '@/lib/validation'
import { authedAction, mutationAction } from '@/lib/safe-action'
import { NotFoundError, ValidationError } from '@/lib/action-errors'
import { readGlobalSettings } from '@/lib/global-settings'
import { dayKeyInTz } from '@/lib/date-tz'
import { criteriaDayOf, loadAdherenceTrades, loadChecklistItems } from '@/lib/adherence-server'
import {
  applicableItems,
  blockSummaries,
  criteriaWindowLeft,
  diagnose,
  isCriteriaLocked,
  expectancyOf,
  mostMissedItems,
  pendingItems,
  resolveTrades,
  adherenceTrend,
  tradeProgress,
  CHECKLIST_BLOCKS,
  DEFINITION_MAX,
  LABEL_MAX,
  type AdherenceVerdict,
  type BlockSummary,
  type ChecklistBlock,
  type ChecklistItem,
  type ChecklistProgressV2,
  type MissedItem,
  type AdherenceTrend,
} from '@/lib/adherence'

/** A verdict needs each block's figure AND the sample behind it — see diagnose. */
const blockScores = (summaries: Record<ChecklistBlock, BlockSummary>) => ({
  gate: { pct: summaries.gate.adherencePct, scoredTrades: summaries.gate.scoredTrades },
  setup: { pct: summaries.setup.adherencePct, scoredTrades: summaries.setup.scoredTrades },
  exit: { pct: summaries.exit.adherencePct, scoredTrades: summaries.exit.scoredTrades },
})

// Adherence is read per strategy and across the whole account, so criteria and trades load
// through shared helpers. Day keys are resolved here, which keeps lib/adherence pure.

const blockSchema = z.enum(['gate', 'setup', 'exit'])

/**
 * Any block may be scoped to a strategy: a trend setup and a mean-reversion one demand
 * different regimes, and a runner is managed nothing like a scalp. Comparability holds
 * because a trade is always measured against the criteria that applied to it.
 */
const itemSchema = z.object({
  block: blockSchema,
  /** null → universal (applies to every setup). */
  strategyId: uuid.nullable(),
  label: z.string().trim().min(1, t('validation.nameRequired')).max(LABEL_MAX),
  definition: z.string().trim().max(DEFINITION_MAX).optional().nullable(),
})

/**
 * 'fix' → same criterion, better wording: the id and its history survive.
 * 'replace' → a different check: the old row is archived today and a new one starts, so
 * past trades keep the wording they were judged by.
 */
const editModeSchema = z.enum(['fix', 'replace'])

const nextOrder = async (userId: string, where: ReturnType<typeof and>): Promise<number> => {
  const [row] = await db
    .select({ m: sql<number>`coalesce(max(${checklistItems.sortOrder}), -1)`.mapWith(Number) })
    .from(checklistItems)
    .where(where)
  return (row?.m ?? -1) + 1
}

// ─── Setup (criteria management) ───────────────────────────────────────────────

export interface ChecklistItemDTO {
  id: string
  strategyId: string | null
  block: ChecklistBlock
  label: string
  definition: string | null
  sortOrder: number
  effectiveFrom: string
}

export interface AdherenceSetup {
  items: ChecklistItemDTO[]
  strategies: { id: string; name: string }[]
}

/** Everything the criteria manager needs: live items plus the strategies to scope to. */
export const getAdherenceSetup = authedAction([], async ({ userId }): Promise<AdherenceSetup> => {
  const [itemRows, strategyRows] = await Promise.all([
    db
      .select()
      .from(checklistItems)
      .where(and(eq(checklistItems.userId, userId), isNull(checklistItems.archivedAt)))
      .orderBy(checklistItems.sortOrder, checklistItems.label),
    db
      .select({ id: strategies.id, name: strategies.name })
      .from(strategies)
      .where(and(eq(strategies.userId, userId), isNull(strategies.archivedAt)))
      .orderBy(strategies.sortOrder, strategies.name),
  ])

  return {
    items: itemRows.map((r) => ({
      id: r.id,
      strategyId: r.strategyId,
      block: r.block,
      label: r.label,
      definition: r.definition,
      sortOrder: r.sortOrder,
      effectiveFrom: r.effectiveFrom,
    })),
    strategies: strategyRows,
  }
})

/** The live criteria of one strategy — what the strategy form shows and appends to. */
export const getStrategyCriteria = authedAction([uuid], async ({ userId }, strategyId): Promise<ChecklistItemDTO[]> => {
  const rows = await db
    .select()
    .from(checklistItems)
    .where(
      and(
        eq(checklistItems.userId, userId),
        eq(checklistItems.strategyId, strategyId),
        isNull(checklistItems.archivedAt),
      ),
    )
    .orderBy(checklistItems.sortOrder, checklistItems.label)
  return rows.map((r) => ({
    id: r.id,
    strategyId: r.strategyId,
    block: r.block,
    label: r.label,
    definition: r.definition,
    sortOrder: r.sortOrder,
    effectiveFrom: r.effectiveFrom,
  }))
})

/**
 * Every criterion the user has, archived included — for surfaces rendering many trades at
 * once, where each row resolves its own review state from this one load.
 */
export const getAllChecklistItems = authedAction([], async ({ userId }): Promise<ChecklistItem[]> => {
  const { timezone } = await readGlobalSettings()
  return loadChecklistItems(userId, timezone)
})

/**
 * Criteria describe how a setup is traded, so one has to exist first. Without this a user
 * could fill the universal blocks on an empty journal and have nothing to measure: a trade
 * with no strategy is scored against nothing (see applicableItems).
 */
async function assertHasStrategy(userId: string): Promise<void> {
  const any = await db.query.strategies.findFirst({
    where: and(eq(strategies.userId, userId), isNull(strategies.archivedAt)),
    columns: { id: true },
  })
  if (!any) throw new ValidationError(t('errors.adherence.needsStrategy'))
}

async function assertOwnedStrategy(userId: string, strategyId: string | null): Promise<void> {
  if (!strategyId) return
  const owned = await db.query.strategies.findFirst({
    where: and(eq(strategies.id, strategyId), eq(strategies.userId, userId)),
    columns: { id: true },
  })
  if (!owned) throw new NotFoundError(t('errors.strategy.notFound'))
}

const revalidateAdherence = () => {
  revalidatePath('/strategies')
  revalidatePath('/trades')
}

export const createChecklistItem = mutationAction([itemSchema], async ({ userId }, input) => {
  await assertHasStrategy(userId)
  await assertOwnedStrategy(userId, input.strategyId)
  const { timezone } = await readGlobalSettings()
  const [item] = await db
    .insert(checklistItems)
    .values({
      userId,
      strategyId: input.strategyId,
      block: input.block,
      label: input.label,
      definition: input.definition || null,
      sortOrder: await nextOrder(
        userId,
        and(
          eq(checklistItems.userId, userId),
          eq(checklistItems.block, input.block),
          input.strategyId ? eq(checklistItems.strategyId, input.strategyId) : isNull(checklistItems.strategyId),
        ),
      ),
      // Governs trades from today on; those still inside their review window pick it up.
      effectiveFrom: dayKeyInTz(new Date(), timezone),
    })
    .returning()
  revalidateAdherence()
  return { success: true, item }
})

/**
 * Add several criteria to one strategy at once, in any block — what the strategy form
 * writes, so defining a setup and the checks that define it stays one step.
 */
export const createStrategyCriteria = mutationAction(
  // Blank lines are dropped rather than rejected — the field trims as you type.
  [uuid, z.array(z.object({ block: blockSchema, label: z.string().trim().max(LABEL_MAX) })).max(60)],
  async ({ userId }, strategyId, items) => {
    await assertOwnedStrategy(userId, strategyId)

    // Deduped per block: the same wording can mean different things before and after entry.
    const seen = new Set<string>()
    const unique = items.flatMap(({ block, label }) => {
      const trimmed = label.trim()
      const key = `${block}::${trimmed.toLowerCase()}`
      if (!trimmed || seen.has(key)) return []
      seen.add(key)
      return [{ block, label: trimmed }]
    })
    if (unique.length === 0) return { success: true, created: 0 }

    const { timezone } = await readGlobalSettings()
    const effectiveFrom = dayKeyInTz(new Date(), timezone)

    // Sort keys continue each block's sequence, so new lines land under what's there.
    const nextByBlock = new Map<ChecklistBlock, number>()
    for (const block of CHECKLIST_BLOCKS) {
      if (!unique.some((i) => i.block === block)) continue
      nextByBlock.set(
        block,
        await nextOrder(
          userId,
          and(
            eq(checklistItems.userId, userId),
            eq(checklistItems.block, block),
            eq(checklistItems.strategyId, strategyId),
          ),
        ),
      )
    }

    await db.insert(checklistItems).values(
      unique.map(({ block, label }) => {
        const order = nextByBlock.get(block) ?? 0
        nextByBlock.set(block, order + 1)
        return { userId, strategyId, block, label, definition: null, sortOrder: order, effectiveFrom }
      }),
    )
    revalidateAdherence()
    return { success: true, created: unique.length }
  },
)

export const updateChecklistItem = mutationAction(
  [uuid, itemSchema.pick({ label: true, definition: true }), editModeSchema],
  async ({ userId }, id, input, mode) => {
    const { timezone } = await readGlobalSettings()
    const previous = await db.query.checklistItems.findFirst({
      where: and(eq(checklistItems.id, id), eq(checklistItems.userId, userId), isNull(checklistItems.archivedAt)),
    })
    if (!previous) throw new NotFoundError(t('errors.checklistItem.notFound'))

    if (mode === 'fix') {
      const [item] = await db
        .update(checklistItems)
        .set({ label: input.label, definition: input.definition || null, updatedAt: new Date() })
        .where(and(eq(checklistItems.id, id), eq(checklistItems.userId, userId)))
        .returning()
      revalidateAdherence()
      return { success: true, item }
    }

    // Archive first, then insert: the reverse order would double-count today on a failure.
    const now = new Date()
    await db
      .update(checklistItems)
      .set({ archivedAt: now, updatedAt: now })
      .where(and(eq(checklistItems.id, id), eq(checklistItems.userId, userId)))
    const [item] = await db
      .insert(checklistItems)
      .values({
        userId,
        strategyId: previous.strategyId,
        block: previous.block,
        label: input.label,
        definition: input.definition || null,
        sortOrder: previous.sortOrder,
        effectiveFrom: dayKeyInTz(now, timezone),
      })
      .returning()
    revalidateAdherence()
    return { success: true, item }
  },
)

/** A starting set for the two universal blocks — binary, observable, all editable. */
const UNIVERSAL_TEMPLATE: { block: 'gate' | 'exit'; label: string; definition: string }[] = [
  {
    block: 'gate',
    label: t('adherence.template.gate.window.label'),
    definition: t('adherence.template.gate.window.definition'),
  },
  {
    block: 'gate',
    label: t('adherence.template.gate.news.label'),
    definition: t('adherence.template.gate.news.definition'),
  },
  {
    block: 'gate',
    label: t('adherence.template.gate.regime.label'),
    definition: t('adherence.template.gate.regime.definition'),
  },
  {
    block: 'gate',
    label: t('adherence.template.gate.location.label'),
    definition: t('adherence.template.gate.location.definition'),
  },
  {
    block: 'gate',
    label: t('adherence.template.gate.target.label'),
    definition: t('adherence.template.gate.target.definition'),
  },
  {
    block: 'gate',
    label: t('adherence.template.gate.size.label'),
    definition: t('adherence.template.gate.size.definition'),
  },
  {
    block: 'gate',
    label: t('adherence.template.gate.thesis.label'),
    definition: t('adherence.template.gate.thesis.definition'),
  },
  {
    block: 'exit',
    label: t('adherence.template.exit.stopStructure.label'),
    definition: t('adherence.template.exit.stopStructure.definition'),
  },
  {
    block: 'exit',
    label: t('adherence.template.exit.stopHeld.label'),
    definition: t('adherence.template.exit.stopHeld.definition'),
  },
  {
    block: 'exit',
    label: t('adherence.template.exit.targetHeld.label'),
    definition: t('adherence.template.exit.targetHeld.definition'),
  },
  {
    block: 'exit',
    label: t('adherence.template.exit.noAdding.label'),
    definition: t('adherence.template.exit.noAdding.definition'),
  },
  {
    block: 'exit',
    label: t('adherence.template.exit.plannedClose.label'),
    definition: t('adherence.template.exit.plannedClose.definition'),
  },
]

/** Fill the empty universal blocks from the template — only empty ones, so re-running
 *  can't duplicate what the user has written. */
export const seedUniversalCriteria = mutationAction([], async ({ userId }) => {
  await assertHasStrategy(userId)
  const { timezone } = await readGlobalSettings()
  const existing = await db
    .select({ block: checklistItems.block })
    .from(checklistItems)
    .where(and(eq(checklistItems.userId, userId), isNull(checklistItems.strategyId), isNull(checklistItems.archivedAt)))
  const taken = new Set(existing.map((r) => r.block))
  const pending = UNIVERSAL_TEMPLATE.filter((row) => !taken.has(row.block))
  if (pending.length === 0) return { success: true, created: 0 }

  const effectiveFrom = dayKeyInTz(new Date(), timezone)
  const byBlock = new Map<string, number>()
  await db.insert(checklistItems).values(
    pending.map((row) => {
      const order = byBlock.get(row.block) ?? 0
      byBlock.set(row.block, order + 1)
      return {
        userId,
        strategyId: null,
        block: row.block,
        label: row.label,
        definition: row.definition,
        sortOrder: order,
        effectiveFrom,
      }
    }),
  )
  revalidateAdherence()
  return { success: true, created: pending.length }
})

export const deleteChecklistItem = mutationAction([uuid], async ({ userId }, id) => {
  // Soft-delete: it leaves the checklist but keeps counting toward the trades it governed.
  const [item] = await db
    .update(checklistItems)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(checklistItems.id, id), eq(checklistItems.userId, userId), isNull(checklistItems.archivedAt)))
    .returning({ id: checklistItems.id })
  if (!item) throw new NotFoundError(t('errors.checklistItem.notFound'))
  revalidateAdherence()
  return { success: true }
})

export const reorderChecklistItems = mutationAction([uuidArray], async ({ userId }, orderedIds) => {
  if (orderedIds.length === 0) return { success: true }
  await Promise.all(
    orderedIds.map((id, i) =>
      db
        .update(checklistItems)
        .set({ sortOrder: i })
        .where(and(eq(checklistItems.id, id), eq(checklistItems.userId, userId))),
    ),
  )
  revalidateAdherence()
  return { success: true }
})

// ─── Per-trade assessment ─────────────────────────────────────────────────────

export interface TradeAdherence {
  /** The criteria this trade is measured against. */
  items: ChecklistItemDTO[]
  /** Criteria effective after this trade — shown, never scored. */
  pending: ChecklistItemDTO[]
  progress: ChecklistProgressV2
  /** The review window has closed: nothing here can change. */
  locked: boolean
  /** Milliseconds left before it does — 0 once locked. */
  windowLeftMs: number
}

/**
 * What the trade detail panel renders. Applicability is resolved here so a reworded or
 * retired criterion can't appear on a trade it never governed.
 */
export const getTradeAdherence = authedAction([uuid], async ({ userId }, tradeId): Promise<TradeAdherence | null> => {
  const { timezone } = await readGlobalSettings()
  const trade = await db.query.trades.findFirst({
    where: and(eq(trades.id, tradeId), eq(trades.userId, userId)),
    columns: { id: true, strategyId: true, entryDatetime: true, createdAt: true, checklistProgress: true },
  })
  if (!trade) return null

  const items = await loadChecklistItems(userId, timezone)
  const scope = {
    strategyId: trade.strategyId,
    criteriaDay: criteriaDayOf(trade, timezone),
    progress: trade.checklistProgress,
  }
  return {
    items: applicableItems(items, scope).map(stripItem),
    pending: pendingItems(items, scope).map(stripItem),
    progress: tradeProgress(scope, items),
    locked: isCriteriaLocked(trade.createdAt),
    windowLeftMs: criteriaWindowLeft(trade.createdAt),
  }
})

const stripItem = ({ archivedDay: _a, ...rest }: { archivedDay: string | null } & ChecklistItemDTO): ChecklistItemDTO =>
  rest

/**
 * Record (or un-record) one block's assessment. `scored: false` is a real state that keeps
 * the trade out of every average, and met ids are filtered to what actually applied, so a
 * stale client can't park progress against a criterion the trade never had.
 */
export const setTradeBlockProgress = mutationAction(
  [uuid, blockSchema, z.object({ scored: z.boolean(), met: uuidArray.max(100) })],
  async ({ userId }, tradeId, block, next) => {
    const { timezone } = await readGlobalSettings()
    const trade = await db.query.trades.findFirst({
      where: and(eq(trades.id, tradeId), eq(trades.userId, userId)),
      columns: { id: true, strategyId: true, entryDatetime: true, createdAt: true, checklistProgress: true },
    })
    if (!trade) throw new NotFoundError(t('errors.trade.notFound'))

    // Refusing the write here, not just hiding the buttons, is what enforces the window.
    if (isCriteriaLocked(trade.createdAt)) throw new ValidationError(t('errors.adherence.locked'))

    const items = await loadChecklistItems(userId, timezone)
    const scope = {
      strategyId: trade.strategyId,
      criteriaDay: criteriaDayOf(trade, timezone),
      progress: trade.checklistProgress,
    }
    const applicable = new Set(
      applicableItems(items, scope)
        .filter((i) => i.block === block)
        .map((i) => i.id),
    )
    const progress = tradeProgress(scope, items)
    const met = next.met.filter((id) => applicable.has(id))

    const updated: ChecklistProgressV2 = {
      ...progress,
      blocks: {
        ...progress.blocks,
        [block]: { scored: next.scored, met, scoredAt: next.scored ? new Date().toISOString() : null },
      },
    }

    await db
      .update(trades)
      .set({ checklistProgress: updated, updatedAt: new Date() })
      .where(and(eq(trades.id, tradeId), eq(trades.userId, userId)))
    revalidateAdherence()
    return { success: true }
  },
)

/**
 * The one-click path: every criterion held, on every block that has items. Already-reviewed
 * blocks are overwritten deliberately — the button says "all held".
 */
export const confirmTradeAllMet = mutationAction([uuid], async ({ userId }, tradeId) => {
  const { timezone } = await readGlobalSettings()
  const trade = await db.query.trades.findFirst({
    where: and(eq(trades.id, tradeId), eq(trades.userId, userId)),
    columns: { id: true, strategyId: true, entryDatetime: true, createdAt: true, checklistProgress: true },
  })
  if (!trade) throw new NotFoundError(t('errors.trade.notFound'))

  if (isCriteriaLocked(trade.createdAt)) throw new ValidationError(t('errors.adherence.locked'))

  const items = await loadChecklistItems(userId, timezone)
  const scope = {
    strategyId: trade.strategyId,
    criteriaDay: criteriaDayOf(trade, timezone),
    progress: trade.checklistProgress,
  }
  const applicable = applicableItems(items, scope)
  const progress = tradeProgress(scope, items)
  const now = new Date().toISOString()

  const updated: ChecklistProgressV2 = { ...progress, blocks: { ...progress.blocks } }
  for (const block of CHECKLIST_BLOCKS) {
    const ids = applicable.filter((i) => i.block === block).map((i) => i.id)
    if (ids.length === 0) continue
    updated.blocks[block] = { scored: true, met: ids, scoredAt: now }
  }

  await db
    .update(trades)
    .set({ checklistProgress: updated, updatedAt: new Date() })
    .where(and(eq(trades.id, tradeId), eq(trades.userId, userId)))
  revalidateAdherence()
  return { success: true }
})

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface AdherenceOverview {
  /** Every figure below is over the setups currently shown. */
  summaries: BlockSummary[]
  trend: AdherenceTrend
  missed: MissedItem[]
  verdict: AdherenceVerdict
  trades: number
  /** Live criteria, so "nothing defined yet" and "no trades to measure" can differ. */
  definedCriteria: number
  /** Per-strategy sample state, so "not enough yet" is said per setup. */
  perStrategy: { id: string; name: string; trades: number; blocks: BlockSummary[] }[]
  strategyNames: Record<string, string>
}

export interface AdherenceSnapshot {
  summaries: BlockSummary[]
  verdict: AdherenceVerdict
  /** Trades still open for review with nothing recorded. */
  toReview: number
  definedCriteria: number
}

/**
 * The dashboard widget's slice. Its own action rather than part of the dashboard payload,
 * so a user who never places the widget doesn't pay for it on every render.
 */
export const getAdherenceSnapshot = authedAction([], async ({ userId }): Promise<AdherenceSnapshot> => {
  const settings = await readGlobalSettings()
  const [items, tradeRows] = await Promise.all([
    loadChecklistItems(userId, settings.timezone),
    loadAdherenceTrades(userId),
  ])
  const resolved = resolveTrades(tradeRows, items)
  const summaries = blockSummaries(resolved)
  return {
    summaries: CHECKLIST_BLOCKS.map((b) => summaries[b]),
    verdict: diagnose(blockScores(summaries), { trades: resolved.length, expectancy: expectancyOf(resolved) }),
    // Locked trades are excluded, like the SQL behind the list this links to — otherwise
    // the count would send the user to an empty list.
    toReview: resolved.filter(
      (r) =>
        !r.trade.locked &&
        // With no setup named there are no criteria, so there is nothing to review.
        CHECKLIST_BLOCKS.some((b) => r.items[b].length > 0) &&
        CHECKLIST_BLOCKS.every((b) => !r.progress.blocks[b].scored),
    ).length,
    definedCriteria: items.filter((i) => i.archivedDay === null).length,
  }
})

/** The account-level view: the universal blocks belong to the trader, not to one setup. */
export const getAdherenceOverview = authedAction(
  [uuidArray.max(200).optional()],
  async ({ userId }, hiddenStrategyIds): Promise<AdherenceOverview> => {
    const hidden = new Set(hiddenStrategyIds ?? [])
    const settings = await readGlobalSettings()
    const [items, tradeRows, strategyRows] = await Promise.all([
      loadChecklistItems(userId, settings.timezone),
      loadAdherenceTrades(userId),
      db
        .select({ id: strategies.id, name: strategies.name })
        .from(strategies)
        .where(and(eq(strategies.userId, userId), isNull(strategies.archivedAt)))
        .orderBy(strategies.sortOrder, strategies.name),
    ])

    // Resolved once: the per-strategy breakdown filters this list rather than re-resolving.
    const resolved = resolveTrades(tradeRows, items)
    // The by-setup list ignores the selection, so a hidden setup can be brought back.
    const shown = hidden.size === 0 ? resolved : resolved.filter((r) => !hidden.has(r.trade.strategyId ?? ''))
    const summaries = blockSummaries(shown)
    const verdict = diagnose(blockScores(summaries), { trades: shown.length, expectancy: expectancyOf(shown) })

    return {
      summaries: CHECKLIST_BLOCKS.map((b) => summaries[b]),
      trend: adherenceTrend(shown),
      missed: mostMissedItems(shown),
      verdict,
      trades: shown.length,
      definedCriteria: items.filter((i) => i.archivedDay === null).length,
      perStrategy: strategyRows.map((s) => {
        const own = resolved.filter((r) => r.trade.strategyId === s.id)
        const per = blockSummaries(own)
        return { ...s, trades: own.length, blocks: CHECKLIST_BLOCKS.map((b) => per[b]) }
      }),
      strategyNames: Object.fromEntries(strategyRows.map((s) => [s.id, s.name])),
    }
  },
)
