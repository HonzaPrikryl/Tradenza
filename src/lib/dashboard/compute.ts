// Pure dashboard aggregation. Extracted from the dashboard server actions so the
// (sizeable) widget computation can be reasoned about and unit-tested without the
// database/auth/runtime — the action just fetches rows and calls buildWidgetData.

import { calcMaxDrawdown, calcProfitFactor, calcWinRate, type DisplayUnit } from '@/lib/utils'
import { t } from '@/i18n'
import { dayKeyInTz, hourInTz, minutesSinceMidnightInTz } from '@/lib/date-tz'
import {
  classifyOutcome,
  classifyMeasure,
  outcomeMeasure,
  outcomeSign,
  tradeNotional,
  multiplierFor,
  type BreakevenConfig,
} from '@/lib/breakeven'
import {
  scoreWinRate,
  scoreProfitFactor,
  scoreAvgWinLoss,
  scoreRecoveryFactor,
  scoreMaxDrawdown,
  scoreConsistency,
} from '@/lib/dashboard/types'
import type {
  DashboardWidgetData,
  KpiData,
  ZellaData,
  DailyPoint,
  BucketPoint,
  SymbolPoint,
} from '@/lib/dashboard/types'

export type Row = {
  netPnl: string | null
  grossPnl: string | null
  fees: string | null
  symbol: string
  entryDatetime: Date
  exitDatetime: Date | null
  entryPrice: string | null
  entryQuantity: string | null
  riskRewardRatio: string | null
  riskAmount: string | null
  extra: unknown
}

const DURATION_BUCKETS: { label: string; max: number }[] = [
  { label: '< 1m', max: 1 },
  { label: '1–5m', max: 5 },
  { label: '5–15m', max: 15 },
  { label: '15–30m', max: 30 },
  { label: '30–60m', max: 60 },
  { label: '1–2h', max: 120 },
  { label: '2–4h', max: 240 },
  { label: '> 4h', max: Infinity },
]

function durationBucketIndex(minutes: number): number {
  for (let i = 0; i < DURATION_BUCKETS.length; i++) {
    if (minutes < DURATION_BUCKETS[i].max) return i
  }
  return DURATION_BUCKETS.length - 1
}

function emptyKpi(): KpiData {
  return {
    netPnl: 0,
    totalTrades: 0,
    tradeWinRate: 0,
    winningTrades: 0,
    losingTrades: 0,
    breakevenTrades: 0,
    grossProfit: 0,
    grossLoss: 0,
    profitFactor: 0,
    dayWinRate: 0,
    winningDays: 0,
    losingDays: 0,
    breakevenDays: 0,
    tradingDays: 0,
    avgWin: 0,
    avgLoss: 0,
    avgWinLossRatio: 0,
    avgRR: 0,
    maxDrawdown: 0,
    expectancy: 0,
    currentStreak: 0,
  }
}

export function buildWidgetData(
  allRows: Row[],
  tz: string | null,
  unit: DisplayUnit,
  cfg: BreakevenConfig | null = null,
): DashboardWidgetData {
  const rows = unit === 'r' ? allRows.filter((r) => Number(r.riskAmount ?? 0) > 0) : allRows
  if (rows.length === 0) {
    return {
      kpi: emptyKpi(),
      zella: { score: 0, axes: [] },
      daily: [],
      timePerformance: [],
      durationPerformance: [],
      timeScatter: [],
      durationScatter: [],
      topSymbols: [],
    }
  }

  const dollarPnls = rows.map((r) => Number(r.netPnl ?? 0))
  const vals =
    unit === 'r'
      ? rows.map((r, i) => {
          const risk = Number(r.riskAmount ?? 0)
          return risk > 0 ? dollarPnls[i] / risk : 0
        })
      : dollarPnls
  // Outcome partition (win / loss / breakeven) honours the configured band.
  const notionals = rows.map((r) =>
    tradeNotional(Number(r.entryPrice ?? 0), Number(r.entryQuantity ?? 0), multiplierFor(r.extra, r.symbol)),
  )
  const outcomes = dollarPnls.map((p, i) => classifyOutcome(p, cfg, notionals[i]))
  const isWin = outcomes.map((o) => o === 'win')
  const isLoss = outcomes.map((o) => o === 'loss')

  const dWins = dollarPnls.filter((_, i) => isWin[i])
  const dLosses = dollarPnls.filter((_, i) => isLoss[i])
  const grossProfitD = dWins.reduce((a, b) => a + b, 0)
  const grossLossD = Math.abs(dLosses.reduce((a, b) => a + b, 0))
  const profitFactor = calcProfitFactor(grossProfitD, grossLossD)
  const totalDollar = dollarPnls.reduce((a, b) => a + b, 0)
  const maxDrawdownD = calcMaxDrawdown(dollarPnls)
  const recoveryFactor = maxDrawdownD > 0 ? totalDollar / maxDrawdownD : totalDollar > 0 ? Infinity : 0
  const dAvgWin = dWins.length ? grossProfitD / dWins.length : 0
  const dAvgLoss = dLosses.length ? dLosses.reduce((a, b) => a + b, 0) / dLosses.length : 0
  const dAvgWinLossRatio = dAvgLoss !== 0 ? dAvgWin / Math.abs(dAvgLoss) : dAvgWin > 0 ? Infinity : 0

  const winsVal = vals.filter((_, i) => isWin[i])
  const lossesVal = vals.filter((_, i) => isLoss[i])
  const totalVal = vals.reduce((a, b) => a + b, 0)
  const avgWin = winsVal.length ? winsVal.reduce((a, b) => a + b, 0) / winsVal.length : 0
  const avgLoss = lossesVal.length ? lossesVal.reduce((a, b) => a + b, 0) / lossesVal.length : 0
  const avgWinLossRatio = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : avgWin > 0 ? Infinity : 0
  const maxDrawdown = calcMaxDrawdown(vals)
  const rrValues = rows.map((r) => Number(r.riskRewardRatio ?? 0)).filter((v) => v > 0)

  let streak = 0
  for (let i = dollarPnls.length - 1; i >= 0; i--) {
    const sign = outcomeSign(outcomes[i])
    if (sign === 0) break
    if (streak === 0) streak = sign
    else if (Math.sign(streak) === sign) streak += sign
    else break
  }

  const byDay = new Map<string, { d: number; v: number; trades: number; measure: number }>()
  for (let i = 0; i < rows.length; i++) {
    const key = dayKeyInTz(rows[i].entryDatetime, tz)
    const e = byDay.get(key) ?? { d: 0, v: 0, trades: 0, measure: 0 }
    e.d += dollarPnls[i]
    e.v += vals[i]
    e.trades += 1
    e.measure += outcomeMeasure(dollarPnls[i], cfg, notionals[i])
    byDay.set(key, e)
  }
  const dayKeys = [...byDay.keys()].sort()
  let cumulative = 0
  const daily: DailyPoint[] = dayKeys.map((date) => {
    const e = byDay.get(date)!
    cumulative += e.v
    return { date, pnl: e.v, cumulative, trades: e.trades }
  })
  const dayDollar = dayKeys.map((k) => byDay.get(k)!.d)
  // Day outcome = summed per-trade measure (P&L in dollar mode, return % in percent
  // mode) classified against the band, so offsetting trades net to breakeven.
  const dayOutcomes = dayKeys.map((k) => classifyMeasure(byDay.get(k)!.measure, cfg))
  const winningDays = dayOutcomes.filter((o) => o === 'win').length
  const losingDays = dayOutcomes.filter((o) => o === 'loss').length
  const breakevenDays = dayKeys.length - winningDays - losingDays
  const dayWinRate = calcWinRate(winningDays, dayKeys.length)
  const positiveDailyPnls = dayDollar.filter((_, i) => dayOutcomes[i] === 'win') // dollar for Zella consistency

  const byHour = new Map<number, { pnl: number; trades: number; wins: number }>()
  const timeScatter: { x: number; pnl: number }[] = []
  for (let i = 0; i < rows.length; i++) {
    const h = hourInTz(rows[i].entryDatetime, tz)
    const e = byHour.get(h) ?? { pnl: 0, trades: 0, wins: 0 }
    e.pnl += vals[i]
    e.trades += 1
    if (isWin[i]) e.wins += 1
    byHour.set(h, e)
    timeScatter.push({ x: minutesSinceMidnightInTz(rows[i].entryDatetime, tz), pnl: vals[i] })
  }
  const timePerformance: BucketPoint[] = [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([h, e]) => ({
      bucket: `${String(h).padStart(2, '0')}:00`,
      order: h,
      pnl: e.pnl,
      trades: e.trades,
      winRate: calcWinRate(e.wins, e.trades),
    }))

  // ── Duration performance + scatter (val) ──
  const byDur = new Map<number, { pnl: number; trades: number; wins: number }>()
  const durationScatter: { x: number; pnl: number }[] = []
  for (let i = 0; i < rows.length; i++) {
    const exit = rows[i].exitDatetime
    if (!exit) continue
    const seconds = (exit.getTime() - rows[i].entryDatetime.getTime()) / 1000
    if (seconds < 0) continue
    const minutes = seconds / 60
    const idx = durationBucketIndex(minutes)
    const e = byDur.get(idx) ?? { pnl: 0, trades: 0, wins: 0 }
    e.pnl += vals[i]
    e.trades += 1
    if (isWin[i]) e.wins += 1
    byDur.set(idx, e)
    durationScatter.push({ x: seconds, pnl: vals[i] })
  }
  timeScatter.sort((a, b) => a.x - b.x)
  durationScatter.sort((a, b) => a.x - b.x)
  const durationPerformance: BucketPoint[] = [...byDur.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, e]) => ({
      bucket: DURATION_BUCKETS[idx].label,
      order: idx,
      pnl: e.pnl,
      trades: e.trades,
      winRate: calcWinRate(e.wins, e.trades),
    }))

  // ── Top symbols (val) ──
  const bySym = new Map<string, { pnl: number; wins: number; total: number }>()
  for (let i = 0; i < rows.length; i++) {
    const e = bySym.get(rows[i].symbol) ?? { pnl: 0, wins: 0, total: 0 }
    e.pnl += vals[i]
    e.total += 1
    if (isWin[i]) e.wins += 1
    bySym.set(rows[i].symbol, e)
  }
  const topSymbols: SymbolPoint[] = [...bySym.entries()]
    .map(([symbol, e]) => ({ symbol, trades: e.total, netPnl: e.pnl, winRate: calcWinRate(e.wins, e.total) }))
    .sort((a, b) => b.netPnl - a.netPnl)
    .slice(0, 8)

  // ── KPI ──
  const kpi: KpiData = {
    netPnl: totalVal,
    totalTrades: rows.length,
    tradeWinRate: calcWinRate(dWins.length, rows.length),
    winningTrades: dWins.length,
    losingTrades: dLosses.length,
    breakevenTrades: rows.length - dWins.length - dLosses.length,
    grossProfit: grossProfitD,
    grossLoss: grossLossD,
    profitFactor,
    dayWinRate,
    winningDays,
    losingDays,
    breakevenDays,
    tradingDays: dayKeys.length,
    avgWin,
    avgLoss,
    avgWinLossRatio,
    avgRR: rrValues.length ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : 0,
    maxDrawdown,
    expectancy: totalVal / rows.length,
    currentStreak: streak,
  }

  const axes = [
    {
      key: 'winRate',
      label: t('dashboard.zella.axes.winRate'),
      raw: kpi.tradeWinRate,
      score: scoreWinRate(kpi.tradeWinRate),
    },
    {
      key: 'profitFactor',
      label: t('dashboard.zella.axes.profitFactor'),
      raw: profitFactor,
      score: scoreProfitFactor(profitFactor),
    },
    {
      key: 'avgWinLoss',
      label: t('dashboard.zella.axes.avgWinLoss'),
      raw: dAvgWinLossRatio,
      score: scoreAvgWinLoss(dAvgWinLossRatio),
    },
    {
      key: 'recoveryFactor',
      label: t('dashboard.zella.axes.recoveryFactor'),
      raw: recoveryFactor,
      score: scoreRecoveryFactor(recoveryFactor),
    },
    {
      key: 'maxDrawdown',
      label: t('dashboard.zella.axes.maxDrawdown'),
      raw: maxDrawdownD,
      score: scoreMaxDrawdown(maxDrawdownD, grossProfitD),
    },
    {
      key: 'consistency',
      label: t('dashboard.zella.axes.consistency'),
      raw: 0,
      score: scoreConsistency(positiveDailyPnls),
    },
  ]
  const zella: ZellaData = {
    score: Math.round(axes.reduce((a, x) => a + x.score, 0) / axes.length),
    axes,
  }

  return { kpi, zella, daily, timePerformance, durationPerformance, timeScatter, durationScatter, topSymbols }
}
