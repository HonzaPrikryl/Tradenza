'use client'

import { useMemo } from 'react'
import { t } from '@/i18n'
import type { ProgressYearData, ProgressCalendarCell } from '@/lib/actions/progress'
import { heatCellLabel, prettyDate, type HeatDaySummary } from '@/lib/progress-format'
import HeatCellTooltip from './HeatCellTooltip'
import HeatLegend from './HeatLegend'
import WidgetInfo from './WidgetInfo'
import YearHeatmap from './YearHeatmap'

// A scored trading day in the shape the shared tooltip describes: tasks are the soft rules,
// constraints the hard ones.
const summarise = (d: ProgressCalendarCell | undefined): HeatDaySummary | undefined =>
  d && {
    status: d.status,
    away: d.away,
    taskTotal: d.softTotal,
    taskDone: d.softDone,
    constraintTotal: d.hardTotal,
    constraintBreached: d.hardViolations,
    cleanNoTrade: d.cleanNoTrade,
    tallyPath: 'progress.calendar.tally',
  }

// Trading discipline adapter over the shared YearHeatmap: feeds the scored calendar
// cells and supplies the trading-specific header stats, legend and tooltip.
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
  const cells = useMemo(() => new Map(data.days.map((d) => [d.date, d])), [data.days])

  return (
    <YearHeatmap<ProgressCalendarCell>
      year={year}
      years={years}
      cells={cells}
      today={todayKey}
      selectedDate={selectedDate}
      pending={pending}
      onYearChange={onYearChange}
      onSelect={onSelect}
      headerCenter={<span className="text-sm text-muted-foreground">{prettyDate(selectedDate)}</span>}
      headerRight={
        <>
          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">
            {data.perfectDays} {t('progress.calendar.green')}
          </span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
            {data.loggedDays} {t('progress.calendar.logged')}
          </span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
            {Math.round(data.avgRatio * 100)}% {t('progress.calendar.avg')}
          </span>
          <WidgetInfo text={t('progress.calendar.info')} />
        </>
      }
      legend={<HeatLegend noTrade />}
      // What a screen reader hears instead of "button": the tooltip's own lines.
      cellLabel={(date, d) => heatCellLabel(date, summarise(d))}
      renderTooltip={(date, d) => <HeatCellTooltip date={date} day={summarise(d)} />}
    />
  )
}
