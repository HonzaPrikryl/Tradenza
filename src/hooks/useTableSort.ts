'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

export interface TableSortState {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

interface UseTableSortOptions {
  storageKey: string
  defaultSortBy: string
  defaultSortOrder?: 'asc' | 'desc'
  validSortKeys?: readonly string[]
  /** Initial direction when switching to a new column (default: desc). */
  orderForColumn?: (column: string) => 'asc' | 'desc'
}

const listeners = new Map<string, Set<() => void>>()

function subscribe(storageKey: string, listener: () => void) {
  let set = listeners.get(storageKey)
  if (!set) {
    set = new Set()
    listeners.set(storageKey, set)
  }
  set.add(listener)
  return () => {
    set!.delete(listener)
    if (set!.size === 0) listeners.delete(storageKey)
  }
}

function notify(storageKey: string) {
  listeners.get(storageKey)?.forEach((l) => l())
}

// useSyncExternalStore requires getSnapshot to return a stable reference until the
// store actually changes; a fresh object every call triggers an infinite re-render.
// Cache the parsed state per storageKey and only recompute when the raw string moves.
const snapshotCache = new Map<string, { raw: string | null; value: TableSortState }>()

function parseStoredSort(
  raw: string | null,
  defaults: TableSortState,
  validSortKeys?: readonly string[],
): TableSortState {
  if (!raw) return defaults
  try {
    const parsed = JSON.parse(raw) as Partial<TableSortState>
    if (!parsed.sortBy || (parsed.sortOrder !== 'asc' && parsed.sortOrder !== 'desc')) return defaults
    if (validSortKeys && !validSortKeys.includes(parsed.sortBy)) return defaults
    return { sortBy: parsed.sortBy, sortOrder: parsed.sortOrder }
  } catch {
    return defaults
  }
}

export function readStoredSort(
  storageKey: string,
  defaults: TableSortState,
  validSortKeys?: readonly string[],
): TableSortState {
  if (typeof window === 'undefined') return defaults
  let raw: string | null
  try {
    raw = localStorage.getItem(storageKey)
  } catch {
    return defaults
  }
  const cached = snapshotCache.get(storageKey)
  if (cached && cached.raw === raw) return cached.value
  const value = parseStoredSort(raw, defaults, validSortKeys)
  snapshotCache.set(storageKey, { raw, value })
  return value
}

function writeStoredSort(storageKey: string, sort: TableSortState) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(storageKey, JSON.stringify(sort))
  } catch {
    // Ignore localStorage errors (private mode, quota, etc.)
  }
  notify(storageKey)
}

function removeStoredSort(storageKey: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // Ignore localStorage errors
  }
  notify(storageKey)
}

export function useTableSort({
  storageKey,
  defaultSortBy,
  defaultSortOrder = 'desc',
  validSortKeys,
  orderForColumn,
}: UseTableSortOptions) {
  const defaults = useMemo<TableSortState>(
    () => ({ sortBy: defaultSortBy, sortOrder: defaultSortOrder }),
    [defaultSortBy, defaultSortOrder],
  )

  const getSnapshot = useCallback(
    () => readStoredSort(storageKey, defaults, validSortKeys),
    [storageKey, defaults, validSortKeys],
  )

  const getServerSnapshot = useCallback(() => defaults, [defaults])

  const sort = useSyncExternalStore((onChange) => subscribe(storageKey, onChange), getSnapshot, getServerSnapshot)

  const setSort = useCallback(
    (next: TableSortState) => {
      const current = readStoredSort(storageKey, defaults, validSortKeys)
      if (current.sortBy === next.sortBy && current.sortOrder === next.sortOrder) return
      writeStoredSort(storageKey, next)
    },
    [storageKey, defaults, validSortKeys],
  )

  const toggleSort = useCallback(
    (column: string): TableSortState => {
      const current = readStoredSort(storageKey, defaults, validSortKeys)
      const next: TableSortState =
        current.sortBy === column
          ? { sortBy: column, sortOrder: current.sortOrder === 'asc' ? 'desc' : 'asc' }
          : { sortBy: column, sortOrder: orderForColumn?.(column) ?? 'desc' }
      writeStoredSort(storageKey, next)
      return next
    },
    [storageKey, defaults, validSortKeys, orderForColumn],
  )

  const resetSort = useCallback(() => {
    removeStoredSort(storageKey)
  }, [storageKey])

  return {
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder,
    setSort,
    toggleSort,
    resetSort,
  }
}

export function parseUrlSort(
  sortBy: string | null,
  sortOrder: string | null,
  validSortKeys: readonly string[],
): TableSortState | null {
  if (!sortBy || (sortOrder !== 'asc' && sortOrder !== 'desc')) return null
  if (!validSortKeys.includes(sortBy)) return null
  return { sortBy, sortOrder }
}
