import type { BatchItem, BatchResponse } from 'drizzle-orm/batch'
import { db, type Database } from './index'

// Running several statements as one unit works differently on the two supported
// drivers, and neither API exists on both:
//   - neon-http  → no interactive transactions (`db.transaction` throws), but an
//     atomic `db.batch`: the statements are sent in one request and executed by
//     Neon inside a single implicit transaction.
//   - node-postgres → no `db.batch`, but real interactive transactions.
// `runAtomic` papers over the split so call sites stay driver-agnostic.

/** The query-builder surface shared by the database and a transaction handle. */
export type AtomicRunner = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>

function hasBatch(d: unknown): d is {
  batch: <U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(queries: T) => Promise<BatchResponse<T>>
} {
  return typeof (d as { batch?: unknown }).batch === 'function'
}

/**
 * Execute a fixed list of statements atomically on either driver.
 *
 * Statements are supplied by a builder rather than pre-built, because on the
 * transaction path they must be created against the transaction handle — a
 * statement built from `db` would run on a separate connection and silently
 * fall outside the transaction.
 *
 * Results come back positionally, in the same shape either driver returns for
 * the statement (e.g. the rows array of a `.returning()`).
 *
 * @example
 * const [[updated]] = await runAtomic((x) => [
 *   x.update(tagGroups).set({ color }).where(...).returning(),
 *   x.update(tags).set({ color }).where(...),
 * ])
 */
export async function runAtomic<U extends BatchItem<'pg'>, const T extends Readonly<[U, ...U[]]>>(
  build: (x: AtomicRunner) => T,
): Promise<BatchResponse<T>> {
  if (hasBatch(db)) return db.batch(build(db))

  return db.transaction(async (tx) => {
    const results: unknown[] = []
    // Sequential on purpose: a transaction is bound to one connection, so the
    // statements cannot be run in parallel, and order is part of the contract.
    for (const query of build(tx)) results.push(await query)
    return results as BatchResponse<T>
  })
}
