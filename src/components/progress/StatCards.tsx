'use client'

import { Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import WidgetInfo from './WidgetInfo'

// Shared stat cards for the Progress page, used identically by the trading overview
// and the habits tab so the two read as one family. Visual is intentionally frozen —
// only the label / value / info differ per domain.

export function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
  info,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: string
  accent?: boolean
  info?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl border bg-card p-4',
        accent ? 'border-primary/30' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        {info && <WidgetInfo text={info} />}
      </div>
      <div className="text-2xl font-bold tabular text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

// Ember-glow intensity per streak tier: the longer the run, the more flames and the
// brighter the pulse. Purely decorative — driven off the streak count.
const STREAK_GLOW = [
  { min: 0, max: 0 },
  { min: 0.12, max: 0.24 },
  { min: 0.2, max: 0.4 },
  { min: 0.32, max: 0.56 },
  { min: 0.46, max: 0.72 },
]

function streakTier(streak: number): number {
  if (streak <= 0) return 0
  if (streak >= 100) return 4
  if (streak >= 30) return 3
  if (streak >= 7) return 2
  return 1
}

// The streak card, gamified: flickering flames and a pulsing ember glow that grow with
// the streak. The flame count marks the milestones (a 3rd flame at 30 days, etc.).
// `label` lets the habits tab reuse it with its own wording; defaults to the trading
// clean-streak label.
export function StreakCard({ streak, info, label }: { streak: number; info: string; label?: string }) {
  const tier = streakTier(streak)
  const flames = Math.min(tier, 3)
  const glow = STREAK_GLOW[tier]
  const glowStyle = {
    background: 'radial-gradient(120% 100% at 50% 100%, rgba(251,146,60,0.9), transparent 70%)',
    '--streak-glow-min': `${glow.min}`,
    '--streak-glow-max': `${glow.max}`,
  } as React.CSSProperties

  return (
    <div
      className={cn(
        'relative flex flex-col gap-1 overflow-hidden rounded-xl border bg-card p-4',
        tier > 0 ? 'border-orange-400/30' : 'border-border',
      )}
    >
      {tier > 0 && (
        <div className="streak-glow pointer-events-none absolute inset-x-0 bottom-0 h-2/3" style={glowStyle} />
      )}
      {flames > 0 && (
        <div className="pointer-events-none absolute bottom-1.5 right-2 flex items-end gap-0.5" aria-hidden>
          {Array.from({ length: flames }).map((_, i) => (
            <Flame
              key={i}
              className={cn('streak-flame text-orange-500/70', tier >= 4 ? 'h-5 w-5' : 'h-4 w-4')}
              style={{ animationDelay: `${i * 0.25}s` }}
              strokeWidth={2}
            />
          ))}
        </div>
      )}
      <div className="relative flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <Flame className="h-3.5 w-3.5 text-orange-400" />
          <span className="truncate">{label ?? t('progress.stats.currentStreak')}</span>
        </span>
        <WidgetInfo text={info} />
      </div>
      <div className="relative text-2xl font-bold tabular text-foreground">{streak}</div>
      <div className="relative text-[11px] text-muted-foreground">
        {streak === 1 ? t('progress.stats.day') : t('progress.stats.days')}
      </div>
    </div>
  )
}
