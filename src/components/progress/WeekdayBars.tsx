'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { t, tList } from '@/i18n'
import WidgetInfo from './WidgetInfo'

const WD = tList('datepicker.weekdaysMin')
const WD_FULL = tList('datepicker.weekdays')

export interface WeekdayDatum {
  dow: number // 0=Sun … 6=Sat
  ratio: number
  /** In-scope samples that fed the average (0 → no data yet). */
  samples: number
  /** At least one rule/habit runs on this weekday (drives the no-data wording). */
  scheduled: boolean
}

interface Tip {
  label: string
  pct: number
  noData: boolean
  scheduled: boolean
  x: number
  y: number
}

// Shared by-weekday bar chart, used by the trading discipline breakdown and the habits
// stats. Same bars, same hover/focus tooltip, same "no data" vs "not tracked" wording —
// only the card's title/sub/info differ per domain.
export default function WeekdayBars({
  weekday,
  title,
  sub,
  info,
}: {
  weekday: WeekdayDatum[]
  title: string
  sub: string
  info: string
}) {
  const [tip, setTip] = useState<Tip | null>(null)

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <WidgetInfo text={info} className="translate-x-[-100%]" />
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{sub}</p>
      <div className="flex h-60 flex-col">
        <div className="flex flex-1 items-end gap-2">
          {weekday.map((w) => {
            const pct = Math.round(w.ratio * 100)
            const noData = w.samples === 0
            const aria = noData
              ? `${WD_FULL[w.dow]}: ${w.scheduled ? t('progress.stats.weekdayNoData') : t('progress.stats.weekdayNotTracked')}`
              : `${WD_FULL[w.dow]}: ${t('progress.stats.weekdayTip', { pct })}`
            const mk = (x: number, y: number): Tip => ({
              label: WD_FULL[w.dow],
              pct,
              noData,
              scheduled: w.scheduled,
              x,
              y,
            })
            const showTip = (el: HTMLElement) => {
              const r = el.getBoundingClientRect()
              setTip(mk(r.left + r.width / 2, r.top))
            }
            return (
              <div
                key={w.dow}
                role="img"
                tabIndex={0}
                aria-label={aria}
                className="flex h-full flex-1 cursor-default flex-col justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                onMouseMove={(e) => setTip(mk(e.clientX, e.clientY))}
                onMouseLeave={() => setTip(null)}
                onFocus={(e) => showTip(e.currentTarget)}
                onBlur={() => setTip(null)}
              >
                {noData ? (
                  <div className="h-2 w-full rounded-sm border border-dashed border-muted-foreground/30" />
                ) : (
                  <div
                    className="w-full rounded-t-md bg-primary transition-all duration-500"
                    style={{ height: `${Math.max(6, pct)}%`, opacity: 0.5 }}
                  />
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-1.5 flex gap-2">
          {weekday.map((w) => (
            <span key={w.dow} className="flex-1 text-center text-[10px] text-muted-foreground">
              {WD[w.dow]}
            </span>
          ))}
        </div>
      </div>

      {tip &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[70] -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-2xl"
            style={{ left: tip.x, top: tip.y - 8 }}
          >
            <div className="font-medium text-foreground">{tip.label}</div>
            <div className="mt-0.5 text-muted-foreground">
              {tip.noData
                ? tip.scheduled
                  ? t('progress.stats.weekdayNoData')
                  : t('progress.stats.weekdayNotTracked')
                : t('progress.stats.weekdayTip', { pct: tip.pct })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
