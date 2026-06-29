import { format } from 'date-fns'
import {
  classifyOutcome,
  classifyMeasure,
  outcomeMeasure,
  outcomeSign,
  type BreakevenConfig,
  type Outcome,
} from '@/lib/breakeven'

export type PlType = 'gross' | 'net'

export interface TradeRow {
  netPnl: number
  grossPnl: number
  fees: number
  direction: 'long' | 'short'
  entryDatetime: Date
  exitDatetime: Date | null
  riskAmount: number | null
  riskRewardRatio: number | null
  hasNotes: boolean
  /** Position notional (entry × qty × multiplier) for percent breakeven mode. */
  notional?: number | null
}

export interface MonthStat {
  key: string // "Feb 2026"
  value: number
}

export interface StatsBundle {
  hasData: boolean

  totalTrades: number
  winningTrades: number
  losingTrades: number
  breakEvenTrades: number

  // ── P&L ──
  totalPnl: number
  avgTradePnl: number
  avgWin: number
  avgLoss: number
  largestProfit: number
  largestLoss: number

  // ── Win rate ──
  winPct: number
  longsWinPct: number
  shortsWinPct: number

  profitFactor: number
  tradeExpectancy: number
  avgTradeWinLoss: number

  // ── R-multiple ──
  avgPlannedR: number
  avgRealizedR: number

  // ── Hold time (minutes) ──
  avgHoldAll: number | null
  avgHoldWin: number | null
  avgHoldLoss: number | null
  avgHoldScratch: number | null
  longestTradeDuration: number | null

  maxConsecutiveWins: number
  maxConsecutiveLosses: number

  // ── Fees ──
  totalCommissions: number
  totalFees: number
  totalSwap: number

  // ── Days ──
  tradingDays: number
  winningDays: number
  losingDays: number
  breakevenDays: number
  loggedDays: number
  avgDailyWinPct: number
  avgDailyPnl: number
  avgWinningDayPnl: number
  avgLosingDayPnl: number
  avgDailyWinLoss: number
  avgDailyVolume: number
  largestProfitableDay: number
  largestLosingDay: number
  avgTradingDayDuration: number | null
  maxConsecutiveWinningDays: number
  maxConsecutiveLosingDays: number

  // ── Drawdown ──
  maxDrawdown: number
  maxDrawdownPct: number
  avgDrawdown: number
  avgDrawdownPct: number
  maxDailyDrawdown: number
  avgDailyDrawdown: number

  bestMonth: MonthStat | null
  lowestMonth: MonthStat | null
  avgMonth: number
}

const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0)

function emptyBundle(): StatsBundle {
  return {
    hasData: false,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    breakEvenTrades: 0,
    totalPnl: 0,
    avgTradePnl: 0,
    avgWin: 0,
    avgLoss: 0,
    largestProfit: 0,
    largestLoss: 0,
    winPct: 0,
    longsWinPct: 0,
    shortsWinPct: 0,
    profitFactor: 0,
    tradeExpectancy: 0,
    avgTradeWinLoss: 0,
    avgPlannedR: 0,
    avgRealizedR: 0,
    avgHoldAll: null,
    avgHoldWin: null,
    avgHoldLoss: null,
    avgHoldScratch: null,
    longestTradeDuration: null,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    totalCommissions: 0,
    totalFees: 0,
    totalSwap: 0,
    tradingDays: 0,
    winningDays: 0,
    losingDays: 0,
    breakevenDays: 0,
    loggedDays: 0,
    avgDailyWinPct: 0,
    avgDailyPnl: 0,
    avgWinningDayPnl: 0,
    avgLosingDayPnl: 0,
    avgDailyWinLoss: 0,
    avgDailyVolume: 0,
    largestProfitableDay: 0,
    largestLosingDay: 0,
    avgTradingDayDuration: null,
    maxConsecutiveWinningDays: 0,
    maxConsecutiveLosingDays: 0,
    maxDrawdown: 0,
    maxDrawdownPct: 0,
    avgDrawdown: 0,
    avgDrawdownPct: 0,
    maxDailyDrawdown: 0,
    avgDailyDrawdown: 0,
    bestMonth: null,
    lowestMonth: null,
    avgMonth: 0,
  }
}

function durationMinutes(r: TradeRow): number | null {
  if (!r.exitDatetime) return null
  const ms = r.exitDatetime.getTime() - r.entryDatetime.getTime()
  return ms >= 0 ? ms / 60000 : null
}

function streaks(signs: number[]): { wins: number; losses: number } {
  let wins = 0,
    losses = 0,
    curW = 0,
    curL = 0
  for (const s of signs) {
    if (s > 0) {
      curW++
      curL = 0
    } else if (s < 0) {
      curL++
      curW = 0
    } else {
      curW = 0
      curL = 0
    }
    if (curW > wins) wins = curW
    if (curL > losses) losses = curL
  }
  return { wins, losses }
}

function equityDrawdown(dailyPnls: number[]): { maxDD: number; maxDDPct: number; avgDD: number; avgDDPct: number } {
  let peak = 0,
    cum = 0,
    maxDD = 0,
    maxDDPct = 0
  const dds: number[] = []
  const ddPcts: number[] = []
  for (const p of dailyPnls) {
    cum += p
    if (cum > peak) peak = cum
    const dd = peak - cum // >= 0
    dds.push(dd)
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0
    ddPcts.push(ddPct)
    if (dd > maxDD) maxDD = dd
    if (ddPct > maxDDPct) maxDDPct = ddPct
  }
  return {
    maxDD: -maxDD,
    maxDDPct: -maxDDPct,
    avgDD: -mean(dds),
    avgDDPct: -mean(ddPcts),
  }
}

export function computeBundle(rows: TradeRow[], plType: PlType, cfg: BreakevenConfig | null = null): StatsBundle {
  if (rows.length === 0) return emptyBundle()

  const pnlOf = (r: TradeRow) => (plType === 'gross' ? r.grossPnl : r.netPnl)

  const sorted = [...rows].sort((a, b) => a.entryDatetime.getTime() - b.entryDatetime.getTime())

  const pnls = sorted.map(pnlOf)
  // Win / loss / breakeven partition honours the configured breakeven band.
  const outcomes: Outcome[] = sorted.map((r, i) => classifyOutcome(pnls[i], cfg, r.notional))
  const wins = pnls.filter((_, i) => outcomes[i] === 'win')
  const losses = pnls.filter((_, i) => outcomes[i] === 'loss')
  const scratches = pnls.filter((_, i) => outcomes[i] === 'breakeven')

  const totalPnl = sum(pnls)
  const grossProfit = sum(wins)
  const grossLoss = Math.abs(sum(losses))

  let longWin = 0,
    longDecisive = 0,
    shortWin = 0,
    shortDecisive = 0
  // Hold times
  const durAll: number[] = [],
    durWin: number[] = [],
    durLoss: number[] = [],
    durScratch: number[] = []
  let longest: number | null = null
  // R-multiple
  const plannedRs: number[] = [],
    realizedRs: number[] = []

  sorted.forEach((r, i) => {
    const p = pnls[i]
    const oc = outcomes[i]
    if (r.direction === 'long') {
      if (oc === 'win') longWin++
      if (oc !== 'breakeven') longDecisive++
    } else {
      if (oc === 'win') shortWin++
      if (oc !== 'breakeven') shortDecisive++
    }
    const d = durationMinutes(r)
    if (d !== null) {
      durAll.push(d)
      if (oc === 'win') durWin.push(d)
      else if (oc === 'loss') durLoss.push(d)
      else durScratch.push(d)
      if (longest === null || d > longest) longest = d
    }
    if (r.riskRewardRatio !== null && r.riskRewardRatio > 0) plannedRs.push(r.riskRewardRatio)
    if (r.riskAmount !== null && r.riskAmount > 0) realizedRs.push(p / r.riskAmount)
  })

  const decisive = wins.length + losses.length
  const winPct = decisive ? (wins.length / decisive) * 100 : 0
  const avgWin = wins.length ? mean(wins) : 0
  const avgLoss = losses.length ? mean(losses) : 0
  const pWin = decisive ? wins.length / decisive : 0
  const tradeExpectancy = pWin * avgWin + (1 - pWin) * avgLoss
  const avgTradeWinLoss = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : avgWin > 0 ? Infinity : 0

  const { wins: maxConsecutiveWins, losses: maxConsecutiveLosses } = streaks(outcomes.map(outcomeSign))

  // ── Aggregate by day ──
  const dayMap = new Map<
    string,
    {
      pnl: number
      measure: number
      trades: number
      minEntry: number
      maxExit: number
      logged: boolean
      intraday: number[]
    }
  >()
  for (const r of sorted) {
    const key = format(r.entryDatetime, 'yyyy-MM-dd')
    const p = pnlOf(r)
    const entryMs = r.entryDatetime.getTime()
    const exitMs = (r.exitDatetime ?? r.entryDatetime).getTime()
    const d = dayMap.get(key) ?? {
      pnl: 0,
      measure: 0,
      trades: 0,
      minEntry: entryMs,
      maxExit: exitMs,
      logged: false,
      intraday: [],
    }
    d.pnl += p
    d.measure += outcomeMeasure(p, cfg, r.notional)
    d.trades += 1
    d.minEntry = Math.min(d.minEntry, entryMs)
    d.maxExit = Math.max(d.maxExit, exitMs)
    d.logged = d.logged || r.hasNotes
    d.intraday.push(p)
    dayMap.set(key, d)
  }

  const dayKeys = Array.from(dayMap.keys()).sort()
  const days = dayKeys.map((k) => dayMap.get(k)!)
  const dayPnls = days.map((d) => d.pnl)
  // The day's outcome is its summed per-trade measure classified against the band:
  // dollar mode sums P&L (= net), percent mode sums each trade's return %. This lets
  // a +1R/−1R day net to breakeven while a day with a genuine winner stays a win.
  const dayOutcomes: Outcome[] = days.map((d) => classifyMeasure(d.measure, cfg))
  const winningDays = dayPnls.filter((_, i) => dayOutcomes[i] === 'win')
  const losingDays = dayPnls.filter((_, i) => dayOutcomes[i] === 'loss')
  const breakevenDays = dayPnls.filter((_, i) => dayOutcomes[i] === 'breakeven')
  const decisiveDays = winningDays.length + losingDays.length

  const avgWinningDayPnl = winningDays.length ? mean(winningDays) : 0
  const avgLosingDayPnl = losingDays.length ? mean(losingDays) : 0
  const avgDailyWinLoss =
    avgLosingDayPnl !== 0 ? avgWinningDayPnl / Math.abs(avgLosingDayPnl) : avgWinningDayPnl > 0 ? Infinity : 0

  const dayDurations = days.map((d) => (d.maxExit - d.minEntry) / 60000).filter((m) => m >= 0)

  const dayStreaks = streaks(dayOutcomes.map(outcomeSign))

  const intradayDDs = days.map((d) => {
    let peak = 0,
      cum = 0,
      dd = 0
    for (const p of d.intraday) {
      cum += p
      if (cum > peak) peak = cum
      const cur = peak - cum
      if (cur > dd) dd = cur
    }
    return dd
  })

  const eq = equityDrawdown(dayPnls)

  const monthMap = new Map<string, number>()
  for (const r of sorted) {
    const key = format(r.entryDatetime, 'MMM yyyy')
    monthMap.set(key, (monthMap.get(key) ?? 0) + pnlOf(r))
  }
  const monthEntries = Array.from(monthMap.entries()).map(([key, value]) => ({ key, value }))
  let bestMonth: MonthStat | null = null
  let lowestMonth: MonthStat | null = null
  for (const m of monthEntries) {
    if (!bestMonth || m.value > bestMonth.value) bestMonth = m
    if (!lowestMonth || m.value < lowestMonth.value) lowestMonth = m
  }
  const avgMonth = monthEntries.length ? mean(monthEntries.map((m) => m.value)) : 0

  return {
    hasData: true,
    totalTrades: sorted.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    breakEvenTrades: scratches.length,

    totalPnl,
    avgTradePnl: totalPnl / sorted.length,
    avgWin,
    avgLoss,
    largestProfit: wins.length ? Math.max(...wins) : 0,
    largestLoss: losses.length ? Math.min(...losses) : 0,

    winPct,
    longsWinPct: longDecisive ? (longWin / longDecisive) * 100 : 0,
    shortsWinPct: shortDecisive ? (shortWin / shortDecisive) * 100 : 0,

    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss,
    tradeExpectancy,
    avgTradeWinLoss,

    avgPlannedR: plannedRs.length ? mean(plannedRs) : 0,
    avgRealizedR: realizedRs.length ? mean(realizedRs) : 0,

    avgHoldAll: durAll.length ? mean(durAll) : null,
    avgHoldWin: durWin.length ? mean(durWin) : null,
    avgHoldLoss: durLoss.length ? mean(durLoss) : null,
    avgHoldScratch: durScratch.length ? mean(durScratch) : null,
    longestTradeDuration: longest,

    maxConsecutiveWins,
    maxConsecutiveLosses,

    totalCommissions: 0,
    totalFees: sum(sorted.map((r) => r.fees)),
    totalSwap: 0,

    tradingDays: days.length,
    winningDays: winningDays.length,
    losingDays: losingDays.length,
    breakevenDays: breakevenDays.length,
    loggedDays: days.filter((d) => d.logged).length,
    avgDailyWinPct: decisiveDays ? (winningDays.length / decisiveDays) * 100 : 0,
    avgDailyPnl: mean(dayPnls),
    avgWinningDayPnl,
    avgLosingDayPnl,
    avgDailyWinLoss,
    avgDailyVolume: days.length ? sorted.length / days.length : 0,
    largestProfitableDay: dayPnls.length ? Math.max(...dayPnls) : 0,
    largestLosingDay: dayPnls.length ? Math.min(...dayPnls) : 0,
    avgTradingDayDuration: dayDurations.length ? mean(dayDurations) : null,
    maxConsecutiveWinningDays: dayStreaks.wins,
    maxConsecutiveLosingDays: dayStreaks.losses,

    maxDrawdown: eq.maxDD,
    maxDrawdownPct: eq.maxDDPct,
    avgDrawdown: eq.avgDD,
    avgDrawdownPct: eq.avgDDPct,
    maxDailyDrawdown: eq.maxDD,
    avgDailyDrawdown: intradayDDs.length ? -mean(intradayDDs) : 0,

    bestMonth,
    lowestMonth,
    avgMonth,
  }
}
