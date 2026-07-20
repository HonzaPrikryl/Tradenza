'use client'

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { alignClass, type Align } from '@/components/ui/Table'

interface SortableThProps {
  label: string
  column: string
  activeColumn: string
  sortOrder: 'asc' | 'desc'
  onSort: (column: string) => void
  align?: Align
  className?: string
  /** Tooltip/aria hint, e.g. "Sort by name". Defaults to the label. */
  title?: string
}

/**
 * Sortable table header cell. The whole cell is a click target with a hover
 * surface so it reads as interactive; the sort icon is always rendered (muted
 * chevrons when inactive, a directional arrow when the column is sorted) to
 * signal that the column can be sorted.
 */
export default function SortableTh({
  label,
  column,
  activeColumn,
  sortOrder,
  onSort,
  align = 'left',
  className,
  title,
}: SortableThProps) {
  const active = activeColumn === column
  const Icon = !active ? ChevronsUpDown : sortOrder === 'asc' ? ArrowUp : ArrowDown

  return (
    <th
      scope="col"
      aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('p-1.5 font-medium', alignClass[align], className)}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        title={title ?? label}
        className={cn(
          'group inline-flex max-w-full cursor-pointer select-none items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors',
          'hover:bg-accent hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
          align === 'right' && 'flex-row-reverse',
          align === 'center' && 'justify-center',
          active && 'text-foreground',
        )}
      >
        <span className="truncate">{label}</span>
        <span
          aria-hidden="true"
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded transition-all',
            active
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground/60 group-hover:bg-foreground/10 group-hover:text-muted-foreground',
          )}
        >
          <Icon className="h-3 w-3" />
        </span>
      </button>
    </th>
  )
}
