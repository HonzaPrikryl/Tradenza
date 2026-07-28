'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, AlertCircle, CalendarDays } from 'lucide-react'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { setDayNote } from '@/lib/actions/progress'
import { track } from '@/lib/analytics'
import { useAutosave, type SaveState } from '@/hooks/useAutosave'
import RichTextEditor from '@/components/ui/RichTextEditor'
import { isEmptyHtml } from '@/lib/html'

export default function DailyNoteEditor({
  date,
  initialNote,
  showHeader = true,
  minHeight = 200,
}: {
  date: string
  initialNote: string
  showHeader?: boolean
  minHeight?: number
}) {
  const reviewedRef = useRef(false)
  const { value, state, onChange, flush, reset } = useAutosave(initialNote, async (text) => {
    const empty = isEmptyHtml(text)
    try {
      const res = await setDayNote(date, empty ? '' : text)
      if (handleRateLimit(res)) return
    } catch (err) {
      // The badge only ever says "save failed". Autosave retries on every pause, so a
      // note that's over the size limit would silently fail forever — surface the
      // actionable reason once (a stable toast id keeps the retries from stacking up)
      // and rethrow so the badge still shows the error state.
      toast.error(getActionErrorMessage(err, 'trades.detail.saveFailed'), { id: `day-note-${date}` })
      throw err
    }
    if (!empty && !reviewedRef.current) {
      reviewedRef.current = true
      track({ name: 'daily_review_completed' })
    }
  })

  const loadedDate = useRef(date)
  useEffect(() => {
    if (loadedDate.current === date) return
    loadedDate.current = date
    reviewedRef.current = false
    reset(initialNote)
  }, [date, initialNote, reset])

  return (
    <div className="rounded-xl border border-border bg-card">
      {showHeader && (
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {t('progress.dayReview.dailyNote')}
          </h2>
          <SaveBadge state={state} />
        </div>
      )}
      {!showHeader && (
        <div className="flex items-center justify-end px-5 pt-2">
          <SaveBadge state={state} />
        </div>
      )}
      <RichTextEditor
        value={value}
        onChange={onChange}
        onBlur={flush}
        placeholder={t('progress.dayReview.dailyNotePlaceholder')}
        minHeight={minHeight}
      />
    </div>
  )
}

function SaveBadge({ state }: { state: SaveState }) {
  return (
    <span className={cn('flex items-center gap-1 text-xs', state === 'error' ? 'text-loss' : 'text-muted-foreground')}>
      {state === 'saving' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('trades.detail.savingNote')}
        </>
      )}
      {state === 'saved' && (
        <>
          <Check className="h-3 w-3 text-profit" />
          {t('trades.detail.savedNote')}
        </>
      )}
      {state === 'error' && (
        <>
          <AlertCircle className="h-3 w-3" />
          {t('trades.detail.saveFailed')}
        </>
      )}
    </span>
  )
}
