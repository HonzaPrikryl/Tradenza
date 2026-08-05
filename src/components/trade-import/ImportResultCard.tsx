'use client'

import { useState } from 'react'
import { CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

/**
 * What an import did, in the terms every import path shares.
 *
 * The CSV wizard and the backup import produce different result objects — one
 * counts spreadsheet rows, the other counts trades and the references it had to
 * create — but the user's questions are the same three: did it work, what did it
 * skip, and what went wrong. Callers map their own result onto this shape so the
 * answer looks and reads identically wherever the file came from.
 *
 * Everything a backup import does on the way (strategies matched, tags created,
 * images copied) is deliberately left out. It is bookkeeping, not an outcome:
 * the promise of the format is that the trades arrive whole, so reporting the
 * parts invites the reader to audit a number they have no way to check.
 */
export interface ImportOutcome {
  /** Records in the file. */
  total: number
  imported: number
  /** Already present at the destination. Expected, not a failure. */
  duplicates: number
  /** Records we could not read or write. A real problem. */
  skipped: number
  errors: string[]
}

/**
 * The outcome of an import, as one card.
 *
 * Deliberately not three components: "imported", "everything was already there"
 * and "something failed" are the same card with a different tone, and splitting
 * them is how two import paths drift into saying the same thing two ways.
 */
export default function ImportResultCard({
  outcome,
  warning,
  actions,
  className,
}: {
  outcome: ImportOutcome
  /** A caveat that doesn't make the import a failure (unmapped column, uncopied image). */
  warning?: string | null
  actions?: React.ReactNode
  className?: string
}) {
  const [showErrors, setShowErrors] = useState(false)

  const ok = outcome.imported > 0
  // Nothing imported because everything was already in the account is a normal
  // outcome, not a failure — saying "nothing was imported" reads like a bug.
  const allDuplicates = !ok && outcome.duplicates > 0 && outcome.skipped === 0

  return (
    <div className={cn('rounded-2xl border border-border bg-card p-8 text-center', className)}>
      {ok || allDuplicates ? (
        <CheckCircle2 className={cn('mx-auto h-12 w-12', ok ? 'text-profit' : 'text-muted-foreground')} />
      ) : (
        <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
      )}

      <h2 className="mt-4 text-xl font-semibold">
        {ok
          ? t('trades.importResult.imported', { count: outcome.imported })
          : allDuplicates
            ? t('trades.importResult.allDuplicates')
            : t('trades.importResult.none')}
      </h2>

      <p className="mt-2 text-sm text-muted-foreground">
        {t('trades.importResult.detail', {
          total: outcome.total,
          imported: outcome.imported,
          skipped: outcome.skipped,
        })}
      </p>

      {outcome.duplicates > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t('trades.importResult.duplicatesNote', { count: outcome.duplicates })}
        </p>
      )}

      {warning && <p className="mt-3 text-sm text-amber-400">{warning}</p>}

      {outcome.errors.length > 0 && (
        <div className="mt-4 text-left">
          <button
            onClick={() => setShowErrors((s) => !s)}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {t('trades.importResult.showErrors', { count: outcome.errors.length })}
            <ChevronDown className={cn('h-4 w-4 transition-transform', showErrors && 'rotate-180')} />
          </button>
          {showErrors && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              {outcome.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  )
}
