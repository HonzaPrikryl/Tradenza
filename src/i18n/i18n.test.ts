import { describe, expect, it } from 'vitest'
import { t, tList, tRich } from '@/i18n'

// The dictionary is the source of truth for wording, so these assert the mechanics of the
// lookup — plurals, placeholders, fallbacks — against real keys rather than the wording.

describe('t', () => {
  it('returns the key itself when nothing resolves', () => {
    expect(t('adherence.nope.missing')).toBe('adherence.nope.missing')
  })

  it('substitutes simple placeholders', () => {
    expect(t('adherence.score', { met: 3, total: 5 })).toBe('3 of 5')
  })

  it('leaves an unknown placeholder in place rather than printing undefined', () => {
    expect(t('adherence.score', { met: 3 })).toBe('3 of {total}')
  })
})

describe('plurals', () => {
  it('picks the singular form for one', () => {
    expect(t('adherence.coverage', { scored: 1, total: 1 })).toBe('reviewed on 1 of 1 trade')
  })

  it('picks the plural form for anything else', () => {
    expect(t('adherence.coverage', { scored: 4, total: 12 })).toBe('reviewed on 4 of 12 trades')
  })

  it('treats zero as plural in English', () => {
    expect(t('adherence.coverage', { scored: 0, total: 0 })).toBe('reviewed on 0 of 0 trades')
  })

  it('replaces every # in the chosen form with the number', () => {
    expect(t('adherence.window.hours', { count: 7 })).toBe('7 hours')
  })

  it('leaves the whole form untouched when the parameter is missing', () => {
    expect(t('adherence.window.hours')).toContain('plural')
  })
})

describe('tRich', () => {
  it('resolves plurals before splitting on placeholders', () => {
    const parts = tRich('adherence.coverage', { scored: 2, total: 9 }) as (string | { props: unknown })[]
    expect(parts.map((p) => (typeof p === 'string' ? p : '')).join('')).toContain('9 trades')
  })
})

describe('tList', () => {
  it('returns an empty array for a non-array key', () => {
    expect(tList('adherence.title')).toEqual([])
  })
})
