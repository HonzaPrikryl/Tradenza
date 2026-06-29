'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { normalizeBreakevenConfig, type BreakevenConfig, type BreakevenMode } from '@/lib/breakeven'

const COOKIE = {
  timezone: 'tz_pref_timezone',
  beMode: 'tz_pref_be_mode',
  beFrom: 'tz_pref_be_from',
  beTo: 'tz_pref_be_to',
}

export interface GlobalSettings {
  timezone: string | null
  /** Null when the breakeven band is disabled (only an exact 0 is breakeven). */
  breakeven: BreakevenConfig | null
}

function numCookie(raw?: string): number | null {
  if (raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export async function readGlobalSettings(): Promise<GlobalSettings> {
  const c = await cookies()
  return {
    timezone: c.get(COOKIE.timezone)?.value || null,
    breakeven: normalizeBreakevenConfig(
      c.get(COOKIE.beMode)?.value ?? null,
      numCookie(c.get(COOKIE.beFrom)?.value),
      numCookie(c.get(COOKIE.beTo)?.value),
    ),
  }
}

export async function setTimezonePref(timezone: string) {
  const c = await cookies()
  if (timezone) c.set(COOKIE.timezone, timezone, { path: '/' })
  else c.delete(COOKIE.timezone)
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function setBreakevenPref(input: { mode: BreakevenMode; from: number; to: number }) {
  const c = await cookies()
  c.set(COOKIE.beMode, input.mode, { path: '/' })
  c.set(COOKIE.beFrom, String(input.from), { path: '/' })
  c.set(COOKIE.beTo, String(input.to), { path: '/' })
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function resetBreakevenPref() {
  const c = await cookies()
  c.delete(COOKIE.beMode)
  c.delete(COOKIE.beFrom)
  c.delete(COOKIE.beTo)
  revalidatePath('/', 'layout')
  return { success: true }
}
