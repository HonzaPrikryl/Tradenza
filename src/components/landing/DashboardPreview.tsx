'use client'

import { useEffect, useRef, useState } from 'react'
import { t } from '@/i18n'

type Outcome = 'w' | 'l' | 'b' | 'x'

const CALENDAR: Outcome[] = [
  'w',
  'l',
  'w',
  'w',
  'b',
  'w',
  'w',
  'l',
  'w',
  'w',
  'l',
  'w',
  'w',
  'b',
  'l',
  'w',
  'w',
  'w',
  'l',
  'w',
  'b',
  'l',
  'w',
  'w',
  'x',
]

const CELL_TONE: Record<Outcome, string> = {
  w: 'bg-profit/70',
  l: 'bg-loss/60',
  b: 'bg-breakeven/50',
  x: 'bg-muted',
}

const KPIS = [
  {
    key: 'netPnl',
    label: () => t('landing.mockup.netPnl'),
    target: 12480,
    tone: 'profit' as const,
    format: (n: number) => `+$${Math.round(n).toLocaleString('en-US')}`,
  },
  {
    key: 'winRate',
    label: () => t('landing.mockup.winRate'),
    target: 63,
    tone: 'neutral' as const,
    format: (n: number) => `${Math.round(n)}%`,
  },
  {
    key: 'profitFactor',
    label: () => t('landing.mockup.profitFactor'),
    target: 2.4,
    tone: 'neutral' as const,
    format: (n: number) => n.toFixed(1),
  },
]

function useCountUp(target: number, play: boolean, reduced: boolean, duration = 950) {
  const [value, setValue] = useState(reduced ? target : 0)

  useEffect(() => {
    if (!play) {
      setValue(reduced ? target : 0)
      return
    }
    if (reduced) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [play, reduced, target, duration])

  return value
}

function Kpi({ kpi, play, reduced }: { kpi: (typeof KPIS)[number]; play: boolean; reduced: boolean }) {
  const value = useCountUp(kpi.target, play, reduced)
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 sm:p-3.5">
      <div className="mb-1 truncate text-[9px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">
        {kpi.label()}
      </div>
      <div
        className={`tabular text-base font-semibold sm:text-xl md:text-2xl ${
          kpi.tone === 'profit' ? 'text-profit' : 'text-foreground'
        }`}
      >
        {kpi.format(value)}
      </div>
    </div>
  )
}

export default function DashboardPreview() {
  const [play, setPlay] = useState(false)
  const [reduced, setReduced] = useState(false)
  const timerRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const clearPending = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
      timerRef.current = null
      frameRef.current = null
    }
    const start = () => {
      clearPending()
      const rm = media.matches
      setReduced(rm)
      setPlay(false)
      if (rm) {
        setPlay(true)
        return
      }
      frameRef.current = window.requestAnimationFrame(() => {
        timerRef.current = window.setTimeout(() => setPlay(true), 180)
      })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start()
    }

    start()
    window.addEventListener('pageshow', start)
    window.addEventListener('focus', start)
    document.addEventListener('visibilitychange', onVisibility)
    media.addEventListener('change', start)

    return () => {
      clearPending()
      window.removeEventListener('pageshow', start)
      window.removeEventListener('focus', start)
      document.removeEventListener('visibilitychange', onVisibility)
      media.removeEventListener('change', start)
    }
  }, [])

  return (
    <div className="relative mx-auto w-full max-w-md motion-safe:animate-float sm:max-w-lg lg:max-w-none">
      <div className="rounded-2xl border border-border bg-gradient-to-b from-card to-background p-2 shadow-2xl shadow-black/40">
        <div className="rounded-xl border border-border bg-background/80 p-3 backdrop-blur-sm sm:p-5">
          <div className="mb-4 flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2 sm:gap-3">
            {KPIS.map((kpi) => (
              <Kpi key={kpi.key} kpi={kpi} play={play} reduced={reduced} />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="col-span-2 rounded-lg border border-border bg-card p-3 sm:p-4">
              <div className="mb-3 text-[11px] font-medium text-muted-foreground sm:text-xs">
                {t('landing.mockup.equity')}
              </div>
              <svg viewBox="0 0 600 200" className="h-24 w-full sm:h-36" preserveAspectRatio="none" aria-hidden>
                <defs>
                  <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--profit))" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="hsl(var(--profit))" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,170 C60,165 90,150 140,150 C190,150 210,120 260,118 C310,116 330,135 380,120 C430,105 450,70 500,55 C550,40 575,30 600,22 L600,200 L0,200 Z"
                  fill="url(#equityFill)"
                  style={{
                    opacity: play ? 1 : 0,
                    transition: reduced ? undefined : 'opacity 0.6s ease-out 0.6s',
                  }}
                />
                <path
                  d="M0,170 C60,165 90,150 140,150 C190,150 210,120 260,118 C310,116 330,135 380,120 C430,105 450,70 500,55 C550,40 575,30 600,22"
                  fill="none"
                  stroke="hsl(var(--profit))"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  pathLength={1}
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: play || reduced ? 0 : 1,
                    transition: reduced ? undefined : 'stroke-dashoffset 1.2s ease-out',
                  }}
                />
              </svg>
            </div>

            <div className="flex flex-col justify-center rounded-lg border border-border bg-card p-3 sm:p-4">
              <div className="mb-3 text-[11px] font-medium text-muted-foreground sm:text-xs">
                {t('landing.mockup.calendar')}
              </div>
              <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
                {CALENDAR.map((c, i) => (
                  <div
                    key={i}
                    className={`aspect-square rounded-sm transition-all duration-300 ease-out ${CELL_TONE[c]}`}
                    style={{
                      opacity: play || reduced ? 1 : 0,
                      transform: play || reduced ? 'scale(1)' : 'scale(0.5)',
                      transitionDelay: reduced ? undefined : `${i * 22}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
