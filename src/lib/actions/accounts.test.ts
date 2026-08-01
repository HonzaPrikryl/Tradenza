import { describe, it, expect, vi, beforeEach } from 'vitest'

// `deleteAccount` is order-sensitive in a way that is easy to regress: the
// trades → accounts FK is ON DELETE SET NULL, so dropping the account first
// would null out `account_id` and leave the trades behind (to be re-adopted by
// the next `provisionGenericIfEmpty`). These tests pin the two statements, their
// order, and the fact that they are submitted as a single atomic unit.
const { authMock, enforceMock, findFirstMock, batchMock, cleanupMock, deleted, noteRows } = vi.hoisted(() => ({
  authMock: vi.fn(),
  enforceMock: vi.fn(),
  findFirstMock: vi.fn(),
  batchMock: vi.fn(),
  cleanupMock: vi.fn(),
  deleted: [] as string[],
  noteRows: [] as { notes: string | null }[],
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: enforceMock }))
vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Only the cleanup is stubbed — `tradeImageKeys` stays real, so the test covers
// which keys the action actually collects from the notes.
vi.mock('@/lib/orphan-images', async (orig) => ({
  ...(await orig<object>()),
  cleanupOrphanedImages: cleanupMock,
}))
vi.mock('drizzle-orm', () => ({
  and: (...parts: unknown[]) => ({ and: parts }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  isNull: (a: unknown) => ({ isNull: a }),
  sql: () => ({ mapWith: () => ({}) }),
}))
vi.mock('@/lib/db', () => {
  const accounts = { __table: 'accounts' }
  const trades = { __table: 'trades' }
  // Referenced by the real orphan-images module at import time.
  const [strategies, dailyCheckins, feedback] = [
    { __table: 'strategies' },
    { __table: 'dailyCheckins' },
    { __table: 'feedback' },
  ]
  // Minimal query-builder stand-in: `delete(t).where(...)` — and the optional
  // `.returning()` — resolve to the statement object that `runAtomic` collects.
  const makeDelete = (tbl: { __table: string }) => {
    deleted.push(tbl.__table)
    const stmt: Record<string, unknown> = { table: tbl.__table }
    stmt.returning = () => stmt
    return { where: () => stmt }
  }
  return {
    accounts,
    trades,
    strategies,
    dailyCheckins,
    feedback,
    db: {
      query: { accounts: { findFirst: findFirstMock } },
      delete: makeDelete,
      batch: batchMock,
      // `select({ notes }).from(trades).where(...)` → the account's trade notes.
      select: () => ({ from: () => ({ where: async () => noteRows }) }),
    },
  }
})

import { deleteAccount } from './accounts'
import { NotFoundError } from '@/lib/action-errors'

const ACCOUNT = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  // r2KeysFromHtml only recognises URLs under the configured public base.
  vi.stubEnv('R2_PUBLIC_URL', 'https://img.example.com')
  deleted.length = 0
  noteRows.length = 0
  cleanupMock.mockReset().mockResolvedValue(0)
  authMock.mockResolvedValue({ userId: 'user_42' })
  enforceMock.mockResolvedValue(null) // null = allowed
  findFirstMock.mockReset().mockResolvedValue({ id: ACCOUNT })
  // Positional results: rows from the trades `.returning()`, then the account delete.
  batchMock.mockReset().mockResolvedValue([[{ id: 't1' }, { id: 't2' }], undefined])
})

describe('deleteAccount', () => {
  it('deletes the account’s trades and the account in one atomic unit', async () => {
    const res = await deleteAccount(ACCOUNT)

    expect(batchMock).toHaveBeenCalledTimes(1)
    const statements = batchMock.mock.calls[0][0] as { table: string }[]
    expect(statements.map((s) => s.table)).toEqual(['trades', 'accounts'])
    expect(res).toMatchObject({ success: true, deletedTrades: 2 })
  })

  it('deletes the trades before the account, so the SET NULL FK cannot orphan them', async () => {
    await deleteAccount(ACCOUNT)
    expect(deleted).toEqual(['trades', 'accounts'])
  })

  it('refuses an account that does not belong to the caller, touching nothing', async () => {
    findFirstMock.mockResolvedValue(undefined)
    await expect(deleteAccount(ACCOUNT)).rejects.toBeInstanceOf(NotFoundError)
    expect(batchMock).not.toHaveBeenCalled()
    expect(cleanupMock).not.toHaveBeenCalled()
    expect(deleted).toEqual([])
  })

  it('hands the deleted trades’ image keys to the orphan cleanup', async () => {
    noteRows.push(
      { notes: '<p>a<img src="https://img.example.com/notes/user_42/one.png"></p>' },
      { notes: '<img src="https://img.example.com/notes/user_42/two.jpg">' },
      { notes: null },
    )

    await deleteAccount(ACCOUNT)

    expect(cleanupMock).toHaveBeenCalledWith('user_42', ['notes/user_42/one.png', 'notes/user_42/two.jpg'])
  })

  it('collects the image keys before the rows that reference them are deleted', async () => {
    const order: string[] = []
    noteRows.push({ notes: '<img src="https://img.example.com/notes/user_42/one.png">' })
    batchMock.mockImplementation(async () => {
      order.push('delete')
      return [[], undefined]
    })
    cleanupMock.mockImplementation(async () => {
      order.push('cleanup')
      return 1
    })

    await deleteAccount(ACCOUNT)

    // Reading the notes after the delete would find nothing to clean up.
    expect(order).toEqual(['delete', 'cleanup'])
    expect(cleanupMock.mock.calls[0][1]).toEqual(['notes/user_42/one.png'])
  })
})
