import { describe, it, expect, vi, beforeEach } from 'vitest'

// An import is undone by deleting its trades *and* its log. Split across two
// statements, a failure between them leaves either an import that lists trades
// which no longer exist, or trades no import can undo — so both go as one unit.
const { authMock, enforceMock, findFirstMock, batchMock, cleanupMock, keysMock, deleted } = vi.hoisted(() => ({
  authMock: vi.fn(),
  enforceMock: vi.fn(),
  findFirstMock: vi.fn(),
  batchMock: vi.fn(),
  cleanupMock: vi.fn(),
  keysMock: vi.fn(),
  deleted: [] as string[],
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: enforceMock }))
vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/orphan-images', () => ({ cleanupOrphanedImages: cleanupMock, tradeImageKeys: keysMock }))
vi.mock('drizzle-orm', () => {
  const op =
    (name: string) =>
    (...args: unknown[]) => ({ [name]: args })
  return { and: op('and'), eq: op('eq'), gte: op('gte'), desc: op('desc'), inArray: op('inArray') }
})
vi.mock('@/lib/db', () => {
  const makeDelete = (tbl: { __table: string }) => {
    deleted.push(tbl.__table)
    const stmt: Record<string, unknown> = { table: tbl.__table }
    stmt.returning = () => stmt
    return { where: () => stmt }
  }
  return {
    accounts: { __table: 'accounts' },
    trades: { __table: 'trades' },
    importLogs: { __table: 'importLogs' },
    db: {
      query: { importLogs: { findFirst: findFirstMock } },
      delete: makeDelete,
      batch: batchMock,
    },
  }
})

import { deleteImport } from './wizard'
import { NotFoundError } from '@/lib/action-errors'

const LOG = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  deleted.length = 0
  authMock.mockResolvedValue({ userId: 'user_42' })
  enforceMock.mockResolvedValue(null)
  cleanupMock.mockReset().mockResolvedValue(0)
  keysMock.mockReset().mockResolvedValue(['notes/user_42/a.png'])
  findFirstMock.mockReset().mockResolvedValue({ id: LOG, tradeIds: ['t1', 't2'] })
  batchMock.mockReset().mockResolvedValue([[{ id: 't1' }, { id: 't2' }], undefined])
})

describe('deleteImport', () => {
  it('drops the trades and the log as one atomic unit', async () => {
    const res = await deleteImport(LOG)

    expect(batchMock).toHaveBeenCalledTimes(1)
    const statements = batchMock.mock.calls[0][0] as { table: string }[]
    expect(statements.map((s) => s.table)).toEqual(['trades', 'importLogs'])
    expect(res).toMatchObject({ success: true, deletedTrades: 2 })
  })

  it('cleans up the imported notes’ images', async () => {
    await deleteImport(LOG)
    expect(cleanupMock).toHaveBeenCalledWith('user_42', ['notes/user_42/a.png'])
  })

  it('deletes only the log when the import produced no trades', async () => {
    findFirstMock.mockResolvedValue({ id: LOG, tradeIds: [] })

    const res = await deleteImport(LOG)

    expect(batchMock).not.toHaveBeenCalled()
    expect(deleted).toEqual(['importLogs'])
    expect(cleanupMock).not.toHaveBeenCalled()
    expect(res).toMatchObject({ deletedTrades: 0 })
  })

  it('refuses a log belonging to someone else, touching nothing', async () => {
    findFirstMock.mockResolvedValue(undefined)
    await expect(deleteImport(LOG)).rejects.toBeInstanceOf(NotFoundError)
    expect(deleted).toEqual([])
    expect(batchMock).not.toHaveBeenCalled()
  })
})
