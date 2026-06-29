'use client'

import { memo } from 'react'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'
import { Gauge } from 'lucide-react'
import { t } from '@/i18n'
import { useDashboardData } from '../DashboardDataContext'
import { WidgetShell, WidgetEmpty, useCountUp, useChartColors, useMounted, ChartSkeleton } from './shared'

const GRADIENT =
  'linear-gradient(90deg, hsl(0 72% 55%), hsl(38 92% 55%), hsl(60 90% 55%), hsl(120 60% 50%), hsl(158 64% 52%))'

function ZellaScoreWidget() {
  const { data, editing } = useDashboardData()
  const c = useChartColors()
  const mounted = useMounted()
  const z = data.zella
  const animatedScore = useCountUp(z.score)
  const animated = editing ? z.score : animatedScore
  const empty = data.kpi.totalTrades === 0
  const score = Math.max(0, Math.min(100, z.score))
  const radarData = z.axes.map((a) => ({ ...a, l20: 20, l40: 40, l60: 60, l80: 80, l100: 100 }))

  return (
    <WidgetShell
      title={t('dashboard.widgets.zella-score.label')}
      icon={<Gauge className="w-3.5 h-3.5 text-muted-foreground" />}
      bodyClassName="flex flex-col px-2 pb-3"
      className="h-full min-h-[20rem]"
    >
      {empty ? (
        <WidgetEmpty label={t('dashboard.noData')} />
      ) : (
        <>
          <div className="flex-1 min-h-[180px] [pointer-events:none] select-none">
            {!mounted ? (
              <ChartSkeleton />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="84%" margin={{ top: 14, right: 44, bottom: 14, left: 44 }}>
                  <PolarRadiusAxis domain={[0, 100]} tickCount={6} tick={false} axisLine={false} />
                  {(
                    [
                      ['l100', c.bandA],
                      ['l80', c.bandB],
                      ['l60', c.bandA],
                      ['l40', c.bandB],
                      ['l20', c.bandA],
                    ] as const
                  ).map(([key, color]) => (
                    <Radar
                      key={key}
                      dataKey={key}
                      fill={color}
                      fillOpacity={1}
                      stroke="none"
                      isAnimationActive={false}
                      dot={false}
                    />
                  ))}
                  <PolarGrid stroke={c.radarGrid} gridType="polygon" />
                  <PolarAngleAxis dataKey="label" tick={{ fontSize: 11.5, fill: c.axis }} />
                  <Radar
                    dataKey="score"
                    stroke={c.purple}
                    fill={c.purple}
                    fillOpacity={0.3}
                    strokeWidth={1.75}
                    isAnimationActive={!editing}
                    animationBegin={120}
                    animationDuration={900}
                    animationEasing="ease-out"
                    dot={{ r: 2, fill: c.purple, stroke: c.purple, strokeWidth: 1.5 }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mx-1 border-t border-border/60" />

          <div className="flex items-center gap-3 px-2 pt-3">
            <div className="shrink-0">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('dashboard.widgets.zella-score.label')}
              </div>
              <div className="text-2xl font-bold tabular leading-tight">{Math.round(animated)}</div>
            </div>

            <div className="w-px self-stretch bg-border/60" />

            <div className="flex-1 min-w-0">
              <div className="relative h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 overflow-hidden rounded-full transition-all duration-700"
                  style={{ width: `${score}%` }}
                >
                  <div
                    className="h-full"
                    style={{ width: `${score > 0 ? 10000 / score : 0}%`, background: GRADIENT }}
                  />
                </div>
              </div>
              <div className="mt-1 flex justify-between text-[9px] text-muted-foreground tabular">
                {[0, 20, 40, 60, 80, 100].map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </WidgetShell>
  )
}

export default memo(ZellaScoreWidget)
