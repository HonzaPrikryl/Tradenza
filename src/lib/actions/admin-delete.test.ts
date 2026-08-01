import { describe, it, expect, vi, beforeEach } from 'vitest'

// Every branch here is a guard on an irreversible action, so each one is pinned:
// a guard that silently stops working is indistinguishable from one that was
// never there until the wrong account is already gone.
const { isAdminMock, callerIdMock, isAdminEmailMock, purgeMock, deleteUserMock, rows } = vi.hoisted(() => ({
  isAdminMock: vi.fn(),
  callerIdMock: vi.fn(),
  isAdminEmailMock: vi.fn(),
  purgeMock: vi.fn(),
  deleteUserMock: vi.fn(),
  rows: [] as { id: string; email: string | null }[],
}))

vi.mock('drizzle-orm', () => ({ eq: (a: unknown, b: unknown) => ({ eq: [a, b] }), sql: () => ({}) }))
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({ users: { deleteUser: deleteUserMock } }),
}))
vi.mock('@/lib/admin', () => ({
  isAdmin: isAdminMock,
  currentUserId: callerIdMock,
  isAdminEmail: isAdminEmailMock,
}))
vi.mock('@/lib/db/purge-user', () => ({ purgeUserData: purgeMock }))
vi.mock('@/lib/db', () => ({
  users: { id: 'users.id', email: 'users.email' },
  db: { select: () => ({ from: () => ({ where: async () => rows }) }) },
}))

import { deleteUserCompletely } from './admin'

const TARGET = 'user_target'
const EMAIL = 'victim@example.com'

beforeEach(() => {
  rows.length = 0
  rows.push({ id: TARGET, email: EMAIL })
  isAdminMock.mockReset().mockResolvedValue(true)
  callerIdMock.mockReset().mockResolvedValue('user_admin')
  isAdminEmailMock.mockReset().mockReturnValue(false)
  purgeMock.mockReset().mockResolvedValue(undefined)
  deleteUserMock.mockReset().mockResolvedValue(undefined)
})

describe('deleteUserCompletely', () => {
  it('purges the data, then deletes the Clerk account', async () => {
    const order: string[] = []
    purgeMock.mockImplementation(async () => void order.push('purge'))
    deleteUserMock.mockImplementation(async () => void order.push('clerk'))

    const res = await deleteUserCompletely(TARGET, EMAIL)

    expect(res).toEqual({ ok: true, email: EMAIL, clerkDeleted: true })
    // Data first: a failed Clerk call must leave a retryable state, never
    // data stranded under an account that no longer exists.
    expect(order).toEqual(['purge', 'clerk'])
    expect(purgeMock).toHaveBeenCalledWith(TARGET)
  })

  it('accepts the confirmation e-mail case- and space-insensitively', async () => {
    const res = await deleteUserCompletely(TARGET, `  ${EMAIL.toUpperCase()} `)
    expect(res).toMatchObject({ ok: true })
  })

  it.each([
    ['a non-admin caller', () => isAdminMock.mockResolvedValue(false), 'forbidden'],
    ['no session at all', () => callerIdMock.mockResolvedValue(null), 'forbidden'],
    ['the caller themselves', () => callerIdMock.mockResolvedValue(TARGET), 'self'],
    ['another admin', () => isAdminEmailMock.mockReturnValue(true), 'protected'],
    ['an unknown user', () => void (rows.length = 0), 'notFound'],
  ])('refuses %s, without touching any data', async (_label, arrange, reason) => {
    arrange()

    const res = await deleteUserCompletely(TARGET, EMAIL)

    expect(res).toEqual({ ok: false, reason })
    expect(purgeMock).not.toHaveBeenCalled()
    expect(deleteUserMock).not.toHaveBeenCalled()
  })

  it.each([
    ['the wrong address', 'someone.else@example.com'],
    ['an empty string', '   '],
  ])('refuses %s as confirmation', async (_label, typed) => {
    const res = await deleteUserCompletely(TARGET, typed)
    expect(res).toEqual({ ok: false, reason: 'mismatch' })
    expect(purgeMock).not.toHaveBeenCalled()
  })

  it('will not delete a user whose stored e-mail is missing', async () => {
    rows[0] = { id: TARGET, email: null }
    // There is nothing to echo back, so the confirmation can never pass —
    // the account has to be dealt with in Clerk directly.
    const res = await deleteUserCompletely(TARGET, '')
    expect(res).toEqual({ ok: false, reason: 'mismatch' })
    expect(purgeMock).not.toHaveBeenCalled()
  })

  it('reports success when the data is gone but Clerk no longer has the account', async () => {
    deleteUserMock.mockRejectedValue(new Error('404 not found'))
    const res = await deleteUserCompletely(TARGET, EMAIL)
    expect(res).toEqual({ ok: true, email: EMAIL, clerkDeleted: false })
    expect(purgeMock).toHaveBeenCalledTimes(1)
  })

  it('reports a failed purge instead of claiming success', async () => {
    purgeMock.mockRejectedValue(new Error('db down'))
    const res = await deleteUserCompletely(TARGET, EMAIL)
    expect(res).toEqual({ ok: false, reason: 'error' })
    expect(deleteUserMock).not.toHaveBeenCalled()
  })
})
