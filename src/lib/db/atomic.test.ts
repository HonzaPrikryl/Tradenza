import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BatchItem } from 'drizzle-orm/batch'

// The database module is mocked so each test can present a driver that exposes
// only `batch` (neon-http) or only `transaction` (node-postgres), and assert the
// helper takes the right path on each.
const { dbMock } = vi.hoisted(() => ({ dbMock: {} as Record<string, unknown> }))

vi.mock('./index', () => ({ db: dbMock }))

import { runAtomic } from './atomic'

// Drizzle statements are thenables that resolve to their rows. The tests only
// need that behaviour, so a minimal stand-in is cast into the batch item type.
function stmt(run: () => unknown): BatchItem<'pg'> {
  return {
    then: (resolve: (value: unknown) => void) => resolve(run()),
  } as unknown as BatchItem<'pg'>
}

function failingStmt(error: Error): BatchItem<'pg'> {
  return {
    then: (_resolve: (value: unknown) => void, reject: (reason: unknown) => void) => reject(error),
  } as unknown as BatchItem<'pg'>
}

beforeEach(() => {
  for (const key of Object.keys(dbMock)) delete dbMock[key]
})

describe('runAtomic', () => {
  describe('on a driver with batch (neon-http)', () => {
    it('sends every statement in a single batch and returns results positionally', async () => {
      const batch = vi.fn(async (queries: unknown[]) => queries.map((_, i) => [`row${i}`]))
      dbMock.batch = batch

      const result = await runAtomic(() => [stmt(() => null), stmt(() => null)])

      expect(batch).toHaveBeenCalledTimes(1)
      expect(batch.mock.calls[0][0]).toHaveLength(2)
      expect(result).toEqual([['row0'], ['row1']])
    })

    it('builds the statements against the database itself', async () => {
      dbMock.batch = vi.fn(async (queries: unknown[]) => queries)

      let builder: unknown
      await runAtomic((x) => {
        builder = x
        return [stmt(() => null)]
      })

      expect(builder).toBe(dbMock)
    })
  })

  describe('on a driver without batch (node-postgres)', () => {
    it('runs the statements inside one transaction, in order', async () => {
      const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ id: 'tx' }))
      dbMock.transaction = transaction

      const order: string[] = []
      const result = await runAtomic(() => [
        stmt(() => {
          order.push('first')
          return ['x']
        }),
        stmt(() => {
          order.push('second')
          return ['y']
        }),
      ])

      expect(transaction).toHaveBeenCalledTimes(1)
      expect(order).toEqual(['first', 'second'])
      expect(result).toEqual([['x'], ['y']])
    })

    it('builds the statements against the transaction handle, not the database', async () => {
      const tx = { id: 'tx' }
      dbMock.transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx))

      let builder: unknown
      await runAtomic((x) => {
        builder = x
        return [stmt(() => null)]
      })

      expect(builder).toBe(tx)
      expect(builder).not.toBe(dbMock)
    })

    it('propagates a failure so the transaction rolls back', async () => {
      dbMock.transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({}))

      await expect(
        runAtomic(() => [stmt(() => ['ok']), failingStmt(new Error('constraint violation'))]),
      ).rejects.toThrow('constraint violation')
    })
  })
})
