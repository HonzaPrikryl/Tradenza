'use client'

import { useState } from 'react'
import { FileText, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import TradeNotes from './TradeNotes'
import DailyNoteEditor from '@/components/progress/DailyNoteEditor'

export default function NotesTabs({
  tradeId,
  initialNotes,
  date,
  initialDailyNote,
}: {
  tradeId: string
  initialNotes: string | null
  date: string
  initialDailyNote: string
}) {
  const [tab, setTab] = useState<'trade' | 'daily'>('trade')

  const tabs: { key: 'trade' | 'daily'; label: string; icon: React.ReactNode }[] = [
    { key: 'trade', label: t('progress.dayReview.tradeNote'), icon: <FileText className="h-4 w-4" /> },
    { key: 'daily', label: t('progress.dayReview.dailyNote'), icon: <CalendarDays className="h-4 w-4" /> },
  ]

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-border bg-card p-1">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              tab === tb.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tb.icon}
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'trade' ? (
        <TradeNotes tradeId={tradeId} initialNotes={initialNotes} />
      ) : (
        <DailyNoteEditor date={date} initialNote={initialDailyNote} />
      )}
    </div>
  )
}
