// Demo-mode detection. A user is in "demo mode" while they have zero trades of
// any kind (not just closed, and ignoring active filters) — that is the precise
// moment we want to show sample data + onboarding. As soon as their first trade
// exists the check flips and real data takes over, so no dismissal state is
// needed anywhere.

import { db, trades } from '@/lib/db'
import { count, eq } from 'drizzle-orm'

export async function userHasTrades(userId: string): Promise<boolean> {
  const rows = await db.select({ value: count() }).from(trades).where(eq(trades.userId, userId))
  return (rows[0]?.value ?? 0) > 0
}
