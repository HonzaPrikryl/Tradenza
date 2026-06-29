'use client'

import { memo } from 'react'
import { Bar, BarChart, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { formatUnit, axisUnit, formatDate } from '@/lib/utils'
import { t } from '@/i18n'
import { useDashboardData } from '../DashboardDataContext'
import { WidgetShell, WidgetEmpty, useChartColors, makeTooltipStyle, useMounted, ChartSkeleton } from './shared'

function NetDailyPnlWidget() {
  const { data, currency, unit, editing } = useDashboardData()
  const CHART = useChartColors()
  const mounted = useMounted()
  const series = data.daily

  return (
    <WidgetShell
      title={t('dashboard.widgets.net-daily-pnl.label')}
      icon={<BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />}
      className="h-full min-h-[20rem]"
      bodyClassName="flex flex-col px-2 pb-2"
    >
      {series.length === 0 ? (
        <WidgetEmpty label={t('dashboard.noData')} />
      ) : (
        <div className="flex-1 min-h-0">
          {!mounted ? (
            <ChartSkeleton />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: CHART.axis }}
                  tickFormatter={(v) => v.slice(5)}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: CHART.axis }}
                  tickFormatter={(v) => axisUnit(v, unit)}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <ReferenceLine y={0} stroke={CHART.axis} strokeOpacity={0.3} />
                <Tooltip
                  cursor={{ fill: CHART.grid, fillOpacity: 0.4 }}
                  contentStyle={makeTooltipStyle(CHART)}
                  itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  formatter={(v: number) => [formatUnit(v, unit, currency), t('dashboard.seriesNetPnl')]}
                  labelFormatter={(l) => formatDate(l)}
                />
                <Bar
                  dataKey="pnl"
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={!editing}
                  animationDuration={650}
                  maxBarSize={28}
                >
                  {series.map((d, i) => (
                    <Cell key={i} fill={d.pnl >= 0 ? CHART.profit : CHART.loss} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </WidgetShell>
  )
}

export default memo(NetDailyPnlWidget)
