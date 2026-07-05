'use server'

import { reconcileUsersWithClerk, type ReconcileResult } from '@/lib/actions/admin'

// Thin server-action wrapper so the admin "Sync" button can trigger the
// (hardened, admin-gated) reconcile explicitly. Deliberately separate from page
// rendering — this is the only place the destructive reconcile runs.
export async function syncUsersAction(): Promise<ReconcileResult> {
  return reconcileUsersWithClerk()
}
