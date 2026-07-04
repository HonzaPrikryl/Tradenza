'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

const COOKIE = 'tz_onboarding_dismissed'

export async function isOnboardingDismissed(): Promise<boolean> {
  const c = await cookies()
  return c.get(COOKIE)?.value === '1'
}

export async function dismissOnboarding() {
  const c = await cookies()
  c.set(COOKIE, '1', { path: '/', maxAge: 60 * 60 * 24 * 365 })
  revalidatePath('/', 'layout')
  return { success: true }
}
