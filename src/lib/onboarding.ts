'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db, users } from '@/lib/db'

export async function isOnboardingDismissed(): Promise<boolean> {
  const { userId } = await auth()
  if (!userId) return false
  const rows = await db
    .select({ dismissedAt: users.onboardingDismissedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return rows[0]?.dismissedAt != null
}

export async function dismissOnboarding() {
  const { userId } = await auth()
  if (!userId) return { success: false }
  await db.update(users).set({ onboardingDismissedAt: new Date() }).where(eq(users.id, userId))
  revalidatePath('/', 'layout')
  return { success: true }
}
