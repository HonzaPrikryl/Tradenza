import { cn } from '@/lib/utils'

export interface SkeletonColumn {
  /** Sizing/shape classes for the body cell bar, e.g. 'h-4 w-24' or 'h-5 w-16 rounded-full'. */
  cell?: string
  /** Width class for the header bar, e.g. 'w-20'. */
  head?: string
  align?: 'left' | 'right'
}

/**
 * Full-width skeleton table. Pass either a column count (uniform columns) or
 * an array of {@link SkeletonColumn} specs to mirror a real table's column
 * widths/alignment. Renders a real `<table className="w-full">` so columns
 * always span the full container width.
 */
export default function SkeletonTable({
  columns,
  rows = 6,
  header = true,
  headerRowClassName = 'border-b border-border',
}: {
  columns: number | SkeletonColumn[]
  rows?: number
  header?: boolean
  headerRowClassName?: string
}) {
  const cols: SkeletonColumn[] = typeof columns === 'number' ? Array.from({ length: columns }, () => ({})) : columns

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {header && (
          <thead>
            <tr className={headerRowClassName}>
              {cols.map((c, i) => (
                <th key={i} className={cn('px-5 py-3', c.align === 'right' ? 'text-right' : 'text-left')}>
                  <div className={cn('skeleton inline-block h-3 rounded align-middle', c.head ?? 'w-16')} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-border/60 last:border-0">
              {cols.map((c, i) => (
                <td key={i} className={cn('px-5 py-3.5', c.align === 'right' ? 'text-right' : 'text-left')}>
                  <div className={cn('skeleton inline-block align-middle rounded', c.cell ?? 'h-4 w-20')} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
