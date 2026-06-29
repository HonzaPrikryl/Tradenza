import { useCallback, useMemo, useState } from 'react'

export interface Selection<T> {
  /** The underlying set of selected ids. */
  selected: Set<T>
  /** Number of selected items. */
  size: number
  /** Selected ids as an array. */
  ids: T[]
  /** Whether `id` is selected. */
  has: (id: T) => boolean
  /** Add `id` if absent, remove it if present. */
  toggle: (id: T) => void
  /** Remove `id` from the selection (no-op if absent). */
  remove: (id: T) => void
  /** Replace the selection with exactly `ids`. */
  set: (ids: Iterable<T>) => void
  /** Clear the selection. */
  clear: () => void
  /** True when every id in `ids` is selected (and `ids` is non-empty). */
  allSelected: (ids: T[]) => boolean
  /** Select all of `ids`, or clear if they are already all selected. */
  toggleAll: (ids: T[]) => void
}

/**
 * Set-based multi-selection state shared by tables and lists (row checkboxes,
 * "select all", bulk actions). Replaces the repeated `useState<Set<string>>`
 * + toggle/toggleAll boilerplate.
 */
export function useSelection<T = string>(initial?: Iterable<T>): Selection<T> {
  const [selected, setSelected] = useState<Set<T>>(() => new Set(initial))

  const has = useCallback((id: T) => selected.has(id), [selected])

  const toggle = useCallback((id: T) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const remove = useCallback((id: T) => {
    setSelected((s) => {
      if (!s.has(id)) return s
      const next = new Set(s)
      next.delete(id)
      return next
    })
  }, [])

  const set = useCallback((ids: Iterable<T>) => setSelected(new Set(ids)), [])

  const clear = useCallback(() => setSelected(new Set()), [])

  const allSelected = useCallback((ids: T[]) => ids.length > 0 && ids.every((id) => selected.has(id)), [selected])

  const toggleAll = useCallback(
    (ids: T[]) => setSelected((s) => (ids.length > 0 && ids.every((id) => s.has(id)) ? new Set<T>() : new Set(ids))),
    [],
  )

  const ids = useMemo(() => [...selected], [selected])

  return { selected, size: selected.size, ids, has, toggle, remove, set, clear, allSelected, toggleAll }
}
