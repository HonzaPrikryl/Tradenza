import { describe, it, expect } from 'vitest'
import { getActionErrorMessage } from './action-error-message'
import { t } from '@/i18n'

describe('getActionErrorMessage', () => {
  it('prefers the specific message of a recognised action error', () => {
    const msg = getActionErrorMessage({ code: 'NOT_FOUND', message: 'Trade not found.' }, 'trades.deleteFailed')
    expect(msg).toBe('Trade not found.')
  })

  it('falls back to the code text when a recognised error has no message', () => {
    expect(getActionErrorMessage({ code: 'NOT_FOUND' })).toBe(t('errors.notFound'))
    expect(getActionErrorMessage({ code: 'UNAUTHORIZED', message: '   ' })).toBe(t('errors.unauthorized'))
  })

  it('never surfaces an internal error message — uses the feature fallback', () => {
    const msg = getActionErrorMessage({ code: 'INTERNAL', message: 'secret db string' }, 'trades.deleteFailed')
    expect(msg).toBe(t('trades.deleteFailed'))
    expect(msg).not.toContain('secret')
  })

  it('uses the feature fallback for unknown / redacted errors', () => {
    expect(getActionErrorMessage(new Error('boom'), 'trades.deleteFailed')).toBe(t('trades.deleteFailed'))
    expect(getActionErrorMessage({ code: 'NOPE' }, 'trades.deleteFailed')).toBe(t('trades.deleteFailed'))
  })

  it('uses the generic message when no fallback is given', () => {
    expect(getActionErrorMessage(null)).toBe(t('errors.generic'))
    expect(getActionErrorMessage(undefined)).toBe(t('errors.generic'))
  })
})
