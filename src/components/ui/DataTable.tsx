'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import SkeletonTable, { type SkeletonColumn } from '@/components/ui/SkeletonTable'
import SortableTh from '@/components/ui/SortableTh'
import { useTableSort } from '@/hooks/useTableSort'
import type { Selection } from '@/hooks/useSelection'
import {
  Table,
  TableBody,
  TableCell,
  TableCheckbox,
  TableContainer,
  TableEmptyRow,
  TableHead,
  TableHeadRow,
  TableHeaderCell,
  TableRow,
  type Align,
} from '@/components/ui/Table'

export type SortDir = 'asc' | 'desc'
export interface SortState {
  by: string
  order: SortDir
}

export interface DataTableColumn<T> {
  /** Stable column id; doubles as the sort key when the column is sortable. */
  key: string
  /** Header content. Sortable columns must use a plain string. */
  header: ReactNode
  /** Body cell renderer. */
  cell: (row: T, index: number) => ReactNode
  align?: Align
  /** Enable click-to-sort on this column's header. */
  sortable?: boolean
  /**
   * Comparable value for client-side sorting. Required for sortable columns
   * unless the table sorts server-side (`manualSorting`).
   */
  sortValue?: (row: T) => string | number | boolean | Date | null | undefined
  /** Initial direction the first time this column is selected. */
  initialSortDir?: SortDir
  headerClassName?: string
  cellClassName?: string | ((row: T) => string | undefined)
  /** Fixed column width class (e.g. 'w-[210px]'); renders a `<colgroup>`. */
  width?: string
  /** Native `title` attribute for body cells, useful with truncation. */
  cellTitle?: (row: T) => string | undefined
  /** Skeleton shape for this column while `loading`. */
  skeleton?: SkeletonColumn
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  rowKey: (row: T) => string

  /** Controlled sort. Omit to let the table manage sorting itself. */
  sort?: SortState
  onSortChange?: (next: SortState) => void
  /** Uncontrolled starting sort. */
  defaultSort?: SortState
  /** Persist the uncontrolled sort in localStorage under this key. */
  sortStorageKey?: string
  /** Data arrives pre-sorted (server-side); the table only reflects the state. */
  manualSorting?: boolean

  /** Pass a `useSelection()` instance to render the checkbox column. */
  selection?: Selection<string>

  loading?: boolean
  skeletonRows?: number
  /** Shown instead of rows when there is no data. */
  empty?: ReactNode

  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  /** Extra cell rendered after the last column (row actions), unpadded header. */
  actions?: (row: T) => ReactNode
  actionsClassName?: string

  stickyHeader?: boolean
  bordered?: boolean
  /** Rendered below the table, inside the bordered shell (e.g. `<Pagination />`). */
  footer?: ReactNode
  caption?: string
  className?: string
  tableClassName?: string
}

function compare(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Generic, fully typed table.
 *
 * Handles the parts every list screen repeats — click-to-sort headers (with
 * optional persistence), row selection, empty and loading states, sticky
 * headers and a footer slot for pagination — while callers only describe their
 * columns. For tables with bespoke behaviour (inline editing, draggable
 * columns) use the primitives in `ui/Table` directly instead.
 */
export default function DataTable<T>({
  columns,
  data,
  rowKey,
  sort,
  onSortChange,
  defaultSort,
  sortStorageKey,
  manualSorting = false,
  selection,
  loading = false,
  skeletonRows = 6,
  empty,
  onRowClick,
  rowClassName,
  actions,
  actionsClassName,
  stickyHeader = false,
  bordered = true,
  footer,
  caption,
  className,
  tableClassName,
}: DataTableProps<T>) {
  const sortableKeys = useMemo(() => columns.filter((c) => c.sortable).map((c) => c.key), [columns])
  const fallbackSort: SortState = defaultSort ?? { by: sortableKeys[0] ?? '', order: 'asc' }

  const initialDirFor = useCallback(
    (key: string): SortDir => columns.find((c) => c.key === key)?.initialSortDir ?? 'asc',
    [columns],
  )

  // Persisted sort (hooks must run unconditionally, so this is always created;
  // it is simply ignored when the table is controlled or non-persistent).
  const persisted = useTableSort({
    storageKey: sortStorageKey ?? '',
    defaultSortBy: fallbackSort.by,
    defaultSortOrder: fallbackSort.order,
    validSortKeys: sortableKeys,
    orderForColumn: initialDirFor,
  })
  const [localSort, setLocalSort] = useState<SortState>(fallbackSort)

  const activeSort = useMemo<SortState>(
    () => sort ?? (sortStorageKey ? { by: persisted.sortBy, order: persisted.sortOrder } : localSort),
    [sort, sortStorageKey, persisted.sortBy, persisted.sortOrder, localSort],
  )

  const toggleSort = useCallback(
    (key: string) => {
      const next: SortState =
        activeSort.by === key
          ? { by: key, order: activeSort.order === 'asc' ? 'desc' : 'asc' }
          : { by: key, order: initialDirFor(key) }
      if (!sort) {
        if (sortStorageKey) persisted.setSort({ sortBy: next.by, sortOrder: next.order })
        else setLocalSort(next)
      }
      onSortChange?.(next)
    },
    [activeSort, initialDirFor, onSortChange, persisted, sort, sortStorageKey],
  )

  const rows = useMemo(() => {
    if (manualSorting) return data
    const col = columns.find((c) => c.key === activeSort.by && c.sortable)
    if (!col?.sortValue) return data
    const dir = activeSort.order === 'asc' ? 1 : -1
    return [...data].sort((a, b) => {
      const av = col.sortValue!(a)
      const bv = col.sortValue!(b)
      // Empty values carry no rank, so they stay at the bottom in both
      // directions rather than filling the top half on the first click.
      const aEmpty = av == null || av === ''
      const bEmpty = bv == null || bv === ''
      if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1
      return compare(av, bv) * dir
    })
  }, [data, columns, activeSort, manualSorting])

  const rowIds = useMemo(() => (selection ? rows.map(rowKey) : []), [rows, rowKey, selection])
  const allSelected = selection?.allSelected(rowIds) ?? false
  const someSelected = !!selection && rowIds.some((id) => selection.has(id))

  const colCount = columns.length + (selection ? 1 : 0) + (actions ? 1 : 0)

  if (loading) {
    return (
      <TableContainer bordered={bordered} className={className}>
        <SkeletonTable
          rows={skeletonRows}
          columns={[
            ...(selection ? [{ head: 'w-4', cell: 'h-4 w-4' } as SkeletonColumn] : []),
            ...columns.map((c) => ({
              align: c.align === 'right' ? ('right' as const) : ('left' as const),
              ...c.skeleton,
            })),
            ...(actions ? [{ head: 'w-4', cell: 'h-4 w-8', align: 'right' as const } as SkeletonColumn] : []),
          ]}
        />
      </TableContainer>
    )
  }

  return (
    <TableContainer bordered={bordered} className={className}>
      <Table className={tableClassName}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {columns.some((c) => c.width) && (
          <colgroup>
            {selection && <col className="w-12" />}
            {columns.map((c) => (
              <col key={c.key} className={c.width} />
            ))}
            {actions && <col className="w-12" />}
          </colgroup>
        )}
        <TableHead sticky={stickyHeader}>
          <TableHeadRow>
            {selection && (
              <TableHeaderCell className="w-12">
                <TableCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={() => selection.toggleAll(rowIds)}
                  label={t('common.selectAll')}
                />
              </TableHeaderCell>
            )}
            {columns.map((col) =>
              col.sortable ? (
                <SortableTh
                  key={col.key}
                  label={typeof col.header === 'string' ? col.header : col.key}
                  column={col.key}
                  activeColumn={activeSort.by}
                  sortOrder={activeSort.order}
                  onSort={toggleSort}
                  align={col.align}
                  className={col.headerClassName}
                />
              ) : (
                <TableHeaderCell key={col.key} align={col.align} className={col.headerClassName}>
                  {col.header}
                </TableHeaderCell>
              ),
            )}
            {actions && <TableHeaderCell className={cn('w-12', actionsClassName)} />}
          </TableHeadRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && <TableEmptyRow colSpan={colCount}>{empty ?? t('common.noResults')}</TableEmptyRow>}
          {rows.map((row, i) => {
            const id = rowKey(row)
            return (
              <TableRow
                key={id}
                interactive={!!onRowClick}
                selected={selection?.has(id) ?? false}
                className={rowClassName?.(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onRowClick(row)
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
              >
                {selection && (
                  <TableCell className="w-12">
                    <TableCheckbox
                      checked={selection.has(id)}
                      onChange={() => selection.toggle(id)}
                      label={t('common.selectRow')}
                    />
                  </TableCell>
                )}
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    align={col.align}
                    title={col.cellTitle?.(row)}
                    className={typeof col.cellClassName === 'function' ? col.cellClassName(row) : col.cellClassName}
                  >
                    {col.cell(row, i)}
                  </TableCell>
                ))}
                {actions && (
                  <TableCell className={actionsClassName}>
                    <div className="flex justify-end">{actions(row)}</div>
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {footer}
    </TableContainer>
  )
}
