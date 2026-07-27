'use client'

import { useState } from 'react'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  setMonth,
  setYear,
  isSameDay,
  isSameMonth,
  isToday,
  isWithinInterval,
  subDays,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import Select from './Select'
import { t, tList } from '@/i18n'

const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
const parse = (s?: string) => (s ? parseISO(s) : null)

const WEEKDAYS = tList('datepicker.weekdaysMin')

interface Props {
  from?: string
  to?: string
  onChange: (from?: string, to?: string) => void
  /**
   * Earliest selectable day ("yyyy-MM-dd"). Days before it are disabled, month navigation
   * stops there and the year dropdown starts at its year — so a bounded picker can't
   * offer a date the caller would only have to reject afterwards.
   */
  min?: string
  /**
   * Show the quick-range column (this week, this month, YTD…). On by default for the
   * global filter; callers whose ranges aren't calendar periods turn it off rather than
   * offering shortcuts that make no sense for them.
   *
   * Turning it off removes the whole right-hand column, Clear included: such a caller owns
   * its own layout and places Clear where it makes sense there.
   */
  showPresets?: boolean
}

export default function DateRangePicker({ from, to, onChange, min, showPresets = true }: Props) {
  const today = new Date()
  const minDate = parse(min)
  const [start, setStart] = useState<Date | null>(parse(from))
  const [end, setEnd] = useState<Date | null>(parse(to))
  const [hover, setHover] = useState<Date | null>(null)

  const [leftView, setLeftView] = useState<Date>(start ? startOfMonth(start) : startOfMonth(subMonths(today, 1)))
  const [rightView, setRightView] = useState<Date>(end ? startOfMonth(end) : startOfMonth(today))

  const pick = (day: Date) => {
    if (!start || (start && end)) {
      setStart(day)
      setEnd(null)
      setHover(null)
    } else {
      let a = start
      let b = day
      if (b < a) [a, b] = [b, a]
      setStart(a)
      setEnd(b)
      onChange(fmt(a), fmt(b))
    }
  }

  const applyRange = (a: Date, b: Date) => {
    setStart(a)
    setEnd(b)
    setLeftView(startOfMonth(a))
    setRightView(startOfMonth(b > a ? b : addMonths(a, 1)))
    onChange(fmt(a), fmt(b))
  }

  const clear = () => {
    setStart(null)
    setEnd(null)
    setHover(null)
    onChange(undefined, undefined)
  }

  const presets: { label: string; range: () => [Date, Date] }[] = [
    { label: t('datepicker.presets.today'), range: () => [today, today] },
    {
      label: t('datepicker.presets.thisWeek'),
      range: () => [startOfWeek(today, { weekStartsOn: 1 }), endOfWeek(today, { weekStartsOn: 1 })],
    },
    { label: t('datepicker.presets.thisMonth'), range: () => [startOfMonth(today), endOfMonth(today)] },
    { label: t('datepicker.presets.last30'), range: () => [subDays(today, 29), today] },
    {
      label: t('datepicker.presets.lastMonth'),
      range: () => [startOfMonth(subMonths(today, 1)), endOfMonth(subMonths(today, 1))],
    },
    { label: t('datepicker.presets.thisQuarter'), range: () => [startOfQuarter(today), endOfQuarter(today)] },
    { label: t('datepicker.presets.ytd'), range: () => [startOfYear(today), today] },
  ]

  const previewEnd = end ?? (start && hover ? hover : null)
  const lo = start && previewEnd ? (start < previewEnd ? start : previewEnd) : start
  const hi = start && previewEnd ? (start < previewEnd ? previewEnd : start) : start

  return (
    <div
      className={cn(
        'flex w-full flex-col sm:flex-row lg:w-auto lg:max-w-[92vw]',
        // No side column left to sit beside, so the calendar takes the middle.
        !showPresets && 'sm:justify-center',
      )}
    >
      <div className={cn('min-w-0', showPresets ? 'mx-auto lg:mx-0' : 'mx-auto')}>
        {/* Range summary */}
        <div className="flex items-center justify-center gap-4 border-b border-border px-4 py-3 text-sm">
          <span className={cn(start ? 'font-medium' : 'text-muted-foreground')}>
            {start ? format(start, 'MMM dd, yyyy') : t('datepicker.startDate')}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className={cn(end ? 'font-medium' : 'text-muted-foreground')}>
            {end ? format(end, 'MMM dd, yyyy') : t('datepicker.endDate')}
          </span>
        </div>

        <div className="flex flex-col items-center gap-6 p-3 sm:flex-row sm:items-start sm:gap-4">
          <MonthCalendar
            view={leftView}
            setView={setLeftView}
            lo={lo}
            hi={hi}
            onPick={pick}
            onHover={setHover}
            min={minDate}
          />
          <MonthCalendar
            view={rightView}
            setView={setRightView}
            lo={lo}
            hi={hi}
            onPick={pick}
            onHover={setHover}
            min={minDate}
          />
        </div>
      </div>

      {/* The side column is the quick-ranges column. Without presets there is nothing to
          put in it, so it goes — a lone "Clear" pinned to the right of an otherwise centred
          calendar reads as a leftover. Those callers render Clear themselves, next to
          whatever summary they already show. */}
      {showPresets && (
        <div className="hidden shrink-0 flex-col gap-0.5 border-t border-border p-2 sm:border-l sm:border-t-0 sm:py-3 lg:flex">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                const [a, b] = p.range()
                applyRange(a, b)
              }}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {p.label}
            </button>
          ))}
          {(start || end) && (
            <div className="mt-2 border-t border-border pt-2">
              <button
                onClick={clear}
                className="w-full whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm text-loss transition-colors hover:bg-loss/10"
              >
                {t('datepicker.clearRange')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MonthCalendar({
  view,
  setView,
  lo,
  hi,
  onPick,
  onHover,
  min,
}: {
  view: Date
  setView: (d: Date) => void
  lo: Date | null
  hi: Date | null
  onPick: (d: Date) => void
  onHover: (d: Date | null) => void
  /** Earliest selectable day; days before it render disabled and can't be picked. */
  min: Date | null
}) {
  const monthStart = startOfMonth(view)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const isBlocked = (d: Date) => !!min && d < min && !isSameDay(d, min)
  // Nothing left to reach: every day of the previous month is out of bounds.
  const prevBlocked = !!min && endOfMonth(subMonths(view, 1)) < min

  const year = view.getFullYear()
  const nowY = new Date().getFullYear()
  // Start the dropdown at the bound's year rather than a decade of unreachable ones.
  const firstY = min ? min.getFullYear() : nowY - 10
  const yearOptions = Array.from({ length: Math.max(nowY - firstY + 2, 1) }, (_, i) => firstY + i).map((y) => ({
    value: String(y),
    label: String(y),
  }))
  const monthOptions = Array.from({ length: 12 }, (_, m) => ({
    value: String(m),
    label: format(new Date(2020, m, 1), 'MMMM'),
  }))

  return (
    <div className="w-[252px] shrink-0">
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setView(subMonths(view, 1))}
          disabled={prevBlocked}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          aria-label={t('datepicker.prev')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <Select
          value={String(view.getMonth())}
          onValueChange={(v) => setView(setMonth(view, Number(v)))}
          options={monthOptions}
          className="h-7 flex-1 py-0 text-xs"
        />
        <Select
          value={String(year)}
          onValueChange={(v) => setView(setYear(view, Number(v)))}
          options={yearOptions}
          className="h-7 w-[72px] py-0 text-xs"
        />
        <button
          type="button"
          onClick={() => setView(addMonths(view, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={t('datepicker.next')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = isSameMonth(day, monthStart)
          const inRange = lo && hi && isWithinInterval(day, { start: lo, end: hi })
          const isStart = lo && isSameDay(day, lo)
          const isEnd = hi && isSameDay(day, hi)
          const isEndpoint = !!(isStart || isEnd)
          const single = !!(lo && hi && isSameDay(lo, hi))
          const blocked = isBlocked(day)

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onPick(day)}
              onMouseEnter={() => onHover(day)}
              disabled={blocked}
              className="relative flex h-9 items-center justify-center disabled:pointer-events-none"
            >
              {inRange && !isEndpoint && <span className="absolute inset-0 bg-primary/15" />}
              {isStart && !single && <span className="absolute inset-y-0 left-1/2 right-0 bg-primary/15" />}
              {isEnd && !single && <span className="absolute inset-y-0 left-0 right-1/2 bg-primary/15" />}
              <span
                className={cn(
                  'relative z-10 flex h-9 w-9 items-center justify-center text-sm transition-colors',
                  !inMonth && 'text-muted-foreground/40',
                  // Out of bounds: visibly struck through rather than merely dimmed, so it
                  // reads as "not available" instead of "belongs to another month".
                  blocked && 'text-muted-foreground/25 line-through',
                  isEndpoint && 'rounded-full bg-primary font-medium text-primary-foreground',
                  !inRange && isToday(day) && 'rounded-full ring-1 ring-inset ring-primary/50',
                )}
              >
                {day.getDate()}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
