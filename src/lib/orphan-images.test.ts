import { describe, it, expect, vi, beforeEach } from 'vitest'

// The failure mode worth guarding here is deleting an object that some *other*
// note, strategy or feedback entry still shows — the editor lets the same URL be
// pasted twice, and every upload path shares one flat prefix.
const { rows, r2, captureMock } = vi.hoisted(() => ({
  rows: {
    trades: [] as { notes: string | null }[],
    strategies: [] as { description: string | null; imageUrl: string | null; imageUrls: string[] | null }[],
    dailyCheckins: [] as { note: string | null }[],
    feedback: [] as { imageUrl: string | null }[],
  },
  r2: { isR2Configured: vi.fn(() => true), deleteR2Objects: vi.fn(async (k: string[]) => k.length) },
  captureMock: vi.fn(),
}))

vi.mock('drizzle-orm', () => ({ eq: (a: unknown, b: unknown) => ({ eq: [a, b] }) }))
vi.mock('@sentry/nextjs', () => ({ captureException: captureMock }))
vi.mock('@/lib/r2', () => r2)
vi.mock('@/lib/db', () => {
  const tables = ['trades', 'strategies', 'dailyCheckins', 'feedback'] as const
  const exports: Record<string, unknown> = {}
  for (const name of tables) exports[name] = { __table: name }
  exports.db = {
    select: () => ({
      from: (tbl: { __table: keyof typeof rows }) => ({ where: async () => rows[tbl.__table] }),
    }),
  }
  return exports
})

import { cleanupOrphanedImages } from './orphan-images'

const BASE = 'https://img.example.com'
const url = (k: string) => `${BASE}/${k}`

beforeEach(() => {
  vi.stubEnv('R2_PUBLIC_URL', BASE)
  for (const key of Object.keys(rows) as (keyof typeof rows)[]) rows[key].length = 0
  r2.isR2Configured.mockReturnValue(true)
  r2.deleteR2Objects.mockClear().mockImplementation(async (k: string[]) => k.length)
  captureMock.mockClear()
})

describe('cleanupOrphanedImages', () => {
  it('deletes keys nothing references any more', async () => {
    const n = await cleanupOrphanedImages('user_1', ['notes/user_1/a.png', 'notes/user_1/b.png'])
    expect(r2.deleteR2Objects).toHaveBeenCalledWith(['notes/user_1/a.png', 'notes/user_1/b.png'])
    expect(n).toBe(2)
  })

  it('keeps a key a surviving trade note still shows', async () => {
    rows.trades.push({ notes: `<img src="${url('notes/user_1/a.png')}">` })
    await cleanupOrphanedImages('user_1', ['notes/user_1/a.png', 'notes/user_1/b.png'])
    expect(r2.deleteR2Objects).toHaveBeenCalledWith(['notes/user_1/b.png'])
  })

  it.each([
    ['a daily note', () => rows.dailyCheckins.push({ note: `<img src="${url('notes/user_1/a.png')}">` })],
    [
      'a strategy description',
      () =>
        rows.strategies.push({
          description: `<img src="${url('notes/user_1/a.png')}">`,
          imageUrl: null,
          imageUrls: null,
        }),
    ],
    [
      'a strategy image list',
      () => rows.strategies.push({ description: null, imageUrl: null, imageUrls: [url('notes/user_1/a.png')] }),
    ],
    [
      'a deprecated single strategy image',
      () => rows.strategies.push({ description: null, imageUrl: url('notes/user_1/a.png'), imageUrls: null }),
    ],
    ['a feedback attachment', () => rows.feedback.push({ imageUrl: url('notes/user_1/a.png') })],
  ])('keeps a key still referenced by %s', async (_label, seed) => {
    seed()
    await cleanupOrphanedImages('user_1', ['notes/user_1/a.png'])
    expect(r2.deleteR2Objects).toHaveBeenCalledWith([])
  })

  it('de-duplicates candidates so one key is not deleted twice', async () => {
    await cleanupOrphanedImages('user_1', ['notes/user_1/a.png', 'notes/user_1/a.png'])
    expect(r2.deleteR2Objects).toHaveBeenCalledWith(['notes/user_1/a.png'])
  })

  it('does nothing when there are no candidates or R2 is unconfigured', async () => {
    expect(await cleanupOrphanedImages('user_1', [])).toBe(0)
    r2.isR2Configured.mockReturnValue(false)
    expect(await cleanupOrphanedImages('user_1', ['notes/user_1/a.png'])).toBe(0)
    expect(r2.deleteR2Objects).not.toHaveBeenCalled()
  })

  it('fails open and reports when object storage errors', async () => {
    r2.deleteR2Objects.mockRejectedValue(new Error('r2 down'))
    await expect(cleanupOrphanedImages('user_1', ['notes/user_1/a.png'])).resolves.toBe(0)
    expect(captureMock).toHaveBeenCalledTimes(1)
  })
})
