'use client'

import { memo, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ChevronLeft, ChevronRight, Settings2, Check, Loader2 } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { getCalendarData, updateWidgetSettings } from '@/lib/actions/dashboard'
import { cn, compactUnit, type DisplayUnit } from '@/lib/utils'
import {
  CALENDAR_DAY_STATS,
  DEFAULT_CALENDAR_SETTINGS,
  type CalendarData,
  type CalendarDay,
  type CalendarDayStat,
  type WidgetInstance,
} from '@/lib/dashboard/types'
import { useDashboardData } from '../DashboardDataContext'
import { useTheme } from '@/components/providers/ThemeProvider'
import DayDetailDialog from './DayDetailDialog'
import { t, tList } from '@/i18n'
import { getUiLocale } from '@/i18n/config'
import { useMediaQuery } from '@/hooks/useMediaQuery'

const WEEKDAYS = tList('datepicker.weekdaysShort')

const TXT_PNL = 'text-[clamp(0.72rem,2.3vw,0.9rem)]'
const TXT_SUB = 'text-[clamp(0.4rem,1.9vw,0.6rem)]'
const TXT_DAY = 'text-[clamp(0.62rem,1.9vw,0.78rem)]'

type WeekSum = { netPnl: number; tradingDays: number; trades: number }

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString(getUiLocale(), { month: 'long', year: 'numeric' })
}

const compact = (v: number, unit: DisplayUnit, currency = 'USD') => compactUnit(v, unit, currency)

interface Cell {
  day: number
  inMonth: boolean
}

function buildRows(year: number, month: number): Cell[][] {
  const first = new Date(year, month - 1, 1)
  const startDow = first.getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const prevDays = new Date(year, month - 1, 0).getDate()
  const cells: Cell[] = []
  for (let i = startDow - 1; i >= 0; i--) cells.push({ day: prevDays - i, inMonth: false })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true })
  let next = 1
  while (cells.length % 7 !== 0) cells.push({ day: next++, inMonth: false })
  const rows: Cell[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

function CalendarWidget({ instance }: { instance: WidgetInstance }) {
  const { calendarInitial, currency, unit, editing } = useDashboardData()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const narrow = useMediaQuery('(max-width: 910px)')
  const [cal, setCal] = useState<CalendarData>(calendarInitial)
  const [pending, startTransition] = useTransition()
  const [, startSave] = useTransition()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const initialStats = (instance.settings?.stats as CalendarDayStat[] | undefined) ?? DEFAULT_CALENDAR_SETTINGS.stats
  const [stats, setStats] = useState<CalendarDayStat[]>(initialStats)

  useEffect(() => {
    setCal(calendarInitial)
  }, [calendarInitial])
  useEffect(() => {
    setStats(initialStats)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialStats)])

  const dayMap = useMemo(() => new Map(cal.days.map((d) => [d.date, d])), [cal.days])
  const rows = useMemo(() => buildRows(cal.year, cal.month), [cal.year, cal.month])
  const todayKey = new Date().toLocaleDateString('en-CA')
  const rowsTemplate = { gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }

  const [page, setPage] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  function onScroll() {
    const el = scrollerRef.current
    if (!el) return
    const p = Math.round(el.scrollLeft / el.clientWidth)
    if (p !== page) setPage(p)
  }
  function goToPage(p: number) {
    const el = scrollerRef.current
    if (el) el.scrollTo({ left: p * el.clientWidth, behavior: 'smooth' })
  }
  useEffect(() => {
    if (!narrow) setPage(0)
  }, [narrow])

  function handleDayClick(dateKey: string, day?: CalendarDay) {
    if (day && day.trades > 0) setSelectedDate(dateKey)
  }
  function load(y: number, m: number) {
    startTransition(async () => setCal(await getCalendarData(y, m)))
  }
  function navigate(delta: number) {
    let y = cal.year,
      m = cal.month + delta
    if (m < 1) {
      m = 12
      y -= 1
    }
    if (m > 12) {
      m = 1
      y += 1
    }
    load(y, m)
  }
  function thisMonth() {
    const n = new Date()
    load(n.getFullYear(), n.getMonth() + 1)
  }
  function toggleStat(key: CalendarDayStat) {
    const next = stats.includes(key) ? stats.filter((k) => k !== key) : [...stats, key]
    setStats(next)
    if (!editing)
      startSave(async () => {
        await updateWidgetSettings(instance.id, { stats: next })
      })
  }

  const headCell =
    'text-center text-xs font-semibold text-muted-foreground py-1.5 border border-border/60 rounded-md bg-muted/30'

  const renderDay = (cell: Cell, i: number) => {
    const key = cell.inMonth
      ? `${cal.year}-${String(cal.month).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`
      : ''
    const d = cell.inMonth ? dayMap.get(key) : undefined
    return (
      <DayCell
        key={i}
        cell={cell}
        day={d}
        stats={stats}
        currency={currency}
        unit={unit}
        isToday={key === todayKey}
        isLight={isLight}
        onClick={cell.inMonth ? () => handleDayClick(key, d) : undefined}
      />
    )
  }

  return (
    <div className="flex flex-col h-full min-h-[420px] bg-card border border-border rounded-xl p-3 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1 pb-2.5 flex-wrap gap-2 border-b border-border/60">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('dashboard.calendar.previousMonth')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold min-w-[120px] text-center">{monthLabel(cal.year, cal.month)}</span>
          <button
            onClick={() => navigate(1)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('dashboard.calendar.nextMonth')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={thisMonth}
            className="ml-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent transition-colors"
          >
            {t('dashboard.calendar.thisMonth')}
          </button>
        </div>

        <div className="flex items-center gap-3">
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground hidden sm:inline">{t('dashboard.calendar.monthlyStats')}</span>
            <span className={cn('tabular font-semibold', cal.monthNetPnl >= 0 ? 'text-profit' : 'text-loss')}>
              {compact(cal.monthNetPnl, unit, currency)}
            </span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
              {t('dashboard.calendar.daysCount', { count: cal.monthTradingDays })}
            </span>
          </div>
          {!editing && (
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t('dashboard.calendar.settings')}
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  sideOffset={6}
                  align="end"
                  className="z-50 w-56 rounded-lg border border-border bg-popover p-2 shadow-xl animate-fade-in"
                >
                  <div className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t('dashboard.calendar.dayCardStats')}
                  </div>
                  {CALENDAR_DAY_STATS.map((s) => {
                    const active = stats.includes(s.key)
                    return (
                      <button
                        key={s.key}
                        onClick={() => toggleStat(s.key)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      >
                        <span>{t(`dashboard.calendar.dayStats.${s.key}`)}</span>
                        {active && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    )
                  })}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}
        </div>
      </div>

      {narrow ? (
        <>
          <div
            ref={scrollerRef}
            onScroll={onScroll}
            className="flex-1 flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
          >
            <section className="w-full shrink-0 snap-center flex flex-col pr-0.5">
              <div className="grid grid-cols-7 gap-2 mb-3">
                {WEEKDAYS.map((d) => (
                  <div key={d} className={headCell}>
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2 flex-1" style={rowsTemplate}>
                {rows.flat().map((cell, i) => renderDay(cell, i))}
              </div>
            </section>

            <section className="w-full shrink-0 snap-center flex flex-col pl-0.5">
              <div className={cn(headCell, 'mb-3')}>{t('dashboard.calendar.weeklySummary')}</div>
              <div className="grid grid-cols-1 gap-2 flex-1" style={rowsTemplate}>
                {rows.map((_, wi) => (
                  <WeekSummary
                    key={wi}
                    weekNumber={wi + 1}
                    summary={cal.weeks[wi]}
                    currency={currency}
                    unit={unit}
                    row
                  />
                ))}
              </div>
            </section>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-2.5">
            {[0, 1].map((p) => (
              <button
                key={p}
                onClick={() => goToPage(p)}
                aria-label={p === 0 ? t('dashboard.calendar.days') : t('dashboard.calendar.weeklySummary')}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  page === p ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70',
                )}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col overflow-x-auto">
          <div className="grid grid-cols-[repeat(7,1fr)_148px] gap-2 mb-3 min-w-[34rem]">
            {WEEKDAYS.map((d) => (
              <div key={d} className={headCell}>
                {d}
              </div>
            ))}
            <div className={headCell}>{t('dashboard.calendar.weekHeader')}</div>
          </div>
          <div className="grid grid-cols-[repeat(7,1fr)_148px] gap-2 flex-1 min-w-[34rem]" style={rowsTemplate}>
            {rows.map((week, wi) => (
              <FragmentRow key={wi}>
                {week.map((cell, i) => renderDay(cell, wi * 7 + i))}
                <WeekSummary weekNumber={wi + 1} summary={cal.weeks[wi]} currency={currency} unit={unit} />
              </FragmentRow>
            ))}
          </div>
        </div>
      )}

      {selectedDate && (
        <DayDetailDialog date={selectedDate} currency={currency} onClose={() => setSelectedDate(null)} />
      )}
    </div>
  )
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function WeekSummary({
  weekNumber,
  summary,
  currency,
  unit,
  row,
}: {
  weekNumber: number
  summary?: WeekSum
  currency: string
  unit: DisplayUnit
  row?: boolean
}) {
  const has = !!summary && summary.tradingDays > 0
  const pnl = summary?.netPnl ?? 0
  const days = has ? summary!.tradingDays : 0
  const pnlCls = has ? (pnl >= 0 ? 'text-profit' : 'text-loss') : 'text-muted-foreground'
  const badge = (
    <span className="w-fit rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {t('dashboard.calendar.daysCount', { count: days })}
    </span>
  )

  if (row) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3">
        <span className="text-xs text-muted-foreground">{t('dashboard.calendar.weekNumber', { n: weekNumber })}</span>
        <div className="flex items-center gap-3">
          <span className={cn('text-base tabular font-bold', pnlCls)}>{compact(pnl, unit, currency)}</span>
          {badge}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col justify-center rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1">
      <span className="text-[11px] text-muted-foreground">{t('dashboard.calendar.weekNumber', { n: weekNumber })}</span>
      <span className={cn('text-xl tabular font-bold', pnlCls)}>{compact(pnl, unit, currency)}</span>
      <span className="mt-1">{badge}</span>
    </div>
  )
}

export default memo(CalendarWidget)

function DayCell({
  cell,
  day,
  stats,
  currency,
  unit,
  isToday,
  isLight,
  onClick,
}: {
  cell: Cell
  day?: CalendarDay
  stats: CalendarDayStat[]
  currency: string
  unit: DisplayUnit
  isToday: boolean
  isLight: boolean
  onClick?: () => void
}) {
  if (!cell.inMonth) {
    return (
      <div className="rounded-lg border border-border bg-background/40 p-1.5 flex">
        <span className={cn('ml-auto leading-none text-muted-foreground/40', TXT_DAY)}>{cell.day}</span>
      </div>
    )
  }

  const has = !!day && day.trades > 0
  // Tone comes from the server-computed outcome, which respects the breakeven band
  // (and is measured on dollar P&L even when the calendar is shown in R).
  const tone = day?.outcome === 'loss' ? 'loss' : day?.outcome === 'breakeven' ? 'breakeven' : 'profit'
  const bgAlpha = isLight ? 0.1 : 0.07
  const borderAlpha = isLight ? 0.8 : 0.85

  const fmtR = (v: number) => `${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(1).replace(/\.0$/, '')}R`
  const rwParts: string[] = []
  if (day && stats.includes('rMultiple')) rwParts.push(fmtR(day.rMultiple))
  if (day && stats.includes('winRate')) rwParts.push(`${day.winRate.toFixed(1)}%`)

  return (
    <div
      onClick={has ? onClick : undefined}
      role={has ? 'button' : undefined}
      tabIndex={has ? 0 : undefined}
      className={cn(
        'relative rounded-lg border p-2 lg:p-2.5 flex flex-col min-h-0 min-w-0 outline-none transition-[filter,box-shadow] duration-150',
        has ? 'cursor-pointer hover:brightness-125 hover:shadow-md' : 'border-border bg-muted/50',
      )}
      style={
        has
          ? {
              backgroundColor: `hsl(var(--${tone}) / ${bgAlpha.toFixed(3)})`,
              borderColor: `hsl(var(--${tone}) / ${borderAlpha})`,
            }
          : undefined
      }
    >
      <span
        className={cn(
          'self-end leading-none',
          isToday
            ? 'flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold'
            : cn('font-semibold text-foreground/80', TXT_DAY),
        )}
      >
        {cell.day}
      </span>
      {has && day && (
        <div className="flex-1 flex flex-col items-end justify-center text-right gap-0.5 leading-tight w-full overflow-hidden">
          {stats.includes('netPnl') && (
            <span className={cn('font-bold text-foreground truncate max-w-full', TXT_PNL)}>
              {compact(day.netPnl, unit, currency)}
            </span>
          )}
          {stats.includes('trades') && (
            <span className={cn('text-foreground/85 truncate max-w-full', TXT_SUB)}>
              {t(day.trades === 1 ? 'dashboard.calendar.tradeOne' : 'dashboard.calendar.tradeMany', {
                count: day.trades,
              })}
            </span>
          )}
          {rwParts.length > 0 && (
            <span className={cn('text-foreground/75 truncate max-w-full', TXT_SUB)}>{rwParts.join(', ')}</span>
          )}
        </div>
      )}
    </div>
  )
}
