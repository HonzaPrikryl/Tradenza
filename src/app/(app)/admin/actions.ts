'use server'

import {
  reconcileUsersWithClerk,
  deleteUserCompletely,
  type ReconcileResult,
  type DeleteUserResult,
} from '@/lib/actions/admin'

// Thin server-action wrapper so the admin "Sync" button can trigger the
// (hardened, admin-gated) reconcile explicitly. Deliberately separate from page
// rendering — this is the only place the destructive reconcile runs.
export async function syncUsersAction(): Promise<ReconcileResult> {
  return reconcileUsersWithClerk()
}

export async function deleteUserAction(userId: string, confirmEmail: string): Promise<DeleteUserResult> {
  return deleteUserCompletely(userId, confirmEmail)
}
