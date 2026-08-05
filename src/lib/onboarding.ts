'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import { db, users } from '@/lib/db'

/** Whether the user has done each getting-started step, and dismissed the list. */
export interface OnboardingStatus {
  dismissed: boolean
  hasTrades: boolean
  hasStrategy: boolean
  hasTag: boolean
  hasRule: boolean
}

const NOTHING_DONE: OnboardingStatus = {
  dismissed: false,
  hasTrades: false,
  hasStrategy: false,
  hasTag: false,
  hasRule: false,
}

/**
 * The getting-started checklist, as one query.
 *
 * Every step is an existence check, and asking them separately meant the
 * dashboard opened six connections just to decide whether to render a four-item
 * list. The neon-http driver has no pool — each query is its own connection
 * attempt — so a page that fans out is a page that trips Neon's ceiling on
 * concurrent connection attempts, which is what took the dashboard down for a
 * user. `exists` also stops at the first row, so this is cheaper than any single
 * one of the reads it replaces.
 *
 * The filters mirror the list actions exactly (archived strategies and rules
 * don't count), so a step ticks at the same moment it did before.
 */
export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const { userId } = await auth()
  if (!userId) return NOTHING_DONE

  const res = await db.execute(sql`
    select
      (select onboarding_dismissed_at from users where id = ${userId}) is not null as "dismissed",
      exists(select 1 from trades where user_id = ${userId}) as "hasTrades",
      exists(select 1 from strategies where user_id = ${userId} and archived_at is null) as "hasStrategy",
      exists(select 1 from tags where user_id = ${userId}) as "hasTag",
      exists(select 1 from progress_rules where user_id = ${userId} and archived_at is null) as "hasRule"
  `)

  const row = (res as unknown as { rows: OnboardingStatus[] }).rows?.[0]
  return row ?? NOTHING_DONE
}

export async function dismissOnboarding() {
  const { userId } = await auth()
  if (!userId) return { success: false }
  await db.update(users).set({ onboardingDismissedAt: new Date() }).where(eq(users.id, userId))
  revalidatePath('/', 'layout')
  return { success: true }
}
