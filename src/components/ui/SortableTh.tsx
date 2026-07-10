'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SortableThProps {
  label: string
  column: string
  activeColumn: string
  sortOrder: 'asc' | 'desc'
  onSort: (column: string) => void
  align?: 'left' | 'right'
  className?: string
}

export default function SortableTh({
  label,
  column,
  activeColumn,
  sortOrder,
  onSort,
  align = 'left',
  className,
}: SortableThProps) {
  const active = activeColumn === column

  return (
    <th className={cn('px-4 py-3 font-medium', align === 'right' ? 'text-right' : 'text-left', className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          align === 'right' && 'flex-row-reverse',
          active && 'text-foreground',
        )}
      >
        <span className="truncate">{label}</span>
        <span className="inline-flex w-3 shrink-0 justify-center">
          {active && (sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </span>
      </button>
    </th>
  )
}
