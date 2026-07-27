import { Check, X, ShieldCheck, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { ruleModeOf } from '@/lib/progress-compute'
import Tooltip from '@/components/ui/Tooltip'
import type { DayRule } from '@/lib/actions/progress'

// Single rule row, shared by the trading day panel, the day detail and the habits panel.
//
// `rule.completed` is the *good* state:
//   task       → done
//   constraint → not breached (nothing logged)
//
// Tasks use a checkbox (fill on toggle / ✓ · ✗ when read-only). Constraints default to
// satisfied and are flagged as a breach on toggle — a breached constraint turns the row
// red. The wording of that state follows the rule's MODE (see ruleModeOf), so a trading
// constraint reads "Respected / Broken" and a daily one "Clean / Slipped" while both
// visibly behave the same way.
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
  const mode = ruleModeOf(rule)
  const isHard = mode !== 'building'
  const violated = isHard && !rule.completed
  const stateKey = mode === 'avoidance' ? 'avoidance' : 'strict'

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
            {t(`progress.mode.state.${stateKey}${violated ? 'Bad' : 'Ok'}`)}
          </span>
        )}
      </span>
    </>
  )

  // `transition-colors`, NOT `transition-all`: the latter also animates box-shadow, so the
  // focus indicator faded in and out on every click as a pale halo around the row — a
  // flash nobody asked for on what should be an instant tick.
  const base = cn(
    'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
    violated
      ? 'border-loss/40 bg-loss/10'
      : rule.completed && !isHard
        ? 'border-primary/40 bg-primary/10'
        : 'border-border bg-background/40',
  )

  if (!editable) return <div className={base}>{inner}</div>

  // A checkbox, not a plain button: `role="checkbox"` + `aria-checked` is what tells a
  // screen reader the row has a state at all — otherwise "done" vs "not done" is conveyed
  // only by the fill colour and the icon. For a constraint, checked means "breached", so
  // the label spells that out rather than leaving the polarity to be inferred.
  const toggle = (
    <button
      type="button"
      role="checkbox"
      aria-checked={isHard ? violated : rule.completed}
      aria-label={isHard ? `${rule.name} — ${t(`progress.mode.toggleHint.${stateKey}`)}` : rule.name}
      disabled={busy}
      onClick={() => onToggle?.(rule.id, !rule.completed)}
      className={cn(
        base,
        'group hover:border-border hover:bg-accent/50 disabled:opacity-60',
        // A border, not a ring: a ring is a box-shadow, and a halo around a full-width row
        // reads as "something happened" on every click. The border is already part of the
        // row, so lighting it up is visible to a keyboard user without adding a layer.
        'focus-visible:border-primary focus-visible:outline-none',
      )}
    >
      {inner}
    </button>
  )

  // Constraints invert the usual meaning of a tick, so the hint is worth having — but as a
  // real tooltip, not `title`, which never appears on touch and can't be reached by
  // keyboard.
  return isHard ? <Tooltip label={t(`progress.mode.toggleHint.${stateKey}`)}>{toggle}</Tooltip> : toggle
}
