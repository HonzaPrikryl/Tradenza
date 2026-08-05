// How an imported trade is identified before and after it is written.
//
// Kept in a plain module (no 'use server', no database import) so it can be
// unit-tested directly, mirroring wizard-helpers.

/** What a bulk insert has to hand back for its rows to be identifiable. */
export interface InsertedTrade {
  id: string
  externalId: string | null
}

/**
 * Index freshly inserted trades by the external id they were written with.
 *
 * Tags and images are inserted after their trade and need its generated id.
 * Pairing them by array position works only if `RETURNING` hands rows back in
 * the order the `VALUES` were given — true in Postgres today, but an unwritten
 * contract, and one that would silently attach a trade's tags to a different
 * trade the day it stopped holding. The external id is already unique within an
 * import (that is what the dedup pass guarantees), so matching on it is both
 * explicit and free.
 *
 * Rows without an external id are skipped: they cannot be matched, and guessing
 * is exactly the failure this exists to prevent.
 */
export function indexByExternalId(rows: readonly InsertedTrade[]): Map<string, string> {
  const byExternalId = new Map<string, string>()
  for (const row of rows) {
    if (row.externalId) byExternalId.set(row.externalId, row.id)
  }
  return byExternalId
}
