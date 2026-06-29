'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Check, X, Sparkles, CalendarDays, Loader2, ArrowRight } from 'lucide-react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { getUiLocale } from '@/i18n/config'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { DayProgress, DayRule } from '@/lib/actions/progress'
import ProgressRing from './ProgressRing'
import RuleRow from './RuleRow'

export function prettyDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(getUiLocale(), { weekday: 'long', month: 'long', day: 'numeric' })
}

interface RowControls {
  editable?: boolean
  busy?: boolean
  onToggle?: (ruleId: string, next: boolean) => void
}

const GAP = 6
const FOOTER = 36

function ClampedRuleList({ rules, controls }: { rules: DayRule[]; controls?: RowControls }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRefs = useRef<(HTMLDivElement | null)[]>([])
  const [visible, setVisible] = useState(rules.length)

  useLayoutEffect(() => {
    const compute = () => {
      const c = containerRef.current
      if (!c) return
      const avail = c.clientHeight
      const heights = measureRefs.current.map((el) => el?.offsetHeight ?? 0)

      let totalAll = 0
      heights.forEach((h, i) => {
        totalAll += h + (i > 0 ? GAP : 0)
      })
      if (totalAll <= avail) {
        setVisible(rules.length)
        return
      }

      const target = avail - FOOTER - GAP
      let cum = 0
      let count = 0
      for (let i = 0; i < heights.length; i++) {
        const add = heights[i] + (i > 0 ? GAP : 0)
        if (cum + add > target) break
        cum += add
        count++
      }
      setVisible(Math.max(1, count))
    }

    compute()
    const ro = new ResizeObserver(compute)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [rules])

  const hidden = Math.max(0, rules.length - visible)
  const shown = hidden > 0 ? rules.slice(0, visible) : rules

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
      <div className="invisible absolute inset-x-0 top-0 space-y-1.5" aria-hidden>
        {rules.map((r, i) => (
          <div
            key={r.id}
            ref={(el) => {
              measureRefs.current[i] = el
            }}
          >
            <RuleRow rule={r} />
          </div>
        ))}
      </div>

      <div className="absolute inset-0 space-y-1.5">
        {shown.map((r) => (
          <RuleRow key={r.id} rule={r} {...controls} />
        ))}

        {hidden > 0 && (
          <Tooltip.Provider delayDuration={80}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-background/40 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                >
                  {t('progress.day.moreRules', { count: hidden })}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="top"
                  align="end"
                  sideOffset={6}
                  className="z-[60] max-h-72 w-64 overflow-auto rounded-lg border border-border bg-popover p-2 shadow-2xl animate-fade-in"
                >
                  <div className="space-y-1">
                    {rules.slice(visible).map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-xs">
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded',
                            r.completed ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {r.completed ? (
                            <Check className="h-3 w-3" strokeWidth={3} />
                          ) : (
                            <X className="h-3 w-3" strokeWidth={3} />
                          )}
                        </span>
                        <span className="truncate text-foreground/90">{r.name}</span>
                      </div>
                    ))}
                  </div>
                  <Tooltip.Arrow className="fill-[hsl(var(--popover))]" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        )}
      </div>
    </div>
  )
}

export default function DaySummaryPanel({
  day,
  loading,
  onViewDay,
  editable = false,
  busy = false,
  onToggleRule,
}: {
  day: DayProgress
  loading?: boolean
  onViewDay: () => void
  /** When true (viewing today), rules can be checked/unchecked inline. */
  editable?: boolean
  busy?: boolean
  onToggleRule?: (ruleId: string, next: boolean) => void
}) {
  const controls: RowControls = { editable, busy, onToggle: onToggleRule }
  const { completedCount, totalCount } = day
  const ratio = totalCount > 0 ? completedCount / totalCount : 0
  const perfect = totalCount > 0 && completedCount >= totalCount
  const clamp = useMediaQuery('(min-width: 1280px)')

  const message =
    totalCount === 0
      ? t('progress.day.noActiveRules')
      : perfect
        ? t('progress.process.perfect')
        : completedCount > 0
          ? t('progress.process.partial', { completed: completedCount, total: totalCount })
          : t('progress.process.none')

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <ProgressRing
          ratio={ratio}
          size={64}
          label={
            <span className="text-base">
              {completedCount}
              <span className="text-muted-foreground">/{totalCount}</span>
            </span>
          }
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {prettyDate(day.date)}
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          <div className="mt-1">
            {perfect ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/15 px-2 py-1 text-sm font-semibold text-primary">
                <Sparkles className="h-4 w-4" /> {t('progress.day.allDone')}
              </span>
            ) : (
              <span className="text-sm font-semibold text-foreground">
                {t('progress.day.completedOf', { completed: completedCount, total: totalCount })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Process message */}
      <div
        className={cn(
          'rounded-lg border px-3 py-2.5 text-sm',
          perfect
            ? 'border-primary/30 bg-primary/10 text-foreground'
            : 'border-border bg-muted/40 text-muted-foreground',
        )}
      >
        <span className="font-medium text-foreground">{t('progress.process.headline')}.</span> {message}
      </div>

      <div className={cn('flex flex-col', clamp && 'min-h-0 flex-1')}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('progress.day.rulesTitle')}
        </h3>
        {totalCount === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {t('progress.day.noActiveRules')}
          </p>
        ) : clamp ? (
          <ClampedRuleList key={day.date} rules={day.rules} controls={controls} />
        ) : (
          <div className="space-y-1.5">
            {day.rules.map((r) => (
              <RuleRow key={r.id} rule={r} {...controls} />
            ))}
          </div>
        )}
      </div>

      {/* View day */}
      <button
        onClick={onViewDay}
        className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {t('progress.day.viewDay')}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}
