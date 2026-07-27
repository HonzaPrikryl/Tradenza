import { CheckCheck } from 'lucide-react'
import { t } from '@/i18n'
import type { DayRule } from '@/lib/actions/progress'
import RuleRow from './RuleRow'

export default function DayRulesSections({
  rules,
  editable = false,
  busy = false,
  onToggleRule,
  onMarkAllSoft,
  labels,
}: {
  rules: DayRule[]
  editable?: boolean
  busy?: boolean
  onToggleRule?: (ruleId: string, next: boolean) => void
  onMarkAllSoft?: () => void
  /**
   * Section headings. Defaults to the trading wording; the Habits tab passes its own
   * ("Avoidance" / "Building") so both day panels share one layout — constraints first
   * in their own block, then the tasks with the bulk-complete shortcut.
   */
  labels?: { constraints: string; tasks: string }
}) {
  // Constraints (default-satisfied, breach by logging) always render above the tasks.
  const hardRules = rules.filter((r) => r.type === 'hard')
  const softRules = rules.filter((r) => r.type === 'soft')
  const allSoftDone = softRules.every((r) => r.completed)

  return (
    <div className="space-y-3">
      {hardRules.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-loss/80">
            {labels?.constraints ?? t('progress.day.hardTitle')}
          </h4>
          <div className="space-y-1.5">
            {hardRules.map((r) => (
              <RuleRow key={r.id} rule={r} editable={editable} busy={busy} onToggle={onToggleRule} />
            ))}
          </div>
        </div>
      )}
      {softRules.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {labels?.tasks ?? t('progress.day.softTitle')}
            </h4>
            {editable && onMarkAllSoft && !allSoftDone && (
              <button
                type="button"
                onClick={onMarkAllSoft}
                disabled={busy}
                className="flex items-center gap-1 rounded text-[11px] font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-60"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t('progress.day.markAllDone')}
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {softRules.map((r) => (
              <RuleRow key={r.id} rule={r} editable={editable} busy={busy} onToggle={onToggleRule} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
