'use server'

import { auth } from '@clerk/nextjs/server'
import { db, tags, tagGroups, tradeTags, trades } from '@/lib/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { t } from '@/i18n'
import { UNGROUPED_ID } from '@/lib/tags-constants'

async function getUserId(): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')
  return userId
}

export interface TagValue {
  id: string
  name: string
  color: string
  groupId: string | null
  tradeCount: number
}

export interface TagGroupWithValues {
  id: string
  name: string
  color: string
  values: TagValue[]
}

const nameColorSchema = z.object({
  name: z.string().trim().min(1, t('validation.nameRequired')).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, t('validation.invalidColor'))
    .default('#6366f1'),
})

const valueSchema = nameColorSchema.extend({
  groupId: z.string().uuid().optional(),
})

export async function getTagGroups(): Promise<TagGroupWithValues[]> {
  const userId = await getUserId()

  const [groups, values] = await Promise.all([
    db.select().from(tagGroups).where(eq(tagGroups.userId, userId)).orderBy(tagGroups.sortOrder, tagGroups.name),
    db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        groupId: tags.groupId,
        tradeCount: sql<number>`count(${tradeTags.tradeId})`.mapWith(Number),
      })
      .from(tags)
      .leftJoin(tradeTags, eq(tradeTags.tagId, tags.id))
      .where(eq(tags.userId, userId))
      .groupBy(tags.id)
      .orderBy(tags.name),
  ])

  const result: TagGroupWithValues[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    values: values.filter((v) => v.groupId === g.id),
  }))

  const ungrouped = values.filter((v) => !v.groupId)
  if (ungrouped.length > 0) {
    result.push({ id: UNGROUPED_ID, name: t('common.ungrouped'), color: '#64748b', values: ungrouped })
  }

  return result
}

// ─── Groups: CRUD ────────────────────────────────────────────────────────────

export async function createTagGroup(input: z.infer<typeof nameColorSchema>) {
  const userId = await getUserId()
  const { name, color } = nameColorSchema.parse(input)

  const existing = await db.query.tagGroups.findFirst({
    where: and(eq(tagGroups.userId, userId), sql`lower(${tagGroups.name}) = lower(${name})`),
  })
  if (existing) return { success: true, group: existing, existed: true }

  const maxRow = await db
    .select({ m: sql<number>`coalesce(max(${tagGroups.sortOrder}), -1)`.mapWith(Number) })
    .from(tagGroups)
    .where(eq(tagGroups.userId, userId))
  const nextOrder = (maxRow[0]?.m ?? -1) + 1

  const [group] = await db.insert(tagGroups).values({ userId, name, color, sortOrder: nextOrder }).returning()
  revalidatePath('/trades')
  revalidatePath('/settings/tags')
  return { success: true, group, existed: false }
}

export async function reorderTagGroups(orderedIds: string[]) {
  const userId = await getUserId()
  await Promise.all(
    orderedIds.map((id, i) =>
      db
        .update(tagGroups)
        .set({ sortOrder: i })
        .where(and(eq(tagGroups.id, id), eq(tagGroups.userId, userId))),
    ),
  )
  revalidatePath('/trades')
  revalidatePath('/settings/tags')
  return { success: true }
}

export async function updateTagGroup(id: string, input: z.infer<typeof nameColorSchema>) {
  const userId = await getUserId()
  const { name, color } = nameColorSchema.parse(input)
  const [group] = await db
    .update(tagGroups)
    .set({ name, color })
    .where(and(eq(tagGroups.id, id), eq(tagGroups.userId, userId)))
    .returning()
  revalidatePath('/trades')
  revalidatePath('/settings/tags')
  return { success: true, group }
}

export async function deleteTagGroup(id: string) {
  const userId = await getUserId()
  await db.delete(tagGroups).where(and(eq(tagGroups.id, id), eq(tagGroups.userId, userId)))
  revalidatePath('/trades')
  revalidatePath('/settings/tags')
  return { success: true }
}

// ─── Values (tags): CRUD ──────────────────────────────────────────────────────

export async function createTag(input: z.infer<typeof valueSchema>) {
  const userId = await getUserId()
  const { name, color, groupId } = valueSchema.parse(input)

  const existing = await db.query.tags.findFirst({
    where: and(
      eq(tags.userId, userId),
      groupId ? eq(tags.groupId, groupId) : sql`${tags.groupId} is null`,
      sql`lower(${tags.name}) = lower(${name})`,
    ),
  })
  if (existing) return { success: true, tag: existing, existed: true }

  const [tag] = await db
    .insert(tags)
    .values({ userId, name, color, groupId: groupId ?? null })
    .returning()

  revalidatePath('/trades')
  revalidatePath('/settings/tags')
  return { success: true, tag, existed: false }
}

export async function updateTag(id: string, input: { name: string; color?: string; groupId?: string | null }) {
  const userId = await getUserId()
  const { name, color } = nameColorSchema.parse({ name: input.name, color: input.color })
  const set: { name: string; color: string; groupId?: string | null } = { name, color }
  if (input.groupId !== undefined) set.groupId = input.groupId || null
  const [tag] = await db
    .update(tags)
    .set(set)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .returning()
  revalidatePath('/trades')
  revalidatePath('/settings/tags')
  return { success: true, tag }
}

export async function deleteTag(id: string) {
  const userId = await getUserId()
  await db.delete(tags).where(and(eq(tags.id, id), eq(tags.userId, userId)))
  revalidatePath('/trades')
  revalidatePath('/settings/tags')
  return { success: true }
}

export async function setTradeTags(tradeId: string, tagIds: string[]) {
  const userId = await getUserId()

  const trade = await db.query.trades.findFirst({
    where: and(eq(trades.id, tradeId), eq(trades.userId, userId)),
    columns: { id: true },
  })
  if (!trade) throw new Error('Trade not found')

  await db.delete(tradeTags).where(eq(tradeTags.tradeId, tradeId))

  if (tagIds.length > 0) {
    const owned = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)))

    const ownedIds = owned.map((v) => v.id)
    if (ownedIds.length > 0) {
      await db.insert(tradeTags).values(ownedIds.map((tagId) => ({ tradeId, tagId })))
    }
  }

  revalidatePath('/trades')
  revalidatePath(`/trades/${tradeId}`)
  return { success: true }
}
