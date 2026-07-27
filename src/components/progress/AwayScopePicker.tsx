'use client'

import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { AWAY_SCOPES, type AwayScope } from '@/lib/progress-compute'

// Which side of the app an excused day covers.
//
// Deliberately NOT a third button next to "Don't count this day". Excusing a day is one
// decision and being away is usually one fact, so the primary action stays a single click
// that means "the whole day". This is a *refinement*, and it only appears once the day is
// already excused — asking which domain you meant before you've said you were away puts a
// choice in front of a user who hasn't made the first one yet.
//
// It exists for the case the shared flag couldn't express: a week off the markets that the
// daily habits should run straight through.
export default function AwayScopePicker({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: AwayScope
  onChange: (scope: AwayScope) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={t('progress.day.awayScopeLabel')}
      className={cn('inline-flex rounded-md border border-border bg-background/40 p-0.5', className)}
    >
      {AWAY_SCOPES.map((scope) => {
        const selected = scope === value
        return (
          <button
            key={scope}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(scope)}
            className={cn(
              'rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-60',
              'focus-visible:ring-2 focus-visible:ring-primary focus:outline-none',
              selected ? 'bg-sky-500/15 text-sky-400' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {t(`progress.day.awayScope.${scope}`)}
          </button>
        )
      })}
    </div>
  )
}
