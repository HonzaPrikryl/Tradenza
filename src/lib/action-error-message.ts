import { t } from '@/i18n'
import type { ActionErrorCode } from '@/lib/action-errors'

// Maps each error code to its localized message key. Used as the client-facing
// counterpart of the server error taxonomy (see lib/action-errors.ts).
const CODE_KEY: Record<ActionErrorCode, string> = {
  UNAUTHORIZED: 'errors.unauthorized',
  FORBIDDEN: 'errors.forbidden',
  NOT_FOUND: 'errors.notFound',
  BAD_REQUEST: 'errors.badRequest',
  CONFLICT: 'errors.conflict',
  INTERNAL: 'errors.internal',
}

// A thrown ActionError keeps its `code` within the same runtime (dev, server
// components). Across the network boundary in production Next.js redacts thrown
// errors, so `code` may be absent — hence the duck-typed read plus fallback.
function actionErrorCode(err: unknown): ActionErrorCode | null {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' && code in CODE_KEY ? (code as ActionErrorCode) : null
}

/**
 * Resolve a localized, user-facing message from an error thrown by a server
 * action.
 *
 * Priority:
 *  1. a recognised, non-internal `ActionError` → its (already localized) message,
 *     falling back to the code's i18n text;
 *  2. the caller's feature-specific `fallbackKey` (e.g. `'trades.deleteFailed'`);
 *  3. a generic localized message.
 *
 * Internal errors never surface their message — the feature fallback is used so
 * server internals stay hidden.
 *
 * @param err Whatever was caught from the action call.
 * @param fallbackKey i18n key for a feature-specific fallback message.
 */
export function getActionErrorMessage(err: unknown, fallbackKey?: string): string {
  const code = actionErrorCode(err)
  if (code && code !== 'INTERNAL') {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
    return t(CODE_KEY[code])
  }
  return t(fallbackKey ?? 'errors.generic')
}
