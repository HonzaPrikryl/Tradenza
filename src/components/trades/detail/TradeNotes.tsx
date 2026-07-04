'use client'

import { Check, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { updateTradeJournal } from '@/lib/actions/trades'
import { useAutosave } from '@/hooks/useAutosave'
import RichTextEditor from '@/components/ui/RichTextEditor'

function isEmptyHtml(html: string): boolean {
  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim() === '' && !/<img/i.test(html)
  )
}

export default function TradeNotes({ tradeId, initialNotes }: { tradeId: string; initialNotes: string | null }) {
  const { value, state, onChange, flush } = useAutosave(initialNotes ?? '', (text) =>
    updateTradeJournal(tradeId, { notes: isEmptyHtml(text) ? null : text }).then(handleRateLimit),
  )

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">{t('trades.detail.notes')}</h2>
        <span
          className={cn('flex items-center gap-1 text-xs', state === 'error' ? 'text-loss' : 'text-muted-foreground')}
        >
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
      </div>
      <RichTextEditor
        value={value}
        onChange={onChange}
        onBlur={flush}
        placeholder={t('trades.detail.notesPlaceholder')}
      />
    </div>
  )
}
