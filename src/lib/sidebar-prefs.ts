'use server'

import { cookies } from 'next/headers'
import { sanitizePrefs, type SidebarPrefs } from './trade-sidebar'

const COOKIE = 'tz_pref_sidebar'
const ONE_YEAR = 60 * 60 * 24 * 365

/** Global (per-user) trade-detail sidebar preferences: hidden keys + order. */
export async function readSidebarPrefs(): Promise<SidebarPrefs> {
  const c = await cookies()
  const raw = c.get(COOKIE)?.value
  if (!raw) return { hidden: [], order: {} }
  try {
    return sanitizePrefs(JSON.parse(raw))
  } catch {
    return { hidden: [], order: {} }
  }
}

export async function setSidebarPrefs(prefs: SidebarPrefs) {
  const c = await cookies()
  const clean = sanitizePrefs(prefs)
  const isEmpty = clean.hidden.length === 0 && Object.keys(clean.order).length === 0
  if (isEmpty) {
    c.delete(COOKIE)
  } else {
    c.set(COOKIE, JSON.stringify(clean), { path: '/', maxAge: ONE_YEAR })
  }
  return { success: true }
}
