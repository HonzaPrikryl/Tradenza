import { describe, it, expect, vi, beforeEach } from 'vitest'

// The server side of adherence, where the invariants the pure engine assumes are actually
// enforced: that editing a criterion never re-scores history, that a stale client can't
// park progress against a criterion its trade was never measured by, and that "everything
// held" means every APPLICABLE criterion rather than every criterion the user has.
//
// The database is mocked at the query-builder boundary — these assert on what would be
// written, which is the part that can silently corrupt a journal.

const { authMock, enforceMock, findFirstMock, selectMock, insertMock, updateMock, writes } = vi.hoisted(() => ({
  authMock: vi.fn(),
  enforceMock: vi.fn(),
  findFirstMock: vi.fn(),
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  writes: [] as { kind: 'insert' | 'update'; table: string; values: Record<string, unknown> }[],
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: enforceMock }))
vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/global-settings', () => ({ readGlobalSettings: async () => ({ timezone: 'UTC', breakeven: null }) }))
vi.mock('drizzle-orm', () => {
  const op =
    (name: string) =>
    (...args: unknown[]) => ({ [name]: args })
  // `sql` is chained (`sql\`…\`.mapWith(Number)`), so the tag has to return something
  // chainable rather than a plain object.
  const sqlTag = (...args: unknown[]) => ({ sql: args, mapWith: () => ({ sql: args }) })
  return {
    and: op('and'),
    eq: op('eq'),
    isNull: op('isNull'),
    sql: Object.assign(sqlTag, { raw: op('raw') }),
  }
})

vi.mock('@/lib/db', () => {
  const table = (name: string) =>
    new Proxy({ __table: name } as Record<string, unknown>, {
      get: (target, prop) => (prop in target ? target[prop as string] : `${name}.${String(prop)}`),
    })
  return {
    checklistItems: table('checklistItems'),
    strategies: table('strategies'),
    trades: table('trades'),
    db: {
      query: {
        checklistItems: { findFirst: findFirstMock },
        strategies: { findFirst: findFirstMock },
        trades: { findFirst: findFirstMock },
      },
      select: selectMock,
      insert: insertMock,
      update: updateMock,
    },
  }
})

import {
  updateChecklistItem,
  setTradeBlockProgress,
  confirmTradeAllMet,
  createStrategyCriteria,
  createChecklistItem,
} from './adherence'
import type { ChecklistItem } from '@/lib/adherence'

/** Item ids must be real UUIDs — the actions validate them before they reach the engine. */
const ITEM = {
  g1: 'aaaaaaa1-0000-4000-8000-000000000001',
  g2: 'aaaaaaa1-0000-4000-8000-000000000002',
  s1: 'bbbbbbb1-0000-4000-8000-000000000001',
  s9: 'bbbbbbb1-0000-4000-8000-000000000009',
  gX: 'cccccccc-0000-4000-8000-00000000000f',
} as const

const ID = '11111111-1111-1111-1111-111111111111'
const TRADE = '22222222-2222-2222-2222-222222222222'
const STRATEGY = '33333333-3333-3333-3333-333333333333'

/** Criteria the loader hands back — two universal gate items and one setup item. */
const ITEMS: ChecklistItem[] = [
  {
    id: ITEM.g1,
    strategyId: null,
    block: 'gate',
    label: 'In window',
    definition: null,
    sortOrder: 0,
    effectiveFrom: '2020-01-01',
    archivedDay: null,
  },
  {
    id: ITEM.g2,
    strategyId: null,
    block: 'gate',
    label: 'No news',
    definition: null,
    sortOrder: 1,
    effectiveFrom: '2020-01-01',
    archivedDay: null,
  },
  {
    id: ITEM.s1,
    strategyId: STRATEGY,
    block: 'setup',
    label: 'Break confirmed',
    definition: null,
    sortOrder: 0,
    effectiveFrom: '2020-01-01',
    archivedDay: null,
  },
  // Belongs to another setup: this trade must never be able to tick it.
  {
    id: ITEM.s9,
    strategyId: 'other-strategy',
    block: 'setup',
    label: 'Elsewhere',
    definition: null,
    sortOrder: 0,
    effectiveFrom: '2020-01-01',
    archivedDay: null,
  },
  // Retired before the trade's entry day — history keeps it, today's writes must not.
  {
    id: ITEM.gX,
    strategyId: null,
    block: 'gate',
    label: 'Retired',
    definition: null,
    sortOrder: 2,
    effectiveFrom: '2020-01-01',
    archivedDay: '2026-01-01',
  },
]

vi.mock('@/lib/adherence-server', () => ({
  loadChecklistItems: async () => ITEMS,
  loadAdherenceTrades: async () => [],
  toAdherenceTrade: (r: unknown) => r,
  // Criteria are resolved as of the day the trade was recorded — see lib/adherence.
  criteriaDayOf: (trade: { createdAt: Date }) => trade.createdAt.toISOString().slice(0, 10),
}))

const lastWrite = (kind: 'insert' | 'update') => [...writes].reverse().find((w) => w.kind === kind)!

beforeEach(() => {
  writes.length = 0
  authMock.mockResolvedValue({ userId: 'user_42' })
  enforceMock.mockResolvedValue(null)
  findFirstMock.mockReset()
  selectMock.mockReset().mockReturnValue({ from: () => ({ where: () => [{ m: 3 }] }) })
  insertMock.mockReset().mockImplementation((tbl: { __table: string }) => ({
    values: (values: Record<string, unknown>) => {
      writes.push({ kind: 'insert', table: tbl.__table, values })
      return { returning: async () => [{ id: 'new-id', ...values }] }
    },
  }))
  updateMock.mockReset().mockImplementation((tbl: { __table: string }) => ({
    set: (values: Record<string, unknown>) => {
      writes.push({ kind: 'update', table: tbl.__table, values })
      const stmt = { where: () => ({ returning: async () => [{ id: ID }] }) }
      return stmt
    },
  }))
})

const todayKey = () => new Date().toISOString().slice(0, 10)

/** A closed trade of `STRATEGY`, entered well after every criterion took effect. */
const tradeRow = (progress: unknown = null, recordedAt = new Date()) => ({
  id: TRADE,
  strategyId: STRATEGY,
  entryDatetime: new Date('2026-03-02T10:00:00Z'),
  // Recorded just now, so the review window is open unless a test says otherwise.
  createdAt: recordedAt,
  checklistProgress: progress,
})

/** Recorded long enough ago that the review window has shut. */
const LOCKED_AT = new Date(Date.now() - 72 * 3600_000)

describe('updateChecklistItem', () => {
  it('fix keeps the row, so the criterion keeps its history', async () => {
    findFirstMock.mockResolvedValue({ id: ID, strategyId: null, block: 'gate', sortOrder: 1 })
    await updateChecklistItem(ID, { label: 'Reworded', definition: null }, 'fix')

    expect(writes.filter((w) => w.kind === 'insert')).toHaveLength(0)
    const update = lastWrite('update')
    expect(update.values.label).toBe('Reworded')
    // The one thing a rewording must never do.
    expect(update.values.archivedAt).toBeUndefined()
  })

  it('replace archives the old row and starts a new one today', async () => {
    findFirstMock.mockResolvedValue({ id: ID, strategyId: STRATEGY, block: 'setup', sortOrder: 4 })
    await updateChecklistItem(ID, { label: 'Different check', definition: 'why' }, 'replace')

    const archived = lastWrite('update')
    expect(archived.values.archivedAt).toBeInstanceOf(Date)

    const created = lastWrite('insert')
    expect(created.values).toMatchObject({
      label: 'Different check',
      definition: 'why',
      // Block, scope and position are inherited — only the wording is new.
      block: 'setup',
      strategyId: STRATEGY,
      sortOrder: 4,
    })
    // Never back-dated: the new criterion governs from today on.
    expect(created.values.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('archives BEFORE inserting, so a half-failure can never double-count today', async () => {
    findFirstMock.mockResolvedValue({ id: ID, strategyId: null, block: 'gate', sortOrder: 0 })
    await updateChecklistItem(ID, { label: 'New', definition: null }, 'replace')
    expect(writes.map((w) => w.kind)).toEqual(['update', 'insert'])
  })
})

describe('createChecklistItem', () => {
  // Criteria hang off setups: a trade with no strategy is measured against nothing, so a
  // journal with no setups at all could only ever collect criteria that score nothing.
  it('refuses to write anything until a setup exists', async () => {
    findFirstMock.mockResolvedValue(undefined)
    await expect(createChecklistItem({ block: 'gate', label: 'In window', strategyId: null })).rejects.toThrow()
    expect(writes).toHaveLength(0)
  })

  it('writes once a setup exists', async () => {
    findFirstMock.mockResolvedValue({ id: STRATEGY })
    await createChecklistItem({ block: 'gate', label: 'In window', strategyId: null })
    expect(lastWrite('insert').values).toMatchObject({ block: 'gate', label: 'In window', strategyId: null })
  })
})

describe('createStrategyCriteria', () => {
  beforeEach(() => {
    // assertOwnedStrategy's lookup.
    findFirstMock.mockResolvedValue({ id: STRATEGY })
  })

  it('writes criteria into whichever block each one names', async () => {
    await createStrategyCriteria(STRATEGY, [
      { block: 'gate', label: 'Trend regime' },
      { block: 'setup', label: 'Break confirmed' },
      { block: 'exit', label: 'Trailed behind structure' },
    ])

    const values = lastWrite('insert').values as unknown as { block: string; label: string; strategyId: string }[]
    expect(values.map((v) => v.block)).toEqual(['gate', 'setup', 'exit'])
    // Scoped to the strategy — that is the whole point of writing them here.
    expect(values.every((v) => v.strategyId === STRATEGY)).toBe(true)
  })

  it('numbers each block from its own next sort key', async () => {
    await createStrategyCriteria(STRATEGY, [
      { block: 'setup', label: 'First' },
      { block: 'setup', label: 'Second' },
      { block: 'gate', label: 'Only gate' },
    ])

    const values = lastWrite('insert').values as unknown as { block: string; sortOrder: number }[]
    const setup = values.filter((v) => v.block === 'setup').map((v) => v.sortOrder)
    // The mocked max() is 3, so both blocks continue from 4 independently.
    expect(setup).toEqual([4, 5])
    expect(values.find((v) => v.block === 'gate')!.sortOrder).toBe(4)
  })

  it('treats the same wording in two blocks as two criteria', async () => {
    await createStrategyCriteria(STRATEGY, [
      { block: 'gate', label: 'Size matched the plan' },
      { block: 'exit', label: 'Size matched the plan' },
      // …but an exact repeat within one block is a duplicate.
      { block: 'gate', label: 'size matched the plan' },
    ])

    const values = lastWrite('insert').values as unknown as { block: string }[]
    expect(values).toHaveLength(2)
  })

  it('writes nothing at all when every label is blank', async () => {
    const res = await createStrategyCriteria(STRATEGY, [{ block: 'setup', label: '   ' }])
    expect(res).toMatchObject({ created: 0 })
    expect(writes).toHaveLength(0)
  })
})

describe('setTradeBlockProgress', () => {
  it('drops met ids the trade was never measured by', async () => {
    findFirstMock.mockResolvedValue(tradeRow())
    // ITEM.g1 applies; ITEM.s9 belongs to another setup and ITEM.gX retired before the entry day.
    await setTradeBlockProgress(TRADE, 'gate', { scored: true, met: [ITEM.g1, ITEM.s9, ITEM.gX] })

    const progress = lastWrite('update').values.checklistProgress as {
      blocks: Record<string, { met: string[]; scored: boolean }>
    }
    expect(progress.blocks.gate.met).toEqual([ITEM.g1])
  })

  it('records "not reviewed" as a real state rather than a reset', async () => {
    findFirstMock.mockResolvedValue(
      tradeRow({ v: 2, blocks: { gate: { scored: true, met: [ITEM.g1], scoredAt: null } } }),
    )
    await setTradeBlockProgress(TRADE, 'gate', { scored: false, met: [] })

    const progress = lastWrite('update').values.checklistProgress as {
      blocks: Record<string, { scored: boolean; scoredAt: string | null }>
    }
    expect(progress.blocks.gate.scored).toBe(false)
    expect(progress.blocks.gate.scoredAt).toBeNull()
  })

  it('leaves the other blocks untouched', async () => {
    findFirstMock.mockResolvedValue(
      tradeRow({
        v: 2,
        blocks: {
          gate: { scored: false, met: [], scoredAt: null },
          setup: { scored: true, met: [ITEM.s1], scoredAt: '2026-03-02T12:00:00.000Z' },
          exit: { scored: false, met: [], scoredAt: null },
        },
      }),
    )
    await setTradeBlockProgress(TRADE, 'gate', { scored: true, met: [ITEM.g1] })

    const progress = lastWrite('update').values.checklistProgress as {
      blocks: Record<string, { met: string[]; scoredAt: string | null }>
    }
    expect(progress.blocks.setup).toEqual({ scored: true, met: [ITEM.s1], scoredAt: '2026-03-02T12:00:00.000Z' })
  })

  it('converts a legacy v1 row instead of overwriting what it recorded', async () => {
    findFirstMock.mockResolvedValue(tradeRow({ entry: ['Break confirmed'], exit: [] }))
    await setTradeBlockProgress(TRADE, 'gate', { scored: true, met: [ITEM.g1] })

    const progress = lastWrite('update').values.checklistProgress as {
      v: number
      blocks: Record<string, { met: string[]; scored: boolean }>
    }
    expect(progress.v).toBe(2)
    // The v1 text survives the write as the id it resolves to.
    expect(progress.blocks.setup.met).toEqual([ITEM.s1])
    expect(progress.blocks.setup.scored).toBe(true)
  })
})

describe('the review lock', () => {
  it('refuses a block write once the window has closed', async () => {
    findFirstMock.mockResolvedValue(tradeRow(null, LOCKED_AT))
    await expect(setTradeBlockProgress(TRADE, 'gate', { scored: true, met: [ITEM.g1] })).rejects.toThrow()
    // Refused, not silently ignored — nothing reached the database.
    expect(writes).toHaveLength(0)
  })

  it('refuses "everything held" once the window has closed', async () => {
    findFirstMock.mockResolvedValue(tradeRow(null, LOCKED_AT))
    await expect(confirmTradeAllMet(TRADE)).rejects.toThrow()
    expect(writes).toHaveLength(0)
  })

  it('still allows both while the window is open', async () => {
    findFirstMock.mockResolvedValue(tradeRow())
    await setTradeBlockProgress(TRADE, 'gate', { scored: true, met: [ITEM.g1] })
    expect(writes).toHaveLength(1)
  })
})

describe('confirmTradeAllMet', () => {
  it('marks every applicable criterion as met, per block', async () => {
    findFirstMock.mockResolvedValue(tradeRow())
    await confirmTradeAllMet(TRADE)

    const progress = lastWrite('update').values.checklistProgress as {
      blocks: Record<string, { met: string[]; scored: boolean; scoredAt: string | null }>
    }
    expect(progress.blocks.gate).toMatchObject({ scored: true, met: [ITEM.g1, ITEM.g2] })
    expect(progress.blocks.setup).toMatchObject({ scored: true, met: [ITEM.s1] })
    expect(progress.blocks.gate.scoredAt).toEqual(expect.any(String))
  })

  it('never ticks another setup’s criteria or a retired one', async () => {
    findFirstMock.mockResolvedValue(tradeRow())
    await confirmTradeAllMet(TRADE)

    const progress = lastWrite('update').values.checklistProgress as {
      blocks: Record<string, { met: string[] }>
    }
    const all = Object.values(progress.blocks).flatMap((b) => b.met)
    expect(all).not.toContain(ITEM.s9)
    expect(all).not.toContain(ITEM.gX)
  })

  it('leaves a block with no criteria unscored rather than confirming nothing', async () => {
    findFirstMock.mockResolvedValue(tradeRow())
    await confirmTradeAllMet(TRADE)

    const progress = lastWrite('update').values.checklistProgress as {
      blocks: Record<string, { scored: boolean; met: string[] }>
    }
    // No exit criteria exist in ITEMS, so there is nothing to confirm there.
    expect(progress.blocks.exit).toEqual({ scored: false, met: [], scoredAt: null })
  })
})
