/**
 * Registry of toggleable + reorderable items in the trade-detail sidebar
 * (Statistics tab).
 *
 * Each item has a stable `key` (persisted in the user's global preference) and
 * an i18n `labelKey`. Visibility is a flat set of hidden keys; order is stored
 * per reorderable list. The panel renders items only when their key is not
 * hidden, in the resolved (persisted, then default) order.
 *
 * Framework-agnostic (no 'use client'/'use server') so it can be imported from
 * both server and client components.
 */

export interface SidebarToggle {
  key: string
  labelKey: string
}

export type SidebarListId = 'sections' | 'detailsRows' | 'riskRows'

export interface SidebarList {
  id: SidebarListId
  labelKey: string
  items: SidebarToggle[]
}

/** Toggle-only items rendered in a fixed position (not reorderable). */
export const STANDALONE_TOGGLES: SidebarToggle[] = [{ key: 'row.rating', labelKey: 'trades.detail.stats.rating' }]

/** Reorderable + toggleable lists, in popover display order. */
export const SIDEBAR_LISTS: SidebarList[] = [
  {
    id: 'sections',
    labelKey: 'trades.detail.sidebar.groups.blocks',
    items: [
      { key: 'block.runningPnl', labelKey: 'trades.detail.risk.runningPnl' },
      { key: 'block.strategy', labelKey: 'trades.detail.sidebar.blocks.strategy' },
      { key: 'block.details', labelKey: 'trades.detail.sidebar.blocks.details' },
      { key: 'block.risk', labelKey: 'trades.detail.sidebar.blocks.risk' },
      { key: 'block.tags', labelKey: 'trades.detail.sidebar.blocks.tags' },
    ],
  },
  {
    id: 'detailsRows',
    labelKey: 'trades.detail.sidebar.groups.details',
    items: [
      { key: 'row.side', labelKey: 'trades.detail.stats.side' },
      { key: 'row.account', labelKey: 'trades.detail.stats.account' },
      { key: 'row.contracts', labelKey: 'trades.detail.stats.contracts' },
      { key: 'row.points', labelKey: 'trades.detail.stats.points' },
      { key: 'row.priceMaeMfe', labelKey: 'trades.detail.risk.priceMaeMfe' },
      { key: 'row.multiplier', labelKey: 'trades.detail.stats.multiplier' },
      { key: 'row.commissions', labelKey: 'trades.detail.stats.commissions' },
      { key: 'row.netRoi', labelKey: 'trades.detail.stats.netRoi' },
      { key: 'row.grossPnl', labelKey: 'trades.detail.grossPnl' },
    ],
  },
  {
    id: 'riskRows',
    labelKey: 'trades.detail.sidebar.groups.risk',
    items: [
      { key: 'row.initialTarget', labelKey: 'trades.detail.risk.initialTarget' },
      { key: 'row.tradeRisk', labelKey: 'trades.detail.risk.tradeRisk' },
      { key: 'row.plannedR', labelKey: 'trades.detail.risk.plannedR' },
      { key: 'row.realizedR', labelKey: 'trades.detail.risk.realizedR' },
      { key: 'row.avgEntry', labelKey: 'trades.detail.stats.avgEntry' },
      { key: 'row.avgExit', labelKey: 'trades.detail.stats.avgExit' },
      { key: 'row.entryTime', labelKey: 'trades.detail.stats.entryTime' },
      { key: 'row.exitTime', labelKey: 'trades.detail.stats.exitTime' },
    ],
  },
]

/** Ordered keys per reorderable list. */
export type SidebarOrder = Partial<Record<SidebarListId, string[]>>

export interface SidebarPrefs {
  hidden: string[]
  order: SidebarOrder
}

const LIST_BY_ID = new Map(SIDEBAR_LISTS.map((l) => [l.id, l]))

export const ALL_SIDEBAR_KEYS: string[] = [
  ...STANDALONE_TOGGLES.map((i) => i.key),
  ...SIDEBAR_LISTS.flatMap((l) => l.items.map((i) => i.key)),
]

const VALID_KEYS = new Set(ALL_SIDEBAR_KEYS)

/** Default key order for a list. */
export function defaultListOrder(id: SidebarListId): string[] {
  return LIST_BY_ID.get(id)?.items.map((i) => i.key) ?? []
}

/**
 * Resolve the effective order for a list: keep any saved keys that still exist
 * (in saved order), then append any new/default keys that weren't saved yet so
 * newly added items remain visible.
 */
export function resolveListOrder(id: SidebarListId, saved?: string[]): string[] {
  const def = defaultListOrder(id)
  const valid = new Set(def)
  const seen = new Set<string>()
  const out: string[] = []
  for (const k of saved ?? []) {
    if (valid.has(k) && !seen.has(k)) {
      seen.add(k)
      out.push(k)
    }
  }
  for (const k of def) {
    if (!seen.has(k)) out.push(k)
  }
  return out
}

/** Drop unknown/duplicate keys so stale prefs can't hide nonexistent items. */
export function sanitizeHidden(hidden: unknown): string[] {
  if (!Array.isArray(hidden)) return []
  const seen = new Set<string>()
  for (const k of hidden) {
    if (typeof k === 'string' && VALID_KEYS.has(k)) seen.add(k)
  }
  return [...seen]
}

/** Normalize a possibly-stale/legacy preference blob into a clean SidebarPrefs. */
export function sanitizePrefs(raw: unknown): SidebarPrefs {
  // Legacy format: a bare array of hidden keys.
  if (Array.isArray(raw)) return { hidden: sanitizeHidden(raw), order: {} }
  const obj = (raw ?? {}) as Record<string, unknown>
  const order: SidebarOrder = {}
  const rawOrder = (obj.order ?? {}) as Record<string, unknown>
  for (const list of SIDEBAR_LISTS) {
    const saved = rawOrder[list.id]
    if (Array.isArray(saved)) order[list.id] = resolveListOrder(list.id, saved as string[])
  }
  return { hidden: sanitizeHidden(obj.hidden), order }
}
