import { eq, sql } from 'drizzle-orm'
import { db, tags, tagGroups, strategies } from '@/lib/db'
import { matchKey, tagKey } from '@/lib/trade-bundle'

// Both import paths — the spreadsheet CSV and the full backup — arrive with
// strategies and tags named rather than keyed, because the file has no idea what
// ids the receiving user's rows have. Resolving those names to ids, and creating
// what is missing, is the same job in both places, so it lives here once.
//
// Matching is case-insensitive and whitespace-trimmed throughout: a user who
// wrote "Breakout" in one account and "breakout " in another means the same
// thing, and quietly creating a second row for it would split the very stats
// they imported the file to keep.

export interface StrategySeed {
  name: string
  description?: string | null
  entryChecklist?: string[] | null
  exitChecklist?: string[] | null
  imageUrls?: string[] | null
  color?: string | null
  sortOrder?: number | null
}

export interface TagSeed {
  /** Group name, or `null` for the ungrouped bucket. */
  group: string | null
  name: string
  color?: string | null
}

export interface TagGroupSeed {
  name: string
  color?: string | null
  sortOrder?: number | null
}

export interface Resolved {
  /** Name key → row id. See {@link matchKey} / {@link tagKey}. */
  byKey: Map<string, string>
  created: number
}

/** Rewrites image references when rows change owner; a no-op when omitted. */
export interface ImageRewriter {
  url: (original: string) => Promise<string>
  html: (html: string | null) => Promise<string | null>
}

const DEFAULT_COLOR = '#6366f1'

async function nextSortOrder(table: typeof strategies | typeof tagGroups, userId: string): Promise<number> {
  const row = await db
    .select({ m: sql<number>`coalesce(max(${table.sortOrder}), -1)`.mapWith(Number) })
    .from(table)
    .where(eq(table.userId, userId))
  return (row[0]?.m ?? -1) + 1
}

/**
 * Map strategy names to ids for `userId`, creating the ones that don't exist.
 *
 * Seeds carrying only a name (a CSV column has nothing else) create a bare
 * strategy the user can flesh out later — better than dropping the link and
 * leaving the imported trades unattributed.
 */
export async function resolveStrategyIds(
  userId: string,
  seeds: StrategySeed[],
  images?: ImageRewriter,
): Promise<Resolved> {
  const wanted = new Map<string, StrategySeed>()
  for (const s of seeds) {
    const key = matchKey(s.name)
    if (!key) continue
    // A later seed with real detail beats an earlier name-only one.
    const prev = wanted.get(key)
    if (!prev || (prev.description == null && s.description != null)) wanted.set(key, s)
  }

  const byKey = new Map<string, string>()
  if (wanted.size === 0) return { byKey, created: 0 }

  const existing = await db
    .select({ id: strategies.id, name: strategies.name })
    .from(strategies)
    .where(eq(strategies.userId, userId))
  for (const row of existing) byKey.set(matchKey(row.name), row.id)

  const missing = [...wanted.entries()].filter(([key]) => !byKey.has(key))
  if (missing.length === 0) return { byKey, created: 0 }

  let order = await nextSortOrder(strategies, userId)
  for (const [key, s] of missing) {
    const imageUrls =
      s.imageUrls && images ? await Promise.all(s.imageUrls.map((u) => images.url(u))) : (s.imageUrls ?? null)
    const [row] = await db
      .insert(strategies)
      .values({
        userId,
        name: s.name,
        description: images ? await images.html(s.description ?? null) : (s.description ?? null),
        entryChecklist: s.entryChecklist ?? null,
        exitChecklist: s.exitChecklist ?? null,
        imageUrls,
        color: s.color ?? DEFAULT_COLOR,
        sortOrder: s.sortOrder ?? order++,
      })
      .returning({ id: strategies.id })
    byKey.set(key, row.id)
  }
  return { byKey, created: missing.length }
}

/**
 * Map tags to ids for `userId`, creating groups and tags as needed.
 *
 * Keyed by group *and* name by default, so "Breakout" under **Setup** and
 * "Breakout" under **Mistake** stay two different tags — which is the whole
 * point of the group. `ignoreGroups` collapses that to the name alone, for
 * sources that carry no grouping (the CSV export writes tag names only); an
 * existing tag then wins whichever group it happens to sit in, rather than a
 * duplicate being created outside it.
 */
export async function resolveTagIds(
  userId: string,
  seeds: TagSeed[],
  groupMeta: TagGroupSeed[] = [],
  opts: { ignoreGroups?: boolean } = {},
): Promise<Resolved> {
  const keyOf = (group: string | null, name: string) => (opts.ignoreGroups ? matchKey(name) : tagKey(group, name))

  const wanted = new Map<string, TagSeed>()
  for (const tag of seeds) {
    if (!matchKey(tag.name)) continue
    wanted.set(keyOf(tag.group, tag.name), tag)
  }

  const byKey = new Map<string, string>()
  if (wanted.size === 0) return { byKey, created: 0 }

  // ── Groups ──
  // A source with no grouping at all (the CSV export names tags only) never
  // touches tag_groups, so it should not pay for reading them either.
  const neededGroups = new Set<string>()
  for (const tag of wanted.values()) if (tag.group) neededGroups.add(matchKey(tag.group))

  const existingGroups =
    neededGroups.size === 0 && opts.ignoreGroups
      ? []
      : await db.select({ id: tagGroups.id, name: tagGroups.name }).from(tagGroups).where(eq(tagGroups.userId, userId))
  const groupIdByKey = new Map(existingGroups.map((g) => [matchKey(g.name), g.id]))
  const missingGroups = [...neededGroups].filter((key) => !groupIdByKey.has(key))

  if (missingGroups.length > 0) {
    let order = await nextSortOrder(tagGroups, userId)
    const meta = new Map(groupMeta.map((g) => [matchKey(g.name), g]))
    for (const key of missingGroups) {
      const g = meta.get(key)
      // When the source listed no group metadata, fall back to a tag that names
      // this group: its spelling keeps the original casing and its colour keeps
      // the new group from coming out grey while every tag under it is blue.
      const fromTag = [...wanted.values()].find((tag) => tag.group && matchKey(tag.group) === key)
      const [row] = await db
        .insert(tagGroups)
        .values({
          userId,
          name: g?.name ?? fromTag?.group ?? key,
          color: g?.color ?? fromTag?.color ?? DEFAULT_COLOR,
          sortOrder: g?.sortOrder ?? order++,
        })
        .returning({ id: tagGroups.id })
      groupIdByKey.set(key, row.id)
    }
  }

  // ── Tags ──
  // Only pre-existing groups can own pre-existing tags, so this index needs
  // nothing from the groups just created.
  const groupNameById = new Map(existingGroups.map((g) => [g.id, g.name]))
  const existingTags = await db
    .select({ id: tags.id, name: tags.name, groupId: tags.groupId })
    .from(tags)
    .where(eq(tags.userId, userId))
  for (const row of existingTags) {
    const groupName = row.groupId ? (groupNameById.get(row.groupId) ?? null) : null
    const key = keyOf(groupName, row.name)
    // First match wins, so an ungrouped lookup lands on the tag the user
    // already has rather than the last one the query happened to return.
    if (!byKey.has(key)) byKey.set(key, row.id)
  }

  const missing = [...wanted.entries()].filter(([key]) => !byKey.has(key))
  for (const [key, tag] of missing) {
    const [row] = await db
      .insert(tags)
      .values({
        userId,
        groupId: tag.group ? (groupIdByKey.get(matchKey(tag.group)) ?? null) : null,
        name: tag.name,
        color: tag.color ?? DEFAULT_COLOR,
      })
      .returning({ id: tags.id })
    byKey.set(key, row.id)
  }
  return { byKey, created: missing.length }
}
