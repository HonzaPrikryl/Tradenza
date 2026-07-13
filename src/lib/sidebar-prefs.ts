'use server'

import { auth } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { db, users } from '@/lib/db'
import { sanitizePrefs, type SidebarPrefs } from './trade-sidebar'

const EMPTY: SidebarPrefs = { hidden: [], order: {} }

/** Global (per-user) trade-detail sidebar preferences: hidden keys + order. */
export async function readSidebarPrefs(): Promise<SidebarPrefs> {
  const { userId } = await auth()
  if (!userId) return EMPTY
  const rows = await db.select({ prefs: users.sidebarPrefs }).from(users).where(eq(users.id, userId)).limit(1)
  return sanitizePrefs(rows[0]?.prefs ?? null)
}

export async function setSidebarPrefs(prefs: SidebarPrefs) {
  const { userId } = await auth()
  if (!userId) return { success: false }
  const clean = sanitizePrefs(prefs)
  const isEmpty = clean.hidden.length === 0 && Object.keys(clean.order).length === 0
  await db
    .update(users)
    .set({ sidebarPrefs: isEmpty ? null : clean, updatedAt: new Date() })
    .where(eq(users.id, userId))
  return { success: true }
}
