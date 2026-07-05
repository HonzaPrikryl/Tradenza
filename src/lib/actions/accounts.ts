'use server'

import { db, accounts, trades } from '@/lib/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { t } from '@/i18n'
import { uuid } from '@/lib/validation'
import { authedAction, mutationAction } from '@/lib/safe-action'
import { NotFoundError, ValidationError } from '@/lib/action-errors'

export interface AccountWithStats {
  id: string
  name: string
  firm: string | null
  broker: string | null
  timezone: string | null
  accountSize: string | null
  phase: string | null
  startingBalance: string | null
  currency: string
  isDefault: boolean
  archived: boolean
  tradeCount: number
  netPnl: number
  lastTradeAt: string | null
  importedCount: number
}

const accountSchema = z.object({
  name: z.string().trim().min(1, t('validation.nameRequired')).max(80),
  firm: z.string().trim().max(60).optional().or(z.literal('')),
  broker: z.string().trim().max(60).optional().or(z.literal('')),
  timezone: z.string().trim().max(60).optional().or(z.literal('')),
  accountSize: z.coerce.number().min(0).optional().or(z.literal('')),
  phase: z.string().trim().max(40).optional().or(z.literal('')),
  startingBalance: z.coerce.number().optional().or(z.literal('')),
  // USD-only for now: whatever the client sends is normalised to USD so every
  // amount is in one currency and P&L can be summed correctly. Multi-currency is
  // a deliberate future step (would need per-currency aggregation + FX).
  currency: z
    .string()
    .optional()
    .transform(() => 'USD'),
})

export type AccountInput = z.infer<typeof accountSchema>

async function provisionGenericIfEmpty(userId: string) {
  const res = await db.execute(sql`
    with lock as (select pg_advisory_xact_lock(hashtext(${userId})))
    insert into accounts (user_id, name, currency, is_default)
    select ${userId}, ${t('validation.genericAccount')}, 'USD', true
    from lock
    where not exists (
      select 1 from accounts where user_id = ${userId} and archived = false
    )
    returning id
  `)

  const created = (res as unknown as { rows: { id: string }[] }).rows ?? []
  if (created.length > 0) {
    await db
      .update(trades)
      .set({ accountId: created[0].id })
      .where(and(eq(trades.userId, userId), isNull(trades.accountId)))
  }
}

export const getAccounts = authedAction(
  [z.boolean().default(false)],
  async ({ userId }, includeArchived): Promise<AccountWithStats[]> => {
    await provisionGenericIfEmpty(userId)

    const rows = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        firm: accounts.firm,
        broker: accounts.broker,
        timezone: accounts.timezone,
        accountSize: accounts.accountSize,
        phase: accounts.phase,
        startingBalance: accounts.startingBalance,
        currency: accounts.currency,
        isDefault: accounts.isDefault,
        archived: accounts.archived,
        tradeCount: sql<number>`count(${trades.id})`.mapWith(Number),
        netPnl: sql<number>`coalesce(sum(${trades.netPnl}), 0)`.mapWith(Number),
        lastTradeAt: sql<string | null>`max(${trades.updatedAt})::text`,
        importedCount: sql<number>`count(${trades.id}) filter (where ${trades.importSource} = 'csv')`.mapWith(Number),
      })
      .from(accounts)
      .leftJoin(trades, eq(trades.accountId, accounts.id))
      .where(
        includeArchived ? eq(accounts.userId, userId) : and(eq(accounts.userId, userId), eq(accounts.archived, false)),
      )
      .groupBy(accounts.id)
      .orderBy(accounts.createdAt)

    return rows
  },
)

export const ensureDefaultAccount = authedAction([], async ({ userId }): Promise<string> => {
  let def = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.isDefault, true)),
  })

  if (!def) {
    const any = await db.query.accounts.findFirst({
      where: eq(accounts.userId, userId),
      orderBy: (a, { asc }) => [asc(a.createdAt)],
    })
    if (any) {
      ;[def] = await db.update(accounts).set({ isDefault: true }).where(eq(accounts.id, any.id)).returning()
    } else {
      ;[def] = await db
        .insert(accounts)
        .values({ userId, name: t('validation.mainAccount'), currency: 'USD', isDefault: true })
        .returning()
    }
  }

  await db
    .update(trades)
    .set({ accountId: def!.id })
    .where(and(eq(trades.userId, userId), isNull(trades.accountId)))

  revalidatePath('/trades')
  revalidatePath('/accounts')
  return def!.id
})

export const createAccount = mutationAction([accountSchema], async ({ userId }, v) => {
  const existingCount = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(accounts)
    .where(eq(accounts.userId, userId))

  const isFirst = existingCount[0].count === 0

  const [account] = await db
    .insert(accounts)
    .values({
      userId,
      name: v.name,
      firm: v.firm || null,
      broker: v.broker || null,
      timezone: v.timezone || null,
      accountSize: v.accountSize === '' || v.accountSize === undefined ? null : String(v.accountSize),
      phase: v.phase || null,
      startingBalance: v.startingBalance === '' || v.startingBalance === undefined ? null : String(v.startingBalance),
      currency: v.currency,
      isDefault: isFirst,
    })
    .returning()

  revalidatePath('/accounts')
  revalidatePath('/trades')
  return { success: true, account }
})

export const updateAccount = mutationAction([uuid, accountSchema], async ({ userId }, id, v) => {
  const [account] = await db
    .update(accounts)
    .set({
      name: v.name,
      firm: v.firm || null,
      broker: v.broker || null,
      timezone: v.timezone || null,
      accountSize: v.accountSize === '' || v.accountSize === undefined ? null : String(v.accountSize),
      phase: v.phase || null,
      startingBalance: v.startingBalance === '' || v.startingBalance === undefined ? null : String(v.startingBalance),
      currency: v.currency,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .returning()

  revalidatePath('/accounts')
  revalidatePath('/trades')
  return { success: true, account }
})

export const setDefaultAccount = mutationAction([uuid], async ({ userId }, id) => {
  await db
    .update(accounts)
    .set({ isDefault: false })
    .where(and(eq(accounts.userId, userId), eq(accounts.isDefault, true)))

  await db
    .update(accounts)
    .set({ isDefault: true })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))

  revalidatePath('/accounts')
  return { success: true }
})

export const setAccountArchived = mutationAction([uuid, z.boolean()], async ({ userId }, id, archived) => {
  await db
    .update(accounts)
    .set({ archived })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
  revalidatePath('/accounts')
  return { success: true }
})

export const clearAccountTrades = mutationAction([uuid], async ({ userId }, id) => {
  await db.delete(trades).where(and(eq(trades.userId, userId), eq(trades.accountId, id)))
  revalidatePath('/accounts')
  revalidatePath('/trades')
  revalidatePath('/dashboard')
  revalidatePath('/add-trade')
  return { success: true }
})

export const transferTrades = mutationAction([uuid, uuid], async ({ userId }, fromId, toId) => {
  if (fromId === toId) throw new ValidationError(t('errors.account.invalidTarget'))

  const [source, target] = await Promise.all([
    db.query.accounts.findFirst({ where: and(eq(accounts.id, fromId), eq(accounts.userId, userId)) }),
    db.query.accounts.findFirst({ where: and(eq(accounts.id, toId), eq(accounts.userId, userId)) }),
  ])
  if (!source || !target) throw new NotFoundError(t('errors.account.notFound'))

  const moved = await db
    .update(trades)
    .set({ accountId: toId, updatedAt: new Date() })
    .where(and(eq(trades.userId, userId), eq(trades.accountId, fromId)))
    .returning({ id: trades.id })

  revalidatePath('/accounts')
  revalidatePath('/settings/accounts')
  revalidatePath('/trades')
  revalidatePath('/dashboard')
  return { success: true, moved: moved.length }
})

export const deleteAccount = mutationAction([uuid], async ({ userId }, id) => {
  await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
  revalidatePath('/accounts')
  revalidatePath('/trades')
  return { success: true }
})
