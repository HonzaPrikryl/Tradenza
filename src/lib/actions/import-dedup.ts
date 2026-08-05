import { and, eq, inArray } from 'drizzle-orm'
import { db, trades } from '@/lib/db'

// The database half of import identity: which of these trades is already here.
// Matching written rows back to their input is the pure half, in
// lib/import-identity.

/** Chunk size for the IN list, keeping it inside the driver's parameter limit. */
const LOOKUP_CHUNK = 500

/** Rows per insert for the small link tables (trade_tags, screenshots). */
export const LINK_CHUNK = 500

/**
 * Which of these external ids already exist in the account.
 *
 * Asks only about the ids the file actually produced, rather than reading every
 * trade in the account on every import — a scalper with 50k trades paid for all
 * of them to check a 200-row file. Hits `trades_external_id_idx`.
 *
 * Scoped to the account, not the user: the same journal legitimately living in
 * two accounts is a thing people do on purpose (a strategy tested against a
 * second set of rules), and deduping across accounts would silently prevent it.
 */
export async function existingExternalIds(
  userId: string,
  accountId: string,
  candidates: string[],
): Promise<Set<string>> {
  const found = new Set<string>()
  const unique = [...new Set(candidates)]
  for (let i = 0; i < unique.length; i += LOOKUP_CHUNK) {
    const rows = await db
      .select({ externalId: trades.externalId })
      .from(trades)
      .where(
        and(
          eq(trades.userId, userId),
          eq(trades.accountId, accountId),
          inArray(trades.externalId, unique.slice(i, i + LOOKUP_CHUNK)),
        ),
      )
    for (const r of rows) if (r.externalId) found.add(r.externalId)
  }
  return found
}
