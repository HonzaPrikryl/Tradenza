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
