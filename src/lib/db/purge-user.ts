import * as Sentry from '@sentry/nextjs'
import { eq } from 'drizzle-orm'
import {
  db,
  accounts,
  trades,
  tags,
  tagGroups,
  screenshots,
  candleCache,
  importLogs,
  dashboardTemplates,
  progressRules,
  ruleCompletions,
  dailyCheckins,
  users,
} from '@/lib/db'
import { isR2Configured, deleteR2Prefix } from '@/lib/r2'

// Irreversibly delete every piece of data belonging to a user. Used both by the
// Clerk `user.deleted` webhook and by self-service account deletion, so a user
// who leaves (or is removed) is fully erased — satisfying data-deletion requests.
//
// `market_candles` is intentionally NOT touched — it is a global, shared cache
// keyed by contract root, containing no personal data. User preferences live in
// cookies, so they disappear with the session.
export async function purgeUserData(userId: string): Promise<void> {
  await db.batch([
    db.delete(ruleCompletions).where(eq(ruleCompletions.userId, userId)),
    db.delete(progressRules).where(eq(progressRules.userId, userId)),
    db.delete(screenshots).where(eq(screenshots.userId, userId)),
    db.delete(candleCache).where(eq(candleCache.userId, userId)),
    db.delete(trades).where(eq(trades.userId, userId)),
    db.delete(tags).where(eq(tags.userId, userId)),
    db.delete(tagGroups).where(eq(tagGroups.userId, userId)),
    db.delete(importLogs).where(eq(importLogs.userId, userId)),
    db.delete(dashboardTemplates).where(eq(dashboardTemplates.userId, userId)),
    db.delete(dailyCheckins).where(eq(dailyCheckins.userId, userId)),
    db.delete(accounts).where(eq(accounts.userId, userId)),
    db.delete(users).where(eq(users.id, userId)),
  ])

  // Best-effort: remove the user's uploaded note images from object storage.
  // A failure here must not undo the DB purge — log and move on.
  if (isR2Configured()) {
    try {
      await deleteR2Prefix(`notes/${userId}/`)
    } catch (err) {
      Sentry.captureException(err, { tags: { component: 'purge-user', phase: 'r2' }, extra: { userId } })
    }
  }
}
