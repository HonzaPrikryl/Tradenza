'use client'

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartColors, makeTooltipStyle } from '@/components/dashboard/widgets/shared'
import { formatCurrency } from '@/lib/utils'

// Cumulative net-P&L (equity) curve for a single strategy.
export default function StrategyEquityChart({ data }: { data: { i: number; value: number }[] }) {
  const c = useChartColors()
  const positive = (data.at(-1)?.value ?? 0) >= 0
  const stroke = positive ? c.profit : c.loss

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="strategy-equity" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="i" hide />
        <YAxis stroke={c.axis} fontSize={11} width={72} tickFormatter={(v) => formatCurrency(Number(v))} />
        <ReferenceLine y={0} stroke={c.axis} strokeDasharray="2 2" />
        <Tooltip
          contentStyle={makeTooltipStyle(c)}
          formatter={(v: number) => [formatCurrency(v), 'Cumulative']}
          labelFormatter={() => ''}
        />
        <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} fill="url(#strategy-equity)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
