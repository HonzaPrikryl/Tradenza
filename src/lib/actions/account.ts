'use server'

import { clerkClient } from '@clerk/nextjs/server'
import { mutationAction } from '@/lib/safe-action'
import { purgeUserData } from '@/lib/db/purge-user'

// Self-service account deletion. Erases all of the user's data, then deletes the
// Clerk user (which also fires the `user.deleted` webhook — harmless, since the
// purge is idempotent). Data is removed first so that if the Clerk call fails the
// user can simply retry; the reverse could leave orphaned data behind.
export const deleteMyAccount = mutationAction([], async ({ userId }) => {
  await purgeUserData(userId)
  const client = await clerkClient()
  await client.users.deleteUser(userId)
  return { success: true }
})
