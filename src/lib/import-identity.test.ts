import { describe, it, expect } from 'vitest'
import { indexByExternalId } from './import-identity'

describe('indexByExternalId', () => {
  it('maps each external id to the row it was written as', () => {
    const map = indexByExternalId([
      { id: 'a', externalId: 'NQ_2026-01-05_long' },
      { id: 'b', externalId: 'ES_2026-01-05_short' },
    ])
    expect(map.get('NQ_2026-01-05_long')).toBe('a')
    expect(map.get('ES_2026-01-05_short')).toBe('b')
  })

  it('does not depend on the order the database returned rows in', () => {
    const rows = [
      { id: 'a', externalId: 'one' },
      { id: 'b', externalId: 'two' },
      { id: 'c', externalId: 'three' },
    ]
    const forwards = [...indexByExternalId(rows).entries()].sort()
    const backwards = [...indexByExternalId([...rows].reverse()).entries()].sort()
    expect(backwards).toEqual(forwards)
  })

  it('leaves a trade unmatched rather than guessing when it has no external id', () => {
    const map = indexByExternalId([
      { id: 'a', externalId: null },
      { id: 'b', externalId: 'two' },
    ])
    expect(map.size).toBe(1)
    expect(map.get('two')).toBe('b')
  })

  it('reports nothing for a batch that inserted nothing', () => {
    expect(indexByExternalId([]).size).toBe(0)
  })

  it('is safe to look up a trade that never made it in', () => {
    const map = indexByExternalId([{ id: 'a', externalId: 'one' }])
    expect(map.get('a-trade-that-failed')).toBeUndefined()
  })
})
