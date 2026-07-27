'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t, tList } from '@/i18n'
import Select from '@/components/ui/Select'
import { buildYearGrid, heatStatusClass, heatCellGlow } from '@/lib/heatmap-grid'
import type { DayStatus } from '@/lib/progress-compute'

const MONTHS = tList('datepicker.monthsShort')
const WD_SHORT = tList('datepicker.weekdaysShort')
const WD_LABELS = ['', WD_SHORT[1], '', WD_SHORT[3], '', WD_SHORT[5], '']

const COL = 15 // column pitch (cell + gap)

/** Minimum a cell must expose to be coloured by the shared RYG ramp. */
export interface HeatCell {
  status: DayStatus
  ratio: number
  cleanNoTrade?: boolean
  /** Marked away — shaded as an explicit day off rather than an untouched grey day. */
  away?: boolean
}

interface TipState {
  date: string
  x: number
  y: number
}

// Presentational contribution-style year grid shared by the trading discipline and
// the habits heatmaps. It owns the year selector, the grid, the today/selected rings
// and the tooltip portal; callers supply the coloured cells plus the domain-specific
// header stats, legend and tooltip content. Cells are only interactive when onSelect
// is passed (the trading + habits heatmaps are clickable; a read-only view omits it).
export default function YearHeatmap<T extends HeatCell>({
  year,
  years,
  cells,
  today,
  selectedDate,
  pending,
  onYearChange,
  onSelect,
  headerCenter,
  headerRight,
  legend,
  renderTooltip,
  cellLabel,
}: {
  year: number
  years: number[]
  cells: Map<string, T>
  today: string
  selectedDate?: string
  pending?: boolean
  onYearChange: (year: number) => void
  onSelect?: (date: string) => void
  headerCenter?: ReactNode
  headerRight?: ReactNode
  legend: ReactNode
  renderTooltip: (date: string, cell: T | undefined) => ReactNode
  /**
   * Screen-reader name for one cell — "Mon 27 Jul: On plan, 3 of 4 habits". Without it the
   * grid is 365 buttons with no content, which is what a screen reader would read out. The
   * caller owns the wording because only it knows what its cells mean.
   */
  cellLabel: (date: string, cell: T | undefined) => string
}) {
  const weeks = useMemo(() => buildYearGrid(year), [year])
  const [tip, setTip] = useState<TipState | null>(null)

  const showTip = (el: HTMLElement, date: string) => {
    const r = el.getBoundingClientRect()
    setTip({ date, x: r.left + r.width / 2, y: r.top })
  }
  const hideTip = () => setTip(null)

  // Roving tabindex: the grid is ONE tab stop, not 365. Arrows move by a day (←/→) or a
  // week (↑/↓) — the same mental model as the layout — and Home/End jump to the row's
  // edges. Without this, reaching the content after the heatmap means 365 presses of Tab.
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const selectableKeys = useMemo(
    () => weeks.flatMap((w) => w.filter((c) => c.inYear && c.key <= today).map((c) => c.key)),
    [weeks, today],
  )
  // What the single tab stop lands on: wherever focus was last, else the selected day,
  // else today, else the last selectable day of the year being viewed.
  const tabStop =
    (focusKey && selectableKeys.includes(focusKey) ? focusKey : null) ??
    (selectedDate && selectableKeys.includes(selectedDate) ? selectedDate : null) ??
    (selectableKeys.includes(today) ? today : null) ??
    selectableKeys[selectableKeys.length - 1] ??
    null

  const moveFocus = (from: string, delta: number) => {
    const i = selectableKeys.indexOf(from)
    if (i === -1) return
    const next = selectableKeys[Math.min(Math.max(i + delta, 0), selectableKeys.length - 1)]
    if (!next || next === from) return
    setFocusKey(next)
    // The cell we're moving to may be off-screen in the horizontally scrolling grid, so
    // let the browser bring it into view as part of focusing it.
    requestAnimationFrame(() => document.getElementById(`heat-${next}`)?.focus())
  }

  const onCellKeyDown = (e: React.KeyboardEvent<HTMLElement>, key: string) => {
    const step: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }
    if (e.key in step) {
      e.preventDefault()
      moveFocus(key, step[e.key])
      return
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      const target = e.key === 'Home' ? selectableKeys[0] : selectableKeys[selectableKeys.length - 1]
      if (target) {
        setFocusKey(target)
        requestAnimationFrame(() => document.getElementById(`heat-${target}`)?.focus())
      }
    }
  }

  const monthLabels = useMemo(() => {
    const out: { col: number; label: string }[] = []
    weeks.forEach((week, wi) => {
      const first = week.find((c) => c.inYear && c.day === 1)
      if (first) out.push({ col: wi, label: MONTHS[first.month] })
    })
    return out
  }, [weeks])

  // The grid is built once per data change and memoised on purpose. Opening the tooltip is
  // a state update on THIS component, so without it every hover re-rendered all 365 cells
  // — 365 className recomputations to move a popover. `tip` is deliberately not a dep.
  const grid = useMemo(
    () => (
      <div className="flex gap-[3px]" role="group" aria-label={t('progress.calendar.gridAria', { year })}>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((cell, di) => {
              if (!cell.inYear) return <span key={di} className="h-3 w-3" />
              const d = cells.get(cell.key)
              const isFuture = cell.key > today
              const isToday = cell.key === today
              const isSelected = selectedDate != null && cell.key === selectedDate
              // One source of truth for the fill: `heatStatusClass` decides, and the
              // neutral grey applies exactly when it declined to colour the cell.
              // (It used to be gated on `status === 'none'`, which silently broke
              // every state that is deliberately reported as 'none' — an away day is
              // 'none' so the averages skip it, and the grey Tailwind UTILITY then
              // beat the shade class from @layer components.)
              const heat = d ? heatStatusClass(d) : false
              const className = cn(
                'h-3 w-3 rounded-[3px] border transition-transform',
                !heat && 'border-muted-foreground/30 bg-muted/50',
                heat,
                isFuture && 'opacity-30',
                isToday && 'ring-1 ring-foreground/50',
                isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                onSelect && !isFuture && 'hover:scale-125',
              )
              // The perfect-day glow is an inline box-shadow; Tailwind's ring is
              // also box-shadow, so the glow would clobber the today/selected ring.
              const style = d && !isSelected && !isToday ? heatCellGlow(d) : undefined

              // The tooltip is the only place a cell's meaning is written down, so it
              // has to open on FOCUS as well as hover — otherwise the grid is
              // colour-only for anyone not using a mouse.
              const hover = {
                onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(e.currentTarget, cell.key),
                onMouseLeave: hideTip,
                onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(e.currentTarget, cell.key),
                onBlur: hideTip,
              }

              if (onSelect) {
                return (
                  <button
                    key={di}
                    id={`heat-${cell.key}`}
                    type="button"
                    disabled={isFuture}
                    // One tab stop for the whole grid; arrows move within it.
                    tabIndex={cell.key === tabStop ? 0 : -1}
                    aria-label={cellLabel(cell.key, d)}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setFocusKey(cell.key)
                      onSelect(cell.key)
                    }}
                    onKeyDown={(e) => onCellKeyDown(e, cell.key)}
                    {...hover}
                    className={cn(className, 'focus-visible:ring-2 focus-visible:ring-primary focus:outline-none')}
                    style={style}
                  />
                )
              }
              return (
                <span
                  key={di}
                  id={`heat-${cell.key}`}
                  role="img"
                  tabIndex={0}
                  aria-label={cellLabel(cell.key, d)}
                  {...hover}
                  className={cn(className, 'focus-visible:ring-2 focus-visible:ring-primary focus:outline-none')}
                  style={style}
                />
              )
            })}
          </div>
        ))}
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weeks, cells, today, selectedDate, tabStop, onSelect, cellLabel, year],
  )

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
          {headerCenter}
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {headerRight && <div className="flex items-center gap-2 text-xs">{headerRight}</div>}
      </div>

      {/* Grid */}
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
            <div className="relative mb-1 h-3.5" style={{ width: weeks.length * COL }}>
              {monthLabels.map((m) => (
                <span
                  key={`${m.col}-${m.label}`}
                  className="absolute text-[10px] text-muted-foreground"
                  style={{ left: m.col * COL }}
                >
                  {m.label}
                </span>
              ))}
            </div>

            {grid}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 px-1 text-[10px] text-muted-foreground">
        {legend}
      </div>

      {tip &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[70] -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-2xl"
            style={{ left: tip.x, top: tip.y - 8 }}
          >
            {renderTooltip(tip.date, cells.get(tip.date))}
          </div>,
          document.body,
        )}
    </div>
  )
}
