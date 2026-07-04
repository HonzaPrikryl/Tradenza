'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t, tList } from '@/i18n'
import { getUiLocale } from '@/i18n/config'
import Select from '@/components/ui/Select'
import type { ProgressYearData, ProgressCalendarCell } from '@/lib/actions/progress'
import { prettyDate } from '@/components/progress/DaySummaryPanel'

const MONTHS = tList('datepicker.monthsShort')
const WD_SHORT = tList('datepicker.weekdaysShort')
const WD_LABELS = ['', WD_SHORT[1], '', WD_SHORT[3], '', WD_SHORT[5], '']

function prettyShortDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(getUiLocale(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface TipState {
  date: string
  d?: ProgressCalendarCell
  x: number
  y: number
}

interface DayCell {
  key: string
  inYear: boolean
  month: number
  day: number
}

function buildYearGrid(year: number): DayCell[][] {
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const start = new Date(jan1)
  start.setUTCDate(jan1.getUTCDate() - jan1.getUTCDay())
  const dec31 = new Date(Date.UTC(year, 11, 31))
  const end = new Date(dec31)
  end.setUTCDate(dec31.getUTCDate() + (6 - dec31.getUTCDay()))

  const weeks: DayCell[][] = []
  const cur = new Date(start)
  while (cur <= end) {
    const week: DayCell[] = []
    for (let i = 0; i < 7; i++) {
      week.push({
        key: cur.toISOString().slice(0, 10),
        inYear: cur.getUTCFullYear() === year,
        month: cur.getUTCMonth(),
        day: cur.getUTCDate(),
      })
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

function heatClass(d: ProgressCalendarCell | undefined): string | false {
  if (!d || d.ratio <= 0) return false
  if (d.perfect) return 'heat-perfect'
  if (d.ratio > 0.75) return 'heat-l4'
  if (d.ratio > 0.5) return 'heat-l3'
  if (d.ratio > 0.25) return 'heat-l2'
  return 'heat-l1'
}

function cellStyle(d: ProgressCalendarCell | undefined): React.CSSProperties {
  if (d?.perfect) return { boxShadow: '0 0 7px hsl(var(--primary) / 0.6)' }
  return {}
}

export default function ProgressYearHeatmap({
  data,
  years,
  year,
  selectedDate,
  todayKey,
  pending,
  onSelect,
  onYearChange,
}: {
  data: ProgressYearData
  years: number[]
  year: number
  selectedDate: string
  todayKey: string
  pending?: boolean
  onSelect: (date: string) => void
  onYearChange: (year: number) => void
}) {
  const weeks = useMemo(() => buildYearGrid(year), [year])
  const byDate = useMemo(() => new Map(data.days.map((d) => [d.date, d])), [data.days])
  const [tip, setTip] = useState<TipState | null>(null)

  const showTip = (e: React.MouseEvent<HTMLElement>, date: string, d?: ProgressCalendarCell) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ date, d, x: r.left + r.width / 2, y: r.top })
  }
  const hideTip = () => setTip(null)

  const monthLabels = useMemo(() => {
    const out: { col: number; label: string }[] = []
    weeks.forEach((week, wi) => {
      const firstOfMonth = week.find((c) => c.inYear && c.day === 1)
      if (firstOfMonth) out.push({ col: wi, label: MONTHS[firstOfMonth.month] })
    })
    return out
  }, [weeks])

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-1 pb-3">
        <div className="flex items-center gap-2">
          <Select
            value={String(year)}
            onValueChange={(v) => onYearChange(Number(v))}
            className="h-9 w-28"
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
          <span className="text-sm text-muted-foreground">{prettyDate(selectedDate)}</span>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">
            {data.perfectDays} {t('progress.calendar.perfect')}
          </span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
            {data.loggedDays} {t('progress.calendar.logged')}
          </span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
            {Math.round(data.avgRatio * 100)}% {t('progress.calendar.avg')}
          </span>
        </div>
      </div>

      {/* Heatmap */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-2">
          <div className="flex shrink-0 flex-col gap-[3px] pt-[18px]">
            {WD_LABELS.map((w, i) => (
              <span key={i} className="flex h-3 items-center text-[9px] leading-none text-muted-foreground">
                {w}
              </span>
            ))}
          </div>

          <div className="flex flex-col">
            <div className="relative mb-1 h-3.5" style={{ width: weeks.length * 15 }}>
              {monthLabels.map((m) => (
                <span
                  key={`${m.col}-${m.label}`}
                  className="absolute text-[10px] text-muted-foreground"
                  style={{ left: m.col * 15 }}
                >
                  {m.label}
                </span>
              ))}
            </div>

            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((cell, di) => {
                    if (!cell.inYear) return <span key={di} className="h-3 w-3" />
                    const d = byDate.get(cell.key)
                    const isFuture = cell.key > todayKey
                    const isToday = cell.key === todayKey
                    const isSelected = cell.key === selectedDate
                    return (
                      <button
                        key={di}
                        type="button"
                        disabled={isFuture}
                        onClick={() => onSelect(cell.key)}
                        onMouseEnter={(e) => showTip(e, cell.key, d)}
                        onMouseLeave={hideTip}
                        className={cn(
                          'h-3 w-3 rounded-[3px] border transition-transform hover:scale-125',
                          (!d || d.ratio <= 0) && 'border-muted-foreground/30 bg-muted/50',
                          heatClass(d),
                          isFuture && 'opacity-30',
                          isToday && 'ring-1 ring-foreground/50',
                          isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                        )}
                        style={cellStyle(d)}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-end gap-1.5 px-1 text-[10px] text-muted-foreground">
        <span>{t('progress.calendar.legendLess')}</span>
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <span
            key={r}
            className={cn(
              'h-3 w-3 rounded-[3px] border',
              r <= 0 && 'border-muted-foreground/30 bg-muted/50',
              heatClass({ date: '', completed: 0, total: 0, ratio: r, perfect: r >= 1, hasNote: false }),
            )}
            style={cellStyle({ date: '', completed: 0, total: 0, ratio: r, perfect: r >= 1, hasNote: false })}
          />
        ))}
        <span>{t('progress.calendar.legendMore')}</span>
      </div>

      {tip &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[70] -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-2xl"
            style={{ left: tip.x, top: tip.y - 8 }}
          >
            <div className="font-medium text-foreground">{prettyShortDate(tip.date)}</div>
            <div className="mt-0.5 text-muted-foreground">
              {tip.d && tip.d.total > 0
                ? tip.d.perfect
                  ? t('progress.calendar.tipPerfect', { total: tip.d.total })
                  : t('progress.calendar.tipRules', { completed: tip.d.completed, total: tip.d.total })
                : t('progress.calendar.tipNoRecord')}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
