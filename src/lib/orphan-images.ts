import * as Sentry from '@sentry/nextjs'
import { and, eq, type SQL } from 'drizzle-orm'
import { db, trades, strategies, dailyCheckins, feedback } from '@/lib/db'
import { isR2Configured, deleteR2Objects } from '@/lib/r2'
import { r2KeyFromUrl, r2KeysFromHtml } from '@/lib/r2-keys'

// Deleting rows that carried images (a trading account and its trades, say)
// leaves their R2 objects behind: uploads go to a flat `notes/{userId}/` prefix
// with no per-trade structure, so nothing about the key says it is now unused
// and the bucket just grows.
//
// The catch is that a key is not orphaned merely because *one* referencing row
// went away. Every upload path — trade notes, daily notes, strategy description
// and images, feedback — writes into the same prefix, and the editor lets the
// same URL be pasted into a second note. So cleanup is: collect the keys the
// doomed rows referenced, delete the rows, then remove only those keys that
// nothing left in the user's data still points at.

/**
 * R2 keys embedded in the notes of the user's trades matching `filter`.
 *
 * Call this *before* deleting or rewriting those notes — afterwards there is no
 * record left of which objects they referenced.
 */
export async function tradeImageKeys(userId: string, filter: SQL | undefined): Promise<string[]> {
  const rows = await db
    .select({ notes: trades.notes })
    .from(trades)
    .where(and(eq(trades.userId, userId), filter))
  return rows.flatMap((r) => r2KeysFromHtml(r.notes))
}

/** Every R2 key referenced by the user's remaining data. */
async function referencedKeys(userId: string): Promise<Set<string>> {
  const [tradeRows, strategyRows, checkinRows, feedbackRows] = await Promise.all([
    db.select({ notes: trades.notes }).from(trades).where(eq(trades.userId, userId)),
    db
      .select({ description: strategies.description, imageUrl: strategies.imageUrl, imageUrls: strategies.imageUrls })
      .from(strategies)
      .where(eq(strategies.userId, userId)),
    db.select({ note: dailyCheckins.note }).from(dailyCheckins).where(eq(dailyCheckins.userId, userId)),
    db.select({ imageUrl: feedback.imageUrl }).from(feedback).where(eq(feedback.userId, userId)),
  ])

  const keys = new Set<string>()
  const addUrl = (url: string | null | undefined) => {
    const key = r2KeyFromUrl(url)
    if (key) keys.add(key)
  }

  for (const r of tradeRows) for (const k of r2KeysFromHtml(r.notes)) keys.add(k)
  for (const r of checkinRows) for (const k of r2KeysFromHtml(r.note)) keys.add(k)
  for (const r of strategyRows) {
    // `description` is rich text despite its schema comment, so it can embed images.
    for (const k of r2KeysFromHtml(r.description)) keys.add(k)
    addUrl(r.imageUrl)
    for (const url of r.imageUrls ?? []) addUrl(url)
  }
  for (const r of feedbackRows) addUrl(r.imageUrl)

  return keys
}

/**
 * Remove object-storage images that the just-deleted rows were the last
 * reference to. Call **after** the rows are gone, passing the keys they held
 * (see {@link r2KeysFromHtml}).
 *
 * Best-effort by design, mirroring `purgeUserData`: object storage is not part
 * of the database transaction, and a bucket that briefly keeps an unused object
 * is a far better failure than an action that reports an error for a deletion
 * that actually succeeded. Failures are reported, not thrown.
 *
 * @returns the number of objects deleted (0 when R2 isn't configured).
 */
export async function cleanupOrphanedImages(userId: string, candidateKeys: string[]): Promise<number> {
  const candidates = [...new Set(candidateKeys)]
  if (candidates.length === 0 || !isR2Configured()) return 0

  try {
    const stillUsed = await referencedKeys(userId)
    const orphans = candidates.filter((key) => !stillUsed.has(key))
    return await deleteR2Objects(orphans)
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'orphan-images' }, extra: { userId, count: candidates.length } })
    return 0
  }
}
