import { clerkClient } from '@clerk/nextjs/server'
import { sql } from 'drizzle-orm'
import { db, users } from '@/lib/db'
import { purgeUserData } from '@/lib/db/purge-user'
import { isAdmin } from '@/lib/admin'

export interface UserOverviewRow {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  username: string | null
  createdAt: string
  tradeCount: number
  journaledCount: number
  accountCount: number
  reviewCount: number
  lastActiveAt: string | null
}

export async function getUserOverview(): Promise<UserOverviewRow[]> {
  if (!(await isAdmin())) throw new Error('Forbidden')

  const res = await db.execute(sql`
    select
      u.id,
      u.email,
      u.first_name as "firstName",
      u.last_name  as "lastName",
      u.username,
      u.created_at as "createdAt",
      count(distinct t.id)::int as "tradeCount",
      count(distinct t.id) filter (where t.notes is not null)::int as "journaledCount",
      count(distinct a.id)::int as "accountCount",
      -- A "review" = a day the user engaged with the discipline loop: either wrote
      -- a daily note OR ticked at least one rule as done. Counted as distinct days.
      (select count(distinct day) from (
        select date as day from daily_checkins where user_id = u.id and note is not null and note <> ''
        union
        select date as day from rule_completions where user_id = u.id
      ) reviewed_days)::int as "reviewCount",
      greatest(
        max(t.created_at),
        (select max(updated_at) from daily_checkins where user_id = u.id),
        (select max(created_at) from rule_completions where user_id = u.id)
      ) as "lastActiveAt"
    from users u
    left join trades t on t.user_id = u.id
    left join accounts a on a.user_id = u.id
    group by u.id
    order by u.created_at desc
  `)

  return (res as unknown as { rows: UserOverviewRow[] }).rows ?? []
}

export type ReconcileResult =
  | { ok: true; removed: number; checked: number }
  | { ok: false; reason: 'forbidden' | 'skipped' | 'error' }

// Reconcile the `users` mirror against Clerk (the source of truth) and purge rows
// for users that no longer exist there. This is the delete-side counterpart to
// `ensureUserRecord`, and the safety net for a missed `user.deleted` webhook.
//
// This is DESTRUCTIVE, so it is deliberately NOT run on page load — it is invoked
// explicitly (the admin "Sync" button) and hardened so it can never mass-delete:
//   • any error → abort, no changes
//   • Clerk returned nobody → abort (a transient blip must not wipe the table)
//   • the enumerated count doesn't match Clerk's reported totalCount → abort
//     (an incomplete/racey listing must not mark real users as ghosts)
// Only after a *complete, consistent* Clerk snapshot do we purge the rows that are
// provably absent from it.
export async function reconcileUsersWithClerk(): Promise<ReconcileResult> {
  if (!(await isAdmin())) return { ok: false, reason: 'forbidden' }
  try {
    const client = await clerkClient()
    const clerkIds = new Set<string>()
    const limit = 100
    let offset = 0
    let reportedTotal = -1
    for (;;) {
      const res = await client.users.getUserList({ limit, offset })
      reportedTotal = res.totalCount
      for (const u of res.data) clerkIds.add(u.id)
      if (res.data.length < limit) break
      offset += res.data.length
    }

    // Guards: never purge on an empty or incomplete/inconsistent enumeration.
    if (clerkIds.size === 0) return { ok: false, reason: 'skipped' }
    if (reportedTotal >= 0 && clerkIds.size !== reportedTotal) return { ok: false, reason: 'skipped' }

    const dbRows = await db.select({ id: users.id }).from(users)
    const ghosts = dbRows.filter((r) => !clerkIds.has(r.id))
    for (const g of ghosts) {
      await purgeUserData(g.id)
    }
    return { ok: true, removed: ghosts.length, checked: dbRows.length }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

// ─── Single-user detail ─────────────────────────────────────────────────────

export interface AdminUserDetail {
  user: {
    id: string
    email: string | null
    firstName: string | null
    lastName: string | null
    username: string | null
    createdAt: string
  }
  stats: {
    tradeCount: number
    journaledCount: number
    closedCount: number
    winCount: number
    netPnl: number
    firstTradeAt: string | null
    lastTradeAt: string | null
    accountCount: number
    reviewCount: number
    ruleCount: number
    tagCount: number
    importCount: number
    templateCount: number
    lastActiveAt: string | null
  }
  accounts: {
    id: string
    name: string
    firm: string | null
    phase: string | null
    archived: boolean
    tradeCount: number
    netPnl: number
  }[]
  recentTrades: {
    id: string
    symbol: string
    direction: string
    status: string
    netPnl: number | null
    entryDatetime: string
  }[]
}

function rowsOf<T>(res: unknown): T[] {
  return (res as { rows: T[] }).rows ?? []
}

// Everything an admin needs about one user, gathered in a few focused queries
// (clearer and cheaper than one mega-join). Returns null when the user id is
// unknown, so the page can 404. Admin-gated, like the overview.
export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  if (!(await isAdmin())) throw new Error('Forbidden')

  const [userRes, tradeRes, countRes, accountsRes, tradesRes] = await Promise.all([
    db.execute(sql`
      select id, email, first_name as "firstName", last_name as "lastName",
             username, created_at as "createdAt"
      from users where id = ${userId}
    `),
    db.execute(sql`
      select
        count(*)::int as "tradeCount",
        count(*) filter (where notes is not null)::int as "journaledCount",
        count(*) filter (where status = 'closed')::int as "closedCount",
        count(*) filter (where status = 'closed' and net_pnl::numeric > 0)::int as "winCount",
        coalesce(sum(net_pnl::numeric), 0)::float8 as "netPnl",
        min(entry_datetime) as "firstTradeAt",
        max(entry_datetime) as "lastTradeAt",
        max(created_at) as "lastTradeCreatedAt"
      from trades where user_id = ${userId}
    `),
    db.execute(sql`
      select
        (select count(*) from accounts where user_id = ${userId})::int as "accountCount",
        -- A "review" = a day with a daily note OR at least one rule ticked done.
        (select count(distinct day) from (
          select date as day from daily_checkins where user_id = ${userId} and note is not null and note <> ''
          union
          select date as day from rule_completions where user_id = ${userId}
        ) reviewed_days)::int as "reviewCount",
        (select count(*) from progress_rules where user_id = ${userId} and archived_at is null)::int as "ruleCount",
        (select count(*) from tags where user_id = ${userId})::int as "tagCount",
        (select count(*) from import_logs where user_id = ${userId})::int as "importCount",
        (select count(*) from dashboard_templates where user_id = ${userId} and is_preset = false)::int as "templateCount",
        (select max(updated_at) from daily_checkins where user_id = ${userId}) as "lastCheckinAt",
        (select max(created_at) from rule_completions where user_id = ${userId}) as "lastRuleAt"
    `),
    db.execute(sql`
      select a.id, a.name, a.firm, a.phase, a.archived,
             count(t.id)::int as "tradeCount",
             coalesce(sum(t.net_pnl::numeric), 0)::float8 as "netPnl"
      from accounts a
      left join trades t on t.account_id = a.id and t.user_id = ${userId}
      where a.user_id = ${userId}
      group by a.id
      order by "tradeCount" desc
    `),
    db.execute(sql`
      select id, symbol, direction, status,
             net_pnl::float8 as "netPnl", entry_datetime as "entryDatetime"
      from trades where user_id = ${userId}
      order by entry_datetime desc
      limit 20
    `),
  ])

  const user = rowsOf<AdminUserDetail['user']>(userRes)[0]
  if (!user) return null

  const trade = rowsOf<
    Omit<
      AdminUserDetail['stats'],
      'accountCount' | 'reviewCount' | 'ruleCount' | 'tagCount' | 'importCount' | 'templateCount' | 'lastActiveAt'
    > & { lastTradeCreatedAt: string | null }
  >(tradeRes)[0]
  const counts = rowsOf<{
    accountCount: number
    reviewCount: number
    ruleCount: number
    tagCount: number
    importCount: number
    templateCount: number
    lastCheckinAt: string | null
    lastRuleAt: string | null
  }>(countRes)[0]

  const times = [trade?.lastTradeCreatedAt, counts?.lastCheckinAt, counts?.lastRuleAt, user.createdAt]
    .filter((v): v is string => Boolean(v))
    .map((v) => new Date(v).getTime())
  const lastActiveAt = times.length ? new Date(Math.max(...times)).toISOString() : null

  return {
    user,
    stats: {
      tradeCount: trade?.tradeCount ?? 0,
      journaledCount: trade?.journaledCount ?? 0,
      closedCount: trade?.closedCount ?? 0,
      winCount: trade?.winCount ?? 0,
      netPnl: trade?.netPnl ?? 0,
      firstTradeAt: trade?.firstTradeAt ?? null,
      lastTradeAt: trade?.lastTradeAt ?? null,
      accountCount: counts?.accountCount ?? 0,
      reviewCount: counts?.reviewCount ?? 0,
      ruleCount: counts?.ruleCount ?? 0,
      tagCount: counts?.tagCount ?? 0,
      importCount: counts?.importCount ?? 0,
      templateCount: counts?.templateCount ?? 0,
      lastActiveAt,
    },
    accounts: rowsOf<AdminUserDetail['accounts'][number]>(accountsRes),
    recentTrades: rowsOf<AdminUserDetail['recentTrades'][number]>(tradesRes),
  }
}
