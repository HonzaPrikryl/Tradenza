import { describe, it, expect, vi, beforeEach } from 'vitest'

// Every user-scoped table that must be purged. If a new one is added to the
// schema, add it here and to purge-user.ts — this test fails until both match.
const EXPECTED_TABLES = [
  'accounts',
  'trades',
  'tags',
  'tagGroups',
  'screenshots',
  'candleCache',
  'importLogs',
  'dashboardTemplates',
  'progressRules',
  'ruleCompletions',
  'dailyCheckins',
]

const { deleted, batchMock, r2, captureMock } = vi.hoisted(() => ({
  deleted: [] as string[],
  batchMock: vi.fn(async (arr: unknown[]) => arr),
  r2: { isR2Configured: vi.fn(() => false), deleteR2Prefix: vi.fn(async () => 0) },
  captureMock: vi.fn(),
}))

vi.mock('drizzle-orm', () => ({ eq: (a: unknown, b: unknown) => ({ a, b }) }))
vi.mock('@sentry/nextjs', () => ({ captureException: captureMock }))
vi.mock('@/lib/r2', () => r2)
vi.mock('@/lib/db', () => {
  const exports: Record<string, unknown> = {}
  for (const name of EXPECTED_TABLES) exports[name] = { userId: name }
  exports.db = {
    delete: (tbl: { userId: string }) => {
      deleted.push(tbl.userId)
      return { where: () => ({ table: tbl }) }
    },
    batch: batchMock,
  }
  return exports
})

import { purgeUserData } from './purge-user'

beforeEach(() => {
  deleted.length = 0
  batchMock.mockClear()
  captureMock.mockClear()
  r2.isR2Configured.mockReturnValue(false)
  r2.deleteR2Prefix.mockClear()
  r2.deleteR2Prefix.mockResolvedValue(0)
})

describe('purgeUserData', () => {
  it('deletes from every user-scoped table in a single batch', async () => {
    await purgeUserData('user_1')
    expect(batchMock).toHaveBeenCalledTimes(1)
    expect(batchMock.mock.calls[0][0]).toHaveLength(EXPECTED_TABLES.length)
    expect([...deleted].sort()).toEqual([...EXPECTED_TABLES].sort())
  })

  it('leaves object storage alone when R2 is not configured', async () => {
    await purgeUserData('user_1')
    expect(r2.deleteR2Prefix).not.toHaveBeenCalled()
  })

  it('removes the user’s uploaded images when R2 is configured', async () => {
    r2.isR2Configured.mockReturnValue(true)
    await purgeUserData('user_9')
    expect(r2.deleteR2Prefix).toHaveBeenCalledWith('notes/user_9/')
  })

  it('fails open (and reports) if object-storage cleanup errors', async () => {
    r2.isR2Configured.mockReturnValue(true)
    r2.deleteR2Prefix.mockRejectedValue(new Error('r2 down'))
    await expect(purgeUserData('user_9')).resolves.toBeUndefined()
    expect(captureMock).toHaveBeenCalledTimes(1)
  })
})
