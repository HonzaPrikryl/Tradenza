import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Presentational table primitives shared by every table in the app.
 *
 * These are plain (server-safe) components: they own spacing, borders,
 * typography and alignment so individual screens never hand-roll `<table>`
 * markup again. For anything list-shaped with columns, prefer the higher level
 * {@link ../DataTable | DataTable}, which builds on these primitives and adds
 * sorting, selection, empty/loading states and pagination.
 */

export type Align = 'left' | 'right' | 'center'

export const alignClass: Record<Align, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

/** Horizontal padding used by every header/body cell. Kept in one place so
 *  tables stay optically aligned with each other across the app. */
export const CELL_X = 'px-4'

// ─── Shell ────────────────────────────────────────────────────────────────────

export function TableContainer({
  className,
  bordered = true,
  children,
  ...props
}: ComponentPropsWithoutRef<'div'> & { bordered?: boolean }) {
  return (
    <div className={cn('overflow-x-auto', bordered && 'rounded-xl border border-border bg-card', className)} {...props}>
      {children}
    </div>
  )
}

export function Table({ className, children, ...props }: ComponentPropsWithoutRef<'table'>) {
  return (
    <table className={cn('w-full border-collapse text-sm', className)} {...props}>
      {children}
    </table>
  )
}

export function TableHead({
  className,
  sticky = false,
  children,
  ...props
}: ComponentPropsWithoutRef<'thead'> & { sticky?: boolean }) {
  return (
    <thead className={cn(sticky && 'sticky top-0 z-10 bg-card', className)} {...props}>
      {children}
    </thead>
  )
}

export function TableHeadRow({ className, children, ...props }: ComponentPropsWithoutRef<'tr'>) {
  return (
    <tr
      className={cn('border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground', className)}
      {...props}
    >
      {children}
    </tr>
  )
}

export function TableBody({ className, children, ...props }: ComponentPropsWithoutRef<'tbody'>) {
  return (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  )
}

export function TableRow({
  className,
  interactive = false,
  selected = false,
  children,
  ...props
}: ComponentPropsWithoutRef<'tr'> & { interactive?: boolean; selected?: boolean }) {
  return (
    <tr
      data-selected={selected || undefined}
      className={cn(
        'border-b border-border/60 transition-colors last:border-0',
        interactive && 'cursor-pointer hover:bg-accent/40',
        selected && 'bg-primary/5',
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  )
}

// ─── Cells ────────────────────────────────────────────────────────────────────

export function TableHeaderCell({
  align = 'left',
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'th'> & { align?: Align }) {
  return (
    <th scope="col" className={cn(CELL_X, 'py-3 font-medium', alignClass[align], className)} {...props}>
      {children}
    </th>
  )
}

export function TableCell({
  align = 'left',
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'td'> & { align?: Align }) {
  return (
    <td className={cn(CELL_X, 'py-3', alignClass[align], className)} {...props}>
      {children}
    </td>
  )
}

/** Full-width message row used for "no results" states. */
export function TableEmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  )
}

/** Checkbox cell shared by the select-all header and per-row selection. */
export function TableCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  label: string
}) {
  return (
    <input
      type="checkbox"
      className="accent-primary"
      checked={checked}
      aria-label={label}
      ref={(el) => {
        if (el) el.indeterminate = !checked && indeterminate
      }}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
    />
  )
}
