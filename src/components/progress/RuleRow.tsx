import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DayRule } from '@/lib/actions/progress'

// Single discipline-rule row, shared by the discipline overview and the day detail.
// Editable (the current day) renders an empty checkbox that fills on toggle;
// read-only (historical days) renders a check ✓ / cross ✗ of what actually happened.
export default function RuleRow({
  rule,
  editable = false,
  busy = false,
  onToggle,
}: {
  rule: DayRule
  editable?: boolean
  busy?: boolean
  onToggle?: (ruleId: string, next: boolean) => void
}) {
  const box = cn(
    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors',
    rule.completed
      ? 'bg-primary text-primary-foreground'
      : editable
        ? 'border-2 border-muted-foreground/40 group-hover:border-primary'
        : 'bg-muted text-muted-foreground',
  )

  const inner = (
    <>
      <span className={box}>
        {rule.completed ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        ) : !editable ? (
          <X className="h-3.5 w-3.5" strokeWidth={3} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={cn('block text-sm font-medium', rule.completed ? 'text-foreground' : 'text-muted-foreground')}>
          {rule.name}
        </span>
        {rule.description && <span className="mt-0.5 block text-xs text-muted-foreground">{rule.description}</span>}
      </span>
    </>
  )

  const base = cn(
    'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
    rule.completed ? 'border-primary/40 bg-primary/10' : 'border-border bg-background/40',
  )

  if (!editable) return <div className={base}>{inner}</div>
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onToggle?.(rule.id, !rule.completed)}
      className={cn(base, 'group hover:border-border hover:bg-accent/50 disabled:opacity-60')}
    >
      {inner}
    </button>
  )
}
