'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/components/providers/ThemeProvider'

export interface ChartColors {
  profit: string
  loss: string
  grid: string
  axis: string
  primary: string
  card: string
  popover: string
  border: string
  bandA: string
  bandB: string
  radarGrid: string
  purple: string
}

const DARK_FALLBACK: ChartColors = {
  profit: 'hsl(158 64% 52%)',
  loss: 'hsl(0 72% 60%)',
  grid: 'hsl(220 12% 18%)',
  axis: 'hsl(220 8% 55%)',
  primary: 'hsl(158 64% 52%)',
  card: 'hsl(220 14% 11%)',
  popover: 'hsl(220 14% 13%)',
  border: 'hsl(220 12% 18%)',
  bandA: 'hsl(220 13% 14%)',
  bandB: 'hsl(220 14% 11%)',
  radarGrid: 'hsl(220 10% 32%)',
  purple: 'hsl(258 90% 66%)',
}

function readVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v ? `hsl(${v})` : fallback
}

export function useChartColors(): ChartColors {
  const { theme } = useTheme()
  const [c, setC] = useState<ChartColors>(DARK_FALLBACK)
  useEffect(() => {
    setC({
      profit: readVar('--profit', DARK_FALLBACK.profit),
      loss: readVar('--loss', DARK_FALLBACK.loss),
      grid: readVar('--border', DARK_FALLBACK.grid),
      axis: readVar('--muted-foreground', DARK_FALLBACK.axis),
      primary: readVar('--primary', DARK_FALLBACK.primary),
      card: readVar('--card', DARK_FALLBACK.card),
      popover: readVar('--popover', DARK_FALLBACK.popover),
      border: readVar('--border', DARK_FALLBACK.border),
      bandA: theme === 'light' ? 'hsl(220 13% 92%)' : 'hsl(220 13% 14%)',
      bandB: readVar('--card', DARK_FALLBACK.bandB),
      radarGrid: theme === 'light' ? 'hsl(220 12% 80%)' : 'hsl(220 10% 32%)',
      purple: theme === 'light' ? 'hsl(258 74% 56%)' : 'hsl(258 90% 66%)',
    })
  }, [theme])
  return c
}

export function makeTooltipStyle(c: ChartColors): React.CSSProperties {
  return {
    background: c.popover,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    fontSize: 12,
    padding: '8px 10px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    color: 'hsl(var(--popover-foreground))',
  }
}

// ─── prefers-reduced-motion ───────────────────────────────────────────────────

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(m.matches)
    const fn = () => setReduced(m.matches)
    m.addEventListener('change', fn)
    return () => m.removeEventListener('change', fn)
  }, [])
  return reduced
}

// ─── Count-up animation ─────────────────────────────────────────────────────────

export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced || !isFinite(target)) {
      setValue(target)
      fromRef.current = target
      return
    }
    const from = fromRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, reduced])

  return value
}

export function WidgetShell({
  title,
  icon,
  action,
  children,
  className,
  bodyClassName,
  dragHandle,
}: {
  title?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  dragHandle?: React.ReactNode
}) {
  return (
    <div
      className={cn('group relative flex flex-col bg-card border border-border rounded-lg overflow-hidden', className)}
    >
      {(title || action || dragHandle) && (
        <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2.5 border-b border-border/60">
          <div className="flex items-center gap-2 min-w-0">
            {dragHandle}
            {icon}
            {title && <span className="text-xs font-medium text-muted-foreground truncate">{title}</span>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('flex-1 min-h-0 pt-2', bodyClassName)}>{children}</div>
    </div>
  )
}

export function WidgetEmpty({ label }: { label: string }) {
  return (
    <div className="h-full w-full min-h-[8rem] flex items-center justify-center text-xs text-muted-foreground p-4 text-center">
      {label}
    </div>
  )
}

// ─── Client-mount guard for charts ────────────────────────────────────────────
// recharts' ResponsiveContainer renders nothing until it measures its parent on
// the client (after hydration), which shows as a blank/white area. Gate the chart
// behind this so a shimmer placeholder shows until it's mounted and ready.

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

export function ChartSkeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-full w-full rounded-md', className)} />
}
