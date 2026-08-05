'use server'

import { db, trades } from '@/lib/db'
import { and, eq, inArray } from 'drizzle-orm'
import { uuidArray } from '@/lib/validation'
import { authedAction, ValidationError } from '@/lib/safe-action'
import { t } from '@/i18n'
import { realizedR } from '@/lib/r-multiple'
import {
  MAX_BUNDLE_TRADES,
  TRADE_BUNDLE_FORMAT,
  TRADE_BUNDLE_VERSION,
  derivedExternalId,
  matchKey,
  type BundleStrategy,
  type BundleTagGroup,
  type BundleTrade,
  type TradeBundle,
} from '@/lib/trade-bundle'

// ─── Export to CSV ────────────────────────────────────────────────────────────

function adherence(
  progress: { entry: string[]; exit: string[] } | null,
  entryChecklist: string[] | null,
  exitChecklist: string[] | null,
): { entry: string; exit: string } {
  const fmt = (ticked: string[] | undefined, all: string[] | null) => {
    if (!all || all.length === 0) return ''
    const live = (ticked ?? []).filter((t) => all.includes(t))
    return `${live.length}/${all.length}`
  }
  return { entry: fmt(progress?.entry, entryChecklist), exit: fmt(progress?.exit, exitChecklist) }
}

export const exportTradesToCsv = authedAction([uuidArray.optional()], async ({ userId }, ids): Promise<string> => {
  const rows = await db.query.trades.findMany({
    where: ids && ids.length > 0 ? and(eq(trades.userId, userId), inArray(trades.id, ids)) : eq(trades.userId, userId),
    orderBy: (t, { asc }) => [asc(t.entryDatetime)],
    with: {
      strategy: { columns: { name: true, entryChecklist: true, exitChecklist: true } },
      account: { columns: { name: true } },
      tradeTags: { with: { tag: { columns: { name: true } } } },
    },
  })

  const headers = [
    'Symbol',
    'Side',
    'Status',
    'Asset Class',
    'Qty',
    'Exit Qty',
    'Multiplier',
    'Entry Price',
    'Exit Price',
    'Entry Time',
    'Exit Time',
    'Gross P&L',
    'Net P&L',
    'Commission',
    'Stop Loss',
    'Take Profit',
    'Risk Amount',
    'Planned R:R',
    'R Multiple',
    'Setup',
    'Strategy',
    'Entry Adherence',
    'Exit Adherence',
    'Account',
    'Tags',
    'Rating',
    'Notes',
  ]

  const escape = (v: string | null | undefined) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const csvRows = rows.map((t) => {
    const adh = adherence(t.checklistProgress, t.strategy?.entryChecklist ?? null, t.strategy?.exitChecklist ?? null)
    const r = realizedR(t.netPnl, t.riskAmount)
    const mult = (t.extra as { contractMultiplier?: unknown } | null)?.contractMultiplier
    return [
      escape(t.symbol),
      escape(t.direction === 'long' ? 'Buy' : 'Sell'),
      escape(t.status),
      escape(t.assetClass),
      escape(t.entryQuantity),
      escape(t.exitQuantity),
      escape(typeof mult === 'number' || typeof mult === 'string' ? String(mult) : ''),
      escape(t.entryPrice),
      escape(t.exitPrice),
      escape(t.entryDatetime.toISOString()),
      escape(t.exitDatetime?.toISOString()),
      escape(t.grossPnl),
      escape(t.netPnl),
      escape(t.fees),
      escape(t.stopLoss),
      escape(t.takeProfit),
      escape(t.riskAmount),
      escape(t.riskRewardRatio),
      escape(r === null ? '' : r.toFixed(4)),
      escape(t.setupName),
      escape(t.strategy?.name),
      escape(adh.entry),
      escape(adh.exit),
      escape(t.account?.name),
      escape(t.tradeTags.map((tt) => tt.tag.name).join('; ')),
      escape(t.rating?.toString()),
      escape(t.notes),
    ].join(',')
  })

  return [headers.join(','), ...csvRows].join('\n')
})

// ─── Export to a full-fidelity bundle ─────────────────────────────────────────

/**
 * Every field of the selected trades, in the portable JSON bundle.
 *
 * Where the CSV flattens for reading, this preserves for restoring: the risk
 * plan and fills in `extra`, the checklist progress, each tag's group and
 * colour, the strategy's playbook, the screenshots. Strategies and tag groups
 * are collected once at the top level rather than repeated on every trade, so a
 * journal that shares five setups across a thousand trades stays small.
 */
export const exportTradesToBundle = authedAction(
  [uuidArray.optional()],
  async ({ userId }, ids): Promise<TradeBundle> => {
    const rows = await db.query.trades.findMany({
      where:
        ids && ids.length > 0 ? and(eq(trades.userId, userId), inArray(trades.id, ids)) : eq(trades.userId, userId),
      orderBy: (t, { asc }) => [asc(t.entryDatetime)],
      with: {
        strategy: true,
        account: { columns: { name: true } },
        tradeTags: { with: { tag: { with: { group: true } } } },
        screenshots: true,
      },
    })

    // Refuse to write a file our own importer would reject. Silently producing
    // an un-restorable backup is the worst possible failure for this feature —
    // it is discovered on the day someone needs it.
    if (rows.length > MAX_BUNDLE_TRADES) {
      throw new ValidationError(t('errors.export.tooManyTrades', { max: MAX_BUNDLE_TRADES }))
    }

    // Referenced strategies and tag groups, deduped by the same key the import
    // resolves them by — so what the importer looks up is what the exporter wrote.
    const strategies = new Map<string, BundleStrategy>()
    const tagGroups = new Map<string, BundleTagGroup>()

    const bundleTrades: BundleTrade[] = rows.map((t) => {
      if (t.strategy && !strategies.has(matchKey(t.strategy.name))) {
        strategies.set(matchKey(t.strategy.name), {
          name: t.strategy.name,
          description: t.strategy.description ?? null,
          // The deprecated flat `checklist` is folded into the entry list rather
          // than dropped: on an old journal it is the only playbook there is.
          entryChecklist: t.strategy.entryChecklist ?? t.strategy.checklist ?? null,
          exitChecklist: t.strategy.exitChecklist ?? null,
          imageUrls: t.strategy.imageUrls ?? (t.strategy.imageUrl ? [t.strategy.imageUrl] : null),
          color: t.strategy.color ?? null,
          sortOrder: t.strategy.sortOrder ?? null,
        })
      }
      for (const { tag } of t.tradeTags) {
        if (tag.group && !tagGroups.has(matchKey(tag.group.name))) {
          tagGroups.set(matchKey(tag.group.name), {
            name: tag.group.name,
            color: tag.group.color ?? null,
            sortOrder: tag.group.sortOrder ?? null,
          })
        }
      }

      return {
        sourceId: t.id,
        externalId: t.externalId ?? derivedExternalId(t),
        importSource: t.importSource ?? null,

        symbol: t.symbol,
        direction: t.direction,
        status: t.status,
        assetClass: t.assetClass,

        entryPrice: t.entryPrice,
        entryQuantity: t.entryQuantity,
        entryDatetime: t.entryDatetime.toISOString(),
        exitPrice: t.exitPrice ?? null,
        exitQuantity: t.exitQuantity ?? null,
        exitDatetime: t.exitDatetime?.toISOString() ?? null,

        fees: t.fees ?? null,
        grossPnl: t.grossPnl ?? null,
        netPnl: t.netPnl ?? null,

        stopLoss: t.stopLoss ?? null,
        takeProfit: t.takeProfit ?? null,
        riskRewardRatio: t.riskRewardRatio ?? null,
        riskAmount: t.riskAmount ?? null,

        checklistProgress: t.checklistProgress ?? null,

        setupName: t.setupName ?? null,
        notes: t.notes ?? null,
        rating: t.rating ?? null,

        extra: (t.extra as Record<string, unknown> | null) ?? null,

        strategy: t.strategy?.name ?? null,
        tags: t.tradeTags.map(({ tag }) => ({
          group: tag.group?.name ?? null,
          name: tag.name,
          color: tag.color ?? null,
        })),
        screenshots: t.screenshots
          .slice()
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((s) => ({ url: s.url, label: s.label ?? null, sortOrder: s.sortOrder ?? null })),
      }
    })

    return {
      format: TRADE_BUNDLE_FORMAT,
      version: TRADE_BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      source: { app: 'tradenza', account: rows[0]?.account?.name ?? undefined },
      tagGroups: [...tagGroups.values()],
      strategies: [...strategies.values()],
      trades: bundleTrades,
    }
  },
)
