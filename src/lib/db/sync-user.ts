import { eq } from 'drizzle-orm'
import { currentUser } from '@clerk/nextjs/server'
import { db, users } from '@/lib/db'

// Shape of the relevant fields on a Clerk `user.created` / `user.updated`
// webhook payload (snake_case, as delivered over the wire).
interface ClerkUserData {
  id: string
  email_addresses?: { id: string; email_address: string }[]
  primary_email_address_id?: string | null
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  created_at?: number // epoch ms
}

function primaryEmail(data: ClerkUserData): string | null {
  const list = data.email_addresses ?? []
  const primary = data.primary_email_address_id && list.find((e) => e.id === data.primary_email_address_id)
  return (primary || list[0])?.email_address ?? null
}

// Upsert the user registry row from a Clerk webhook payload. Idempotent: safe to
// call for both `user.created` and `user.updated`, and re-delivered webhooks.
export async function upsertUser(data: ClerkUserData): Promise<void> {
  const row = {
    email: primaryEmail(data),
    firstName: data.first_name ?? null,
    lastName: data.last_name ?? null,
    username: data.username ?? null,
  }
  const createdAt = data.created_at ? new Date(data.created_at) : undefined
  await db
    .insert(users)
    .values({ id: data.id, ...row, ...(createdAt ? { createdAt } : {}) })
    .onConflictDoUpdate({ target: users.id, set: { ...row, updatedAt: new Date() } })
}

// Just-in-time provisioning safety net. The `user.created` webhook is the primary
// real-time sync, but webhooks can be missed, delayed, or (in local dev) simply
// unreachable — which would leave a real, signed-in user with no `users` row.
// Called from the authenticated app layout, this guarantees the row exists on the
// user's first page load, independent of webhook delivery. Fast path is a single
// indexed PK lookup; it only hits Clerk + writes when the row is actually missing.
export async function ensureUserRecord(userId: string): Promise<void> {
  try {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
    if (existing.length > 0) return

    const user = await currentUser()
    if (!user || user.id !== userId) return

    await upsertUser({
      id: user.id,
      email_addresses: user.emailAddresses.map((e) => ({ id: e.id, email_address: e.emailAddress })),
      primary_email_address_id: user.primaryEmailAddressId,
      first_name: user.firstName,
      last_name: user.lastName,
      username: user.username,
      created_at: user.createdAt ?? undefined,
    })
  } catch {
    // Never let provisioning break a page render — the webhook remains the
    // backstop, and the next load will retry.
  }
}
