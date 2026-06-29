'use client'

import { memo } from 'react'
import {
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Clock, Timer } from 'lucide-react'
import { formatUnit, axisUnit } from '@/lib/utils'
import { t } from '@/i18n'
import type { ScatterPoint, WidgetInstance } from '@/lib/dashboard/types'
import { useDashboardData } from '../DashboardDataContext'
import { WidgetShell, WidgetEmpty, useChartColors, makeTooltipStyle, useMounted, ChartSkeleton } from './shared'

function minutesToHHMM(m: number) {
  const h = Math.floor(m / 60)
  const mm = Math.floor(m % 60)
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function secondsToDur(s: number) {
  if (s < 60) return `${Math.round(s)}s`
  const h = Math.floor(s / 3600)
  if (h >= 1) {
    const m = Math.round((s % 3600) / 60)
    return `${h}h${m}m`
  }
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}m${sec}s`
}

function fmtX(v: number, isDuration: boolean) {
  return isDuration ? secondsToDur(v) : minutesToHHMM(v)
}

function PerformanceWidget({ instance }: { instance: WidgetInstance }) {
  const { data, currency, unit } = useDashboardData()
  const CHART = useChartColors()
  const mounted = useMounted()
  const isDuration = instance.type === 'duration-performance'
  const points: ScatterPoint[] = isDuration ? data.durationScatter : data.timeScatter
  const title = isDuration
    ? t('dashboard.widgets.duration-performance.label')
    : t('dashboard.widgets.time-performance.label')
  const Icon = isDuration ? Timer : Clock

  function PointTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScatterPoint }[] }) {
    if (!active || !payload?.length) return null
    const p = payload[0].payload
    return (
      <div style={makeTooltipStyle(CHART)}>
        <div className="font-medium mb-0.5">{fmtX(p.x, isDuration)}</div>
        <div className={p.pnl >= 0 ? 'text-profit' : 'text-loss'}>{formatUnit(p.pnl, unit, currency)}</div>
      </div>
    )
  }

  const renderDot = (props: { cx?: number; cy?: number; payload?: ScatterPoint }) => {
    const { cx, cy, payload } = props
    if (cx == null || cy == null || !payload) return <g />
    const fill = payload.pnl >= 0 ? CHART.profit : CHART.loss
    return (
      <g>
        <circle cx={cx} cy={cy} r={13} fill="transparent" />
        <circle cx={cx} cy={cy} r={4} fill={fill} fillOpacity={0.9} />
      </g>
    )
  }

  return (
    <WidgetShell
      title={title}
      icon={<Icon className="w-3.5 h-3.5 text-muted-foreground" />}
      bodyClassName="flex flex-col px-2 pb-2"
      className="h-full min-h-[20rem]"
    >
      {points.length === 0 ? (
        <WidgetEmpty label={t('dashboard.noData')} />
      ) : (
        <div className="flex-1 min-h-[160px]">
          {!mounted ? (
            <ChartSkeleton />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={['dataMin', 'dataMax']}
                  tick={{ fontSize: 10, fill: CHART.axis }}
                  tickFormatter={(v) => fmtX(v, isDuration)}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  type="number"
                  dataKey="pnl"
                  tick={{ fontSize: 10, fill: CHART.axis }}
                  tickFormatter={(v) => axisUnit(v, unit)}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <ReferenceLine y={0} stroke={CHART.axis} strokeOpacity={0.3} />
                <Tooltip cursor={false} content={<PointTooltip />} isAnimationActive={false} />
                <Scatter data={points} shape={renderDot} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </WidgetShell>
  )
}

export default memo(PerformanceWidget)
