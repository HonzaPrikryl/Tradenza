import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'

// Mock the wrapper's external dependencies. `vi.hoisted` lets the mock factories
// reference these spies even though vi.mock is hoisted above the imports.
const { authMock, captureMock, enforceMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  captureMock: vi.fn(),
  enforceMock: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }))
vi.mock('@sentry/nextjs', () => ({ captureException: captureMock }))
vi.mock('./rate-limit', () => ({ enforceRateLimit: enforceMock }))
vi.mock('next/navigation', () => ({
  // Mirror the real behaviour: rethrow Next's internal control-flow errors.
  unstable_rethrow: (err: unknown) => {
    const digest = (err as { digest?: unknown } | null)?.digest
    if (typeof digest === 'string' && digest.startsWith('NEXT_')) throw err
  },
}))

import { authedAction, mutationAction } from './safe-action'
import { ActionError, UnauthorizedError, ValidationError, NotFoundError } from './action-errors'
import { isRateLimited } from './rate-limit-result'
import { t } from '@/i18n'

const uuid = z.string().uuid()
const uuidArray = z.array(uuid)
const V = '11111111-1111-1111-1111-111111111111'

// Await a rejection and return the thrown error for assertions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rejection = (p: Promise<unknown>): Promise<any> =>
  p.then(
    () => undefined,
    (e) => e,
  )

beforeEach(() => {
  authMock.mockReset()
  captureMock.mockReset()
  enforceMock.mockReset()
  authMock.mockResolvedValue({ userId: 'user_42' })
  enforceMock.mockResolvedValue(null) // null = allowed
})

describe('authedAction — auth', () => {
  it('throws UnauthorizedError and skips the handler when there is no session', async () => {
    authMock.mockResolvedValue({ userId: null })
    const handler = vi.fn()
    const action = authedAction([uuid], handler)

    await expect(action(V)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('injects the authenticated userId', async () => {
    const action = authedAction([], async ({ userId }) => userId)
    expect(await action()).toBe('user_42')
  })
})

describe('authedAction — validation', () => {
  it('passes parsed positional arguments to the handler', async () => {
    const action = authedAction([uuid, uuidArray], async (_ctx, id, ids) => ({ id, ids }))
    expect(await action(V, [V])).toEqual({ id: V, ids: [V] })
  })

  it('applies zod defaults for omitted trailing arguments', async () => {
    const action = authedAction([uuid, uuidArray.default([])], async (_ctx, id, ids) => ({ id, ids }))
    expect(await action(V)).toEqual({ id: V, ids: [] })
  })

  it('rejects invalid input with a ValidationError carrying flattened details', async () => {
    const handler = vi.fn()
    const action = authedAction([uuid], handler)

    const err = await rejection(action('not-a-uuid'))
    expect(err).toBeInstanceOf(ValidationError)
    expect(err.code).toBe('BAD_REQUEST')
    expect(Array.isArray(err.details.formErrors)).toBe(true)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('authedAction — error handling', () => {
  it('lets expected ActionErrors pass through untouched and does not report them', async () => {
    const thrown = new NotFoundError(t('errors.trade.notFound'))
    const action = authedAction([], async () => {
      throw thrown
    })

    await expect(action()).rejects.toBe(thrown)
    expect(captureMock).not.toHaveBeenCalled()
  })

  it('reports unexpected errors to Sentry and surfaces a sanitized INTERNAL error', async () => {
    const action = authedAction([], async () => {
      throw new Error('DB password leaked in message')
    })

    const err = await rejection(action())
    expect(err).toBeInstanceOf(ActionError)
    expect(err.code).toBe('INTERNAL')
    expect(err.message).toBe(t('errors.internal'))
    expect(err.message).not.toContain('password')

    expect(captureMock).toHaveBeenCalledTimes(1)
    const [, ctx] = captureMock.mock.calls[0]
    expect(ctx.extra.userId).toBe('user_42')
  })

  it('rethrows Next.js control-flow signals without wrapping or reporting them', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/x;307;' })
    const action = authedAction([], async () => {
      throw redirect
    })

    await expect(action()).rejects.toBe(redirect)
    expect(captureMock).not.toHaveBeenCalled()
  })
})

describe('authedAction — rate limiting', () => {
  it('does not touch the rate limiter for untagged (read) actions', async () => {
    const action = authedAction([], async () => 'ok')
    await action()
    expect(enforceMock).not.toHaveBeenCalled()
  })

  it('enforces the action-specific policy plus the global ceiling for tagged actions', async () => {
    const action = mutationAction([], async () => 'ok')
    await action()
    expect(enforceMock).toHaveBeenCalledWith('global', 'user_42')
    expect(enforceMock).toHaveBeenCalledWith('mutation', 'user_42')
  })

  it('returns a RateLimited signal (not a thrown error) and never runs the handler', async () => {
    // Allowed on global, limited on the mutation policy with 12s to retry.
    enforceMock.mockImplementation((policy: string) => Promise.resolve(policy === 'mutation' ? 12 : null))
    const handler = vi.fn(async () => 'ok')
    const action = mutationAction([], handler)

    const res = await action()
    expect(isRateLimited(res)).toBe(true)
    expect(res).toEqual({ rateLimited: true, retryAfter: 12 })
    expect(handler).not.toHaveBeenCalled()
  })
})
