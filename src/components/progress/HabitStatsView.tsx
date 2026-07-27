'use client'

import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { t } from '@/i18n'
import type { HabitsData } from '@/lib/actions/progress'
import { useChartColors } from '@/components/dashboard/widgets/shared'
import WidgetInfo from './WidgetInfo'
import ConsistencyList from './ConsistencyList'
import SharedTrendTooltip from './TrendTooltip'
import WeekdayBars from './WeekdayBars'

// Habits completion-trend tooltip — the shared TrendTooltip with a habit-specific
// third line (kept count), matching the trading overview's format and colouring.
function TrendTooltip(props: { active?: boolean; payload?: { payload: HabitsData['trend'][number] }[] }) {
  return (
    <SharedTrendTooltip
      {...props}
      disciplineLabel={t('progress.habits.stats.trendDiscipline')}
      missedLabel={t('progress.habits.stats.trendMissed')}
      renderExtra={(d) => (
        <>
          {d.total > 0 && (
            <div className="mt-0.5 text-muted-foreground">
              {t('progress.habits.stats.trendDone', { done: d.done, total: d.total })}
            </div>
          )}
          {d.avoidTotal > 0 && (
            <div className="mt-0.5 text-muted-foreground">
              {t('progress.habits.stats.trendAvoid', { kept: d.avoidKept, total: d.avoidTotal })}
            </div>
          )}
        </>
      )}
    />
  )
}

// Habit statistics — the trend line, per-habit consistency and by-weekday bars.
// Mirrors the trading ProgressStats layout so the two tabs read as one family.
// `section` places the trend under the heatmap and the breakdown below the grid,
// exactly like the trading overview.
export default function HabitStatsView({ data, section }: { data: HabitsData; section: 'trend' | 'breakdown' }) {
  const C = useChartColors()

  if (section === 'trend') {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{t('progress.habits.stats.trendTitle')}</h3>
          <WidgetInfo text={t('progress.habits.stats.info.trend')} />
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t('progress.habits.stats.trendSub')}</p>
        {data.trend.length === 0 ? (
          // The series now contains only days something was SCHEDULED, so it can be empty
          // — every rule paused, a brand-new user, a stretch entirely marked off. An empty
          // recharts area is a blank box with axes, which reads as broken rather than as
          // "nothing to plot yet".
          <p className="py-10 text-center text-sm text-muted-foreground">{t('progress.habits.stats.noData')}</p>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ top: 6, right: 8, bottom: 0, left: -4 }}>
                <defs>
                  <linearGradient id="habitTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.primary} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: C.axis }}
                  tickFormatter={(v) => v.slice(5)}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fontSize: 10, fill: C.axis }}
                  tickFormatter={(v) => `${Math.round(v * 100)}%`}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: C.grid }} />
                <Area
                  type="monotone"
                  dataKey="ratio"
                  stroke={C.primary}
                  strokeWidth={2}
                  fill="url(#habitTrendGrad)"
                  dot={false}
                  animationDuration={600}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    )
  }

  // section === 'breakdown'
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Per-habit consistency */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{t('progress.habits.stats.consistencyTitle')}</h3>
          <WidgetInfo text={t('progress.habits.stats.info.consistency')} />
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t('progress.habits.stats.consistencySub')}</p>
        {data.habits.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('progress.habits.stats.noData')}</p>
        ) : (
          // Same component as the trading breakdown: avoidance habits are listed under
          // their own "clean rate" heading rather than mixed into one completion list,
          // because "stayed clean 90% of days" and "did it 90% of days" are different
          // measurements and must not be read off one shared scale.
          <ConsistencyList
            items={data.habits.map((h) => ({
              id: h.id,
              name: h.name,
              type: h.type,
              rate: h.rate30,
              tracked: h.tracked30,
              streak: h.streak,
              active: h.active,
            }))}
            constraintTitle={t('progress.habits.stats.avoidTitle')}
            constraintSub={t('progress.habits.stats.avoidSub')}
            taskTitle={t('progress.habits.stats.buildingTitle')}
            taskSub={t('progress.habits.stats.buildingSub')}
            noDataLabel={t('progress.habits.stats.noTrackedDays')}
          />
        )}
      </div>

      <WeekdayBars
        weekday={data.weekday}
        title={t('progress.habits.stats.weekdayTitle')}
        sub={t('progress.habits.stats.weekdaySub')}
        info={t('progress.habits.stats.info.weekday')}
      />
    </div>
  )
}
