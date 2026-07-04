'use server'

import { db, tags, tagGroups, tradeTags, trades } from '@/lib/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { t } from '@/i18n'
import { UNGROUPED_ID } from '@/lib/tags-constants'
import { uuid, uuidArray } from '@/lib/validation'
import { authedAction } from '@/lib/safe-action'
import { NotFoundError } from '@/lib/action-errors'

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

const updateTagSchema = nameColorSchema.extend({
  groupId: z.string().uuid().nullable().optional(),
})

// Both the trades table and the tag manager read from the same source of truth.
function revalidateTags() {
  revalidatePath('/trades')
  revalidatePath('/settings/tags')
}

export const getTagGroups = authedAction([], async ({ userId }): Promise<TagGroupWithValues[]> => {
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
})

// ─── Groups: CRUD ────────────────────────────────────────────────────────────

export const createTagGroup = authedAction([nameColorSchema], async ({ userId }, { name, color }) => {
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
  revalidateTags()
  return { success: true, group, existed: false }
})

export const reorderTagGroups = authedAction([uuidArray], async ({ userId }, orderedIds) => {
  await Promise.all(
    orderedIds.map((id, i) =>
      db
        .update(tagGroups)
        .set({ sortOrder: i })
        .where(and(eq(tagGroups.id, id), eq(tagGroups.userId, userId))),
    ),
  )
  revalidateTags()
  return { success: true }
})

export const updateTagGroup = authedAction([uuid, nameColorSchema], async ({ userId }, id, { name, color }) => {
  const [group] = await db
    .update(tagGroups)
    .set({ name, color })
    .where(and(eq(tagGroups.id, id), eq(tagGroups.userId, userId)))
    .returning()
  revalidateTags()
  return { success: true, group }
})

export const deleteTagGroup = authedAction([uuid], async ({ userId }, id) => {
  await db.delete(tagGroups).where(and(eq(tagGroups.id, id), eq(tagGroups.userId, userId)))
  revalidateTags()
  return { success: true }
})

// ─── Values (tags): CRUD ──────────────────────────────────────────────────────

export const createTag = authedAction([valueSchema], async ({ userId }, { name, color, groupId }) => {
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

  revalidateTags()
  return { success: true, tag, existed: false }
})

export const updateTag = authedAction([uuid, updateTagSchema], async ({ userId }, id, { name, color, groupId }) => {
  const set: { name: string; color: string; groupId?: string | null } = { name, color }
  if (groupId !== undefined) set.groupId = groupId || null
  const [tag] = await db
    .update(tags)
    .set(set)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .returning()
  revalidateTags()
  return { success: true, tag }
})

export const deleteTag = authedAction([uuid], async ({ userId }, id) => {
  await db.delete(tags).where(and(eq(tags.id, id), eq(tags.userId, userId)))
  revalidateTags()
  return { success: true }
})

export const setTradeTags = authedAction([uuid, uuidArray], async ({ userId }, tradeId, tagIds) => {
  const trade = await db.query.trades.findFirst({
    where: and(eq(trades.id, tradeId), eq(trades.userId, userId)),
    columns: { id: true },
  })
  if (!trade) throw new NotFoundError(t('errors.trade.notFound'))

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
})
