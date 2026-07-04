import { describe, it, expect } from 'vitest'
import {
  ActionError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  isActionError,
} from './action-errors'

describe('ActionError subclasses', () => {
  it('carry the right code, name and message', () => {
    const cases = [
      [new UnauthorizedError('a'), 'UNAUTHORIZED', 'UnauthorizedError'],
      [new ForbiddenError('b'), 'FORBIDDEN', 'ForbiddenError'],
      [new NotFoundError('c'), 'NOT_FOUND', 'NotFoundError'],
      [new ValidationError('d'), 'BAD_REQUEST', 'ValidationError'],
      [new ConflictError('e'), 'CONFLICT', 'ConflictError'],
    ] as const

    for (const [err, code, name] of cases) {
      expect(err).toBeInstanceOf(ActionError)
      expect(err).toBeInstanceOf(Error)
      expect(err.code).toBe(code)
      expect(err.name).toBe(name)
      expect(typeof err.message).toBe('string')
      expect(err.message.length).toBeGreaterThan(0)
    }
  })

  it('ValidationError can carry structured details', () => {
    const details = { formErrors: ['bad'], fieldErrors: {} }
    const err = new ValidationError('invalid', details)
    expect(err.details).toEqual(details)
  })

  it('base ActionError accepts an arbitrary code', () => {
    const err = new ActionError('INTERNAL', 'boom')
    expect(err.code).toBe('INTERNAL')
    expect(err.details).toBeUndefined()
  })
})

describe('isActionError', () => {
  it('narrows action errors and rejects plain errors', () => {
    expect(isActionError(new NotFoundError('x'))).toBe(true)
    expect(isActionError(new ActionError('CONFLICT', 'x'))).toBe(true)
    expect(isActionError(new Error('x'))).toBe(false)
    expect(isActionError('x')).toBe(false)
    expect(isActionError(null)).toBe(false)
  })
})
