import { Check, X, ShieldCheck, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import type { DayRule } from '@/lib/actions/progress'

// Single discipline-rule row, shared by the discipline overview and the day detail.
//
// `rule.completed` is the *good* state:
//   soft habit → done
//   hard rule  → respected (no violation logged)
//
// Soft habits use a checkbox (fill on toggle / ✓ · ✗ when read-only). Hard rules
// default to respected and are flagged as a violation on toggle — a broken hard
// rule turns the row red.
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
  const isHard = rule.type === 'hard'
  const violated = isHard && !rule.completed

  const box = cn(
    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors',
    violated
      ? 'bg-loss text-white'
      : isHard
        ? editable
          ? 'bg-muted text-muted-foreground group-hover:bg-loss/15 group-hover:text-loss'
          : 'bg-muted text-muted-foreground'
        : rule.completed
          ? 'bg-primary text-primary-foreground'
          : editable
            ? 'border-2 border-muted-foreground/40 group-hover:border-primary'
            : 'bg-muted text-muted-foreground',
  )

  const boxIcon = isHard ? (
    violated ? (
      <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2.5} />
    ) : editable ? (
      <>
        <ShieldCheck className="h-3.5 w-3.5 group-hover:hidden" strokeWidth={2.5} />
        <ShieldAlert className="hidden h-3.5 w-3.5 group-hover:block" strokeWidth={2.5} />
      </>
    ) : (
      <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
    )
  ) : rule.completed ? (
    <Check className="h-3.5 w-3.5" strokeWidth={3} />
  ) : !editable ? (
    <X className="h-3.5 w-3.5" strokeWidth={3} />
  ) : null

  const inner = (
    <>
      <span className={box}>{boxIcon}</span>
      <span className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            'block text-sm font-medium',
            violated ? 'text-loss' : rule.completed && !isHard ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {rule.name}
        </span>
        {rule.description && <span className="mt-0.5 block text-xs text-muted-foreground">{rule.description}</span>}
        {isHard && (
          <span
            className={cn('mt-0.5 block text-[11px] font-medium', violated ? 'text-loss' : 'text-muted-foreground/70')}
          >
            {violated ? t('progress.day.hardBroken') : t('progress.day.hardRespected')}
          </span>
        )}
      </span>
    </>
  )

  const base = cn(
    'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
    violated
      ? 'border-loss/40 bg-loss/10'
      : rule.completed && !isHard
        ? 'border-primary/40 bg-primary/10'
        : 'border-border bg-background/40',
  )

  if (!editable) return <div className={base}>{inner}</div>
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onToggle?.(rule.id, !rule.completed)}
      title={isHard ? t('progress.day.hardToggleHint') : undefined}
      className={cn(base, 'group hover:border-border hover:bg-accent/50 disabled:opacity-60')}
    >
      {inner}
    </button>
  )
}
