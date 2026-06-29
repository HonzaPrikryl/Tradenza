'use client'

import { memo } from 'react'
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { formatUnit, axisUnit, formatDate } from '@/lib/utils'
import { t } from '@/i18n'
import { useDashboardData } from '../DashboardDataContext'
import { WidgetShell, WidgetEmpty, useChartColors, makeTooltipStyle, useMounted, ChartSkeleton } from './shared'

function CumulativePnlWidget() {
  const { data, currency, unit, editing } = useDashboardData()
  const CHART = useChartColors()
  const mounted = useMounted()
  const series = data.daily
  const last = series.length ? series[series.length - 1].cumulative : 0
  const color = last >= 0 ? CHART.profit : CHART.loss

  return (
    <WidgetShell
      title={t('dashboard.widgets.cumulative-pnl.label')}
      icon={<TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />}
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
              <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  contentStyle={makeTooltipStyle(CHART)}
                  itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  formatter={(v: number) => [formatUnit(v, unit, currency), t('dashboard.seriesCumulative')]}
                  labelFormatter={(l) => formatDate(l)}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke={color}
                  strokeWidth={1.75}
                  fill="url(#cumGrad)"
                  dot={false}
                  isAnimationActive={!editing}
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </WidgetShell>
  )
}

export default memo(CumulativePnlWidget)
