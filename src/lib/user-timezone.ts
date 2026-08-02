import { eq } from 'drizzle-orm'
import { auth } from '@clerk/nextjs/server'
import { db, users } from '@/lib/db'
import { isValidTimezone } from '@/lib/timezones'

/**
 * The timezone stored on the user row, or null when none has been recorded.
 *
 * Plain module (no 'use server') so both server actions and `readGlobalSettings`
 * can share it without a circular import.
 */
export async function getUserTimezone(): Promise<string | null> {
  try {
    const { userId } = await auth()
    if (!userId) return null
    const [row] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1)
    return isValidTimezone(row?.timezone) ? row.timezone : null
  } catch {
    // Unauthenticated render, missing row, or a DB hiccup — callers treat null as
    // "not known yet" and fall back to their own default.
    return null
  }
}
