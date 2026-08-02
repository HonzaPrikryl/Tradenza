'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { auth } from '@clerk/nextjs/server'
import { db, users } from '@/lib/db'
import { isValidTimezone } from '@/lib/timezones'
import { getUserTimezone } from '@/lib/user-timezone'
import { setTimezonePref } from '@/lib/global-settings'

/**
 * Record the browser's timezone the first time we see a signed-in user, and
 * never again. `isNull` in the WHERE clause makes that a single atomic write, so
 * a second tab — or a later visit from a laptop in another country — cannot
 * clobber a zone the user chose by hand.
 */
export async function detectUserTimezone(timezone: string): Promise<{ timezone: string | null }> {
  const { userId } = await auth()
  if (!userId || !isValidTimezone(timezone)) return { timezone: null }

  try {
    await db
      .update(users)
      .set({ timezone, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.timezone)))

    const effective = (await getUserTimezone()) ?? timezone
    // Mirror into the cookie so server components resolve the zone without a
    // query on every render. No revalidate: this runs during the first paint.
    await setTimezonePref(effective, { revalidate: false })
    return { timezone: effective }
  } catch {
    return { timezone: null }
  }
}

/** Explicit change from settings — overwrites the stored zone and the cookie. */
export async function saveUserTimezone(timezone: string): Promise<{ success: boolean }> {
  const { userId } = await auth()
  if (!userId || !isValidTimezone(timezone)) return { success: false }
  try {
    await db.update(users).set({ timezone, updatedAt: new Date() }).where(eq(users.id, userId))
  } catch {
    // Fall through: the cookie still carries the choice for this browser.
  }
  await setTimezonePref(timezone)
  return { success: true }
}
