// Domain error taxonomy for server actions.
//
// Actions throw these instead of bare `Error`s so the wrapper can tell an
// *expected* failure (a missing record, a bad input, a rule violation) from an
// *unexpected* one (a bug or infra outage). Expected errors carry a stable,
// client-safe `code` and message and pass straight through; unexpected errors are
// reported to Sentry and replaced with a generic message so internals never leak.

/** Stable, machine-readable error categories. Roughly mirror HTTP semantics. */
export type ActionErrorCode =
  | 'UNAUTHORIZED' // no or invalid session
  | 'FORBIDDEN' // authenticated but not permitted
  | 'NOT_FOUND' // resource missing, or not owned by the caller
  | 'BAD_REQUEST' // invalid input or a business-rule violation
  | 'CONFLICT' // state conflict (e.g. duplicate)
  | 'INTERNAL' // unexpected failure — details withheld from the client

/**
 * Base class for every expected, client-safe action failure. The `message` is
 * intended to be shown to the user; `details` carries optional structured data
 * (e.g. zod field errors) that is also safe to send back.
 */
export class ActionError extends Error {
  readonly code: ActionErrorCode
  readonly details?: unknown

  constructor(code: ActionErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ActionError'
    this.code = code
    this.details = details
  }
}

// Subclasses take the (localized) message explicitly — callers pass a t('errors.…')
// string — so no user-facing copy lives in this module.

export class UnauthorizedError extends ActionError {
  constructor(message: string) {
    super('UNAUTHORIZED', message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends ActionError {
  constructor(message: string) {
    super('FORBIDDEN', message)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends ActionError {
  constructor(message: string) {
    super('NOT_FOUND', message)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends ActionError {
  constructor(message: string, details?: unknown) {
    super('BAD_REQUEST', message, details)
    this.name = 'ValidationError'
  }
}

export class ConflictError extends ActionError {
  constructor(message: string) {
    super('CONFLICT', message)
    this.name = 'ConflictError'
  }
}

/** Narrowing guard for expected action errors. */
export function isActionError(err: unknown): err is ActionError {
  return err instanceof ActionError
}
