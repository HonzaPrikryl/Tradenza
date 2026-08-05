'use server'

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { db, accounts, trades, tradeTags, screenshots, importLogs } from '@/lib/db'
import { uuid } from '@/lib/validation'
import { importAction } from '@/lib/safe-action'
import { NotFoundError } from '@/lib/action-errors'
import { t } from '@/i18n'
import { isR2Configured, copyR2Object } from '@/lib/r2'
import { r2KeyBelongsTo, r2KeyFromUrl, r2KeysFromHtml, rewriteHtmlImageUrls } from '@/lib/r2-keys'
import { tradeBundleSchema, derivedExternalId, matchKey, tagKey, type BundleTrade } from '@/lib/trade-bundle'
import { resolveStrategyIds, resolveTagIds } from './reference-resolve'
import { existingExternalIds, LINK_CHUNK } from './import-dedup'
import { indexByExternalId, type InsertedTrade } from '@/lib/import-identity'

// Restoring a bundle is the mirror image of exporting one, with a single hard
// problem: none of the ids in the file mean anything here. Strategies and tags
// belong to a user, screenshots belong to a bucket prefix, and the account is
// chosen at import time. So every reference is re-resolved against the
// receiving user's own data before a single trade row is written.

const importBundleSchema = z.object({
  accountId: uuid,
  filename: z.string().min(1).max(255),
  bundle: tradeBundleSchema,
})

export interface BundleImportResult {
  total: number
  imported: number
  /** Trades already present in the target account. Expected, not a failure. */
  duplicates: number
  /** Trades we could not write. */
  failed: number
  strategiesCreated: number
  tagsCreated: number
  imagesCopied: number
  /** Images that could not be brought along; their original URL was kept. */
  imagesSkipped: number
  errors: string[]
}

// ─── Images ───────────────────────────────────────────────────────────────────

/**
 * Points imported rows at images they are allowed to keep, copying only when
 * they must.
 *
 * Three cases, and only one of them costs storage:
 *  - **The image is already the importing user's** (moving between their own
 *    accounts) — referenced as-is. Nothing is duplicated.
 *  - **The image belongs to another user of this installation** — copied into
 *    the importer's own prefix, because deleting the exporter's account would
 *    otherwise take the importer's images with it.
 *  - **The image is hosted anywhere else** — the link is kept verbatim, never
 *    fetched. The bundle is user-supplied input, and server-side fetching of
 *    arbitrary URLs is an SSRF primitive, not a feature.
 */
class ImageCopier {
  private readonly cache = new Map<string, string>()
  copied = 0
  skipped = 0

  constructor(private readonly userId: string) {}

  /** Public URL the imported row should reference. */
  async url(original: string): Promise<string> {
    const key = r2KeyFromUrl(original)
    if (!key || !isR2Configured()) {
      if (key) this.skipped++
      return original
    }
    // Already ours: reference it, don't duplicate it.
    if (r2KeyBelongsTo(key, this.userId)) return original

    const seen = this.cache.get(key)
    if (seen) return seen

    // Keep the extension so the object keeps serving with the right type.
    const ext = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1).slice(0, 8) : 'bin'
    const destKey = `notes/${this.userId}/${randomUUID()}.${ext}`
    try {
      const next = await copyR2Object(key, destKey)
      this.cache.set(key, next)
      this.copied++
      return next
    } catch (err) {
      // A missing or unreadable object must not sink the whole import: the trade
      // is worth more than the screenshot, so keep the original reference.
      Sentry.captureException(err, { tags: { component: 'import-bundle' }, extra: { key } })
      this.cache.set(key, original)
      this.skipped++
      return original
    }
  }

  /** Rich text with every embedded image of ours repointed at its copy. */
  async html(html: string | null): Promise<string | null> {
    if (!html) return html
    const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, '')
    if (!base) return html
    const map = new Map<string, string>()
    for (const key of new Set(r2KeysFromHtml(html))) {
      map.set(key, await this.url(`${base}/${key}`))
    }
    if (map.size === 0) return html
    return rewriteHtmlImageUrls(html, (key) => map.get(key))
  }
}

// ─── Import ───────────────────────────────────────────────────────────────────

/** Rows per insert. Matches the CSV importer so both scale the same way. */
const TRADE_CHUNK = 100

/** How many individual failures are worth listing before the list stops helping. */
const MAX_REPORTED_ERRORS = 20

/** A trade with its references resolved, ready to be written. */
interface PreparedTrade {
  symbol: string
  values: typeof trades.$inferInsert
  tagIds: string[]
  shots: { userId: string; url: string; label: string | null; sortOrder: number }[]
}

function tradeValues(
  userId: string,
  accountId: string,
  tr: BundleTrade,
  externalId: string,
  strategyId: string | null,
  notes: string | null,
): typeof trades.$inferInsert {
  return {
    userId,
    accountId,
    strategyId,
    symbol: tr.symbol.toUpperCase(),
    direction: tr.direction,
    status: tr.status,
    assetClass: tr.assetClass,
    entryPrice: tr.entryPrice,
    entryQuantity: tr.entryQuantity,
    entryDatetime: new Date(tr.entryDatetime),
    exitPrice: tr.exitPrice,
    exitQuantity: tr.exitQuantity,
    exitDatetime: tr.exitDatetime ? new Date(tr.exitDatetime) : null,
    fees: tr.fees ?? '0',
    grossPnl: tr.grossPnl,
    netPnl: tr.netPnl,
    stopLoss: tr.stopLoss,
    takeProfit: tr.takeProfit,
    riskRewardRatio: tr.riskRewardRatio,
    riskAmount: tr.riskAmount,
    checklistProgress: tr.checklistProgress,
    setupName: tr.setupName,
    notes,
    rating: tr.rating,
    // Carries the fills, contract multiplier and risk plan verbatim — the
    // fields that made the CSV round-trip lossy in the first place.
    extra: tr.extra ?? null,
    importSource: 'bundle',
    externalId,
  }
}

/**
 * Restore a bundle into an account, preserving every field the export captured.
 *
 * Duplicates are skipped rather than merged or overwritten: an import that
 * silently doubles a journal is a much worse outcome than one that declines to
 * touch what is already there, and the result tells the user exactly how many
 * were passed over.
 */
export const importTradesBundle = importAction(
  [importBundleSchema],
  async ({ userId }, v): Promise<BundleImportResult> => {
    const account = await db.query.accounts.findFirst({
      where: and(eq(accounts.id, v.accountId), eq(accounts.userId, userId)),
      columns: { id: true },
    })
    if (!account) throw new NotFoundError(t('validation.wizard.accountNotFound'))

    const bundle = v.bundle
    const images = new ImageCopier(userId)
    const errors: string[] = []

    // A trade may name a strategy the bundle's header never listed (hand-edited
    // file, older exporter). Seed those from the name alone rather than dropping
    // the link.
    const strategyMap = await resolveStrategyIds(
      userId,
      [...bundle.strategies, ...bundle.trades.flatMap((tr) => (tr.strategy ? [{ name: tr.strategy }] : []))],
      images,
    )
    const tagMap = await resolveTagIds(
      userId,
      bundle.trades.flatMap((tr) => tr.tags),
      bundle.tagGroups,
    )

    const externalIdFor = (tr: BundleTrade) => tr.externalId ?? derivedExternalId(tr)
    const existing = await existingExternalIds(userId, v.accountId, bundle.trades.map(externalIdFor))

    // Two trades in one bundle can share a dedup key (a hand-merged file); the
    // set grows as we go so the second one is treated as the duplicate it is.
    const seen = new Set(existing)
    let duplicates = 0
    let failed = 0

    const fail = (symbol: string, err: unknown) => {
      failed++
      if (errors.length < MAX_REPORTED_ERRORS) errors.push(t('validation.bundle.tradeFailed', { symbol }))
      Sentry.captureException(err, { tags: { component: 'import-bundle' }, extra: { userId, symbol } })
    }

    // ── Phase 1: resolve everything that needs no database write ──
    // Image work happens here so the insert phase is pure database traffic.
    const prepared: PreparedTrade[] = []
    for (const tr of bundle.trades) {
      const externalId = externalIdFor(tr)
      if (seen.has(externalId)) {
        duplicates++
        continue
      }
      seen.add(externalId)

      try {
        const notes = await images.html(tr.notes)
        const strategyId = tr.strategy ? (strategyMap.byKey.get(matchKey(tr.strategy)) ?? null) : null
        const shots = await Promise.all(
          tr.screenshots.map(async (s, i) => ({
            userId,
            url: await images.url(s.url),
            label: s.label,
            sortOrder: s.sortOrder ?? i,
          })),
        )
        prepared.push({
          symbol: tr.symbol,
          values: tradeValues(userId, v.accountId, tr, externalId, strategyId, notes),
          tagIds: [
            ...new Set(tr.tags.map((tag) => tagMap.byKey.get(tagKey(tag.group, tag.name))).filter(Boolean)),
          ] as string[],
          shots,
        })
      } catch (err) {
        fail(tr.symbol, err)
      }
    }

    // ── Phase 2: write the trades, in batches ──
    // A trade at a time meant three round trips per trade; on a ten-thousand
    // trade journal that is thirty thousand, which no serverless request
    // survives. Batching costs the per-trade error isolation, so a failed batch
    // is retried row by row — the slow path only runs when something is
    // actually wrong.
    const inserted: InsertedTrade[] = []
    for (let i = 0; i < prepared.length; i += TRADE_CHUNK) {
      const batch = prepared.slice(i, i + TRADE_CHUNK)
      try {
        const rows = await db
          .insert(trades)
          .values(batch.map((p) => p.values))
          .returning({ id: trades.id, externalId: trades.externalId })
        inserted.push(...rows)
      } catch {
        for (const p of batch) {
          try {
            const [row] = await db
              .insert(trades)
              .values(p.values)
              .returning({ id: trades.id, externalId: trades.externalId })
            inserted.push(row)
          } catch (err) {
            fail(p.symbol, err)
          }
        }
      }
    }
    const imported = inserted.length

    // ── Phase 3: everything that points at a trade ──
    // Matched through the external id: a batch insert gives no promise about
    // the order of its results, and attaching one trade's images to another is
    // the kind of corruption nobody notices until much later.
    // Best-effort: the trades are in, and an untagged trade is a far better
    // outcome than an import reported as failed.
    const idByExternalId = indexByExternalId(inserted)
    const tradeIdFor = (p: PreparedTrade) => idByExternalId.get(p.values.externalId as string)
    const tagLinks = prepared.flatMap((p) => {
      const tradeId = tradeIdFor(p)
      return tradeId ? p.tagIds.map((tagId) => ({ tradeId, tagId })) : []
    })
    const shotRows = prepared.flatMap((p) => {
      const tradeId = tradeIdFor(p)
      return tradeId ? p.shots.map((s) => ({ ...s, tradeId })) : []
    })
    try {
      for (let i = 0; i < tagLinks.length; i += LINK_CHUNK) {
        await db.insert(tradeTags).values(tagLinks.slice(i, i + LINK_CHUNK))
      }
    } catch (err) {
      errors.push(t('validation.import.tagsFailed'))
      Sentry.captureException(err, { tags: { component: 'import-bundle' }, extra: { userId } })
    }
    try {
      for (let i = 0; i < shotRows.length; i += LINK_CHUNK) {
        await db.insert(screenshots).values(shotRows.slice(i, i + LINK_CHUNK))
      }
    } catch (err) {
      errors.push(t('validation.bundle.imagesFailed'))
      Sentry.captureException(err, { tags: { component: 'import-bundle' }, extra: { userId } })
    }

    // Bookkeeping must never mask the outcome it reports on.
    try {
      await db.insert(importLogs).values({
        userId,
        accountId: v.accountId,
        filename: v.filename,
        source: 'bundle',
        totalRows: bundle.trades.length,
        importedRows: imported,
        skippedRows: duplicates,
        errorRows: failed,
        errors: errors.length > 0 ? errors : null,
        tradeIds: inserted.length > 0 ? inserted.map((r) => r.id) : null,
      })
      await db.update(accounts).set({ updatedAt: new Date() }).where(eq(accounts.id, v.accountId))
    } catch {
      // Ignore: the trades landed, and a missing history row is not worth an error.
    }

    revalidatePath('/dashboard')
    revalidatePath('/trades')
    revalidatePath('/accounts')
    revalidatePath('/strategies')

    return {
      total: bundle.trades.length,
      imported,
      duplicates,
      failed,
      strategiesCreated: strategyMap.created,
      tagsCreated: tagMap.created,
      imagesCopied: images.copied,
      imagesSkipped: images.skipped,
      errors,
    }
  },
)
