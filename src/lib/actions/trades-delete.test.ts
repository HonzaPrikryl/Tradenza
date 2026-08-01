import { describe, it, expect, vi, beforeEach } from 'vitest'

// Deleting a trade (or rewriting its note) is the last reference to the images
// the note embedded — nothing else ties those R2 objects to the row, so if the
// action forgets to hand them over they stay in the bucket forever.
const { authMock, enforceMock, cleanupMock, keysMock, deleted, updated } = vi.hoisted(() => ({
  authMock: vi.fn(),
  enforceMock: vi.fn(),
  cleanupMock: vi.fn(),
  keysMock: vi.fn(),
  deleted: [] as string[],
  updated: [] as string[],
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
  return {
    and: op('and'),
    or: op('or'),
    eq: op('eq'),
    desc: op('desc'),
    asc: op('asc'),
    gte: op('gte'),
    lte: op('lte'),
    ilike: op('ilike'),
    inArray: op('inArray'),
    count: op('count'),
    sql: Object.assign(() => ({ mapWith: () => ({}) }), { raw: () => ({}) }),
  }
})
vi.mock('@/lib/db', () => {
  const tables = ['trades', 'tags', 'tradeTags', 'accounts', 'strategies'] as const
  const exports: Record<string, unknown> = {}
  for (const name of tables) exports[name] = { __table: name }
  exports.db = {
    delete: (tbl: { __table: string }) => {
      deleted.push(tbl.__table)
      return { where: async () => undefined }
    },
    update: (tbl: { __table: string }) => {
      updated.push(tbl.__table)
      return { set: () => ({ where: () => ({ returning: async () => [{ id: 'trade_1' }] }) }) }
    },
  }
  return exports
})

import { deleteTrade, deleteTrades, updateTradeJournal } from './trades'

const TRADE = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  deleted.length = 0
  updated.length = 0
  authMock.mockResolvedValue({ userId: 'user_42' })
  enforceMock.mockResolvedValue(null)
  cleanupMock.mockReset().mockResolvedValue(0)
  keysMock.mockReset().mockResolvedValue(['notes/user_42/a.png'])
})

describe('deleteTrade', () => {
  it('hands the trade’s image keys to the cleanup', async () => {
    await deleteTrade(TRADE)
    expect(deleted).toEqual(['trades'])
    expect(cleanupMock).toHaveBeenCalledWith('user_42', ['notes/user_42/a.png'])
  })

  it('reads the keys before the row is deleted', async () => {
    const order: string[] = []
    keysMock.mockImplementation(async () => {
      order.push('collect')
      return []
    })
    cleanupMock.mockImplementation(async () => {
      order.push('cleanup')
      return 0
    })
    await deleteTrade(TRADE)
    expect(order).toEqual(['collect', 'cleanup'])
  })
})

describe('deleteTrades', () => {
  it('cleans up images for a bulk delete', async () => {
    await deleteTrades([TRADE, OTHER])
    expect(deleted).toEqual(['trades'])
    expect(cleanupMock).toHaveBeenCalledWith('user_42', ['notes/user_42/a.png'])
  })

  it('does no work at all for an empty selection', async () => {
    await deleteTrades([])
    expect(deleted).toEqual([])
    expect(keysMock).not.toHaveBeenCalled()
    expect(cleanupMock).not.toHaveBeenCalled()
  })
})

describe('updateTradeJournal', () => {
  it('cleans up images the edited note no longer shows', async () => {
    await updateTradeJournal(TRADE, { notes: '<p>rewritten</p>' })
    expect(updated).toEqual(['trades'])
    expect(cleanupMock).toHaveBeenCalledWith('user_42', ['notes/user_42/a.png'])
  })

  it('skips the note snapshot when only the rating changes', async () => {
    await updateTradeJournal(TRADE, { rating: 4 })
    expect(keysMock).not.toHaveBeenCalled()
    expect(cleanupMock).toHaveBeenCalledWith('user_42', [])
  })
})
