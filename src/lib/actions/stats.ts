'use server'

import { db, trades } from '@/lib/db'
import { eq, and, gte, lte, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { calcMaxDrawdown, calcProfitFactor, calcWinRate } from '@/lib/utils'
import type { DashboardStats, PnlDataPoint, SymbolStats, StatsData } from '@/types'
import { readGlobalFilters } from '@/lib/global-filters'
import { readGlobalSettings } from '@/lib/global-settings'
import { generalConditions } from './filter-sql'
import { computeBundle, type TradeRow } from '@/lib/stats-compute'
import { classifyOutcome, tradeNotional, multiplierFor, outcomeSign } from '@/lib/breakeven'
import { getDemoTrades } from '@/lib/demo/trades'
import { userHasTrades } from '@/lib/demo/detect'
import { format } from 'date-fns'
import { authedAction } from '@/lib/safe-action'

async function globalConditions(): Promise<SQL[]> {
  const gf = await readGlobalFilters()
  const { breakeven } = await readGlobalSettings()
  return generalConditions(gf, { includeStatus: false, breakeven })
}

// ─── Dashboard statistics ─────────────────────────────────────────────────────

export const getDashboardStats = authedAction(
  [z.date().optional(), z.date().optional()],
  async ({ userId }, dateFrom, dateTo): Promise<DashboardStats> => {
    const conditions = [eq(trades.userId, userId), eq(trades.status, 'closed'), ...(await globalConditions())]
    if (dateFrom) conditions.push(gte(trades.entryDatetime, dateFrom))
    if (dateTo) conditions.push(lte(trades.entryDatetime, dateTo))

    const cfg = (await readGlobalSettings()).breakeven

    const rows = (await userHasTrades(userId))
      ? await db.query.trades.findMany({
          where: and(...conditions),
          columns: {
            netPnl: true,
            grossPnl: true,
            fees: true,
            riskRewardRatio: true,
            symbol: true,
            entryPrice: true,
            entryQuantity: true,
            extra: true,
          },
        })
      : getDemoTrades()

    if (rows.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalNetPnl: 0,
        totalGrossPnl: 0,
        totalFees: 0,
        avgNetPnl: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        avgRR: 0,
        maxWin: 0,
        maxLoss: 0,
        maxDrawdown: 0,
        currentStreak: 0,
        bestSymbol: null,
      }
    }

    const pnls = rows.map((r) => Number(r.netPnl ?? 0))
    const notionals = rows.map((r) =>
      tradeNotional(Number(r.entryPrice ?? 0), Number(r.entryQuantity ?? 0), multiplierFor(r.extra, r.symbol)),
    )
    const outcomes = pnls.map((p, i) => classifyOutcome(p, cfg, notionals[i]))
    const wins = pnls.filter((_, i) => outcomes[i] === 'win')
    const losses = pnls.filter((_, i) => outcomes[i] === 'loss')

    const totalNetPnl = pnls.reduce((a, b) => a + b, 0)
    const totalGrossPnl = rows.reduce((a, r) => a + Number(r.grossPnl ?? 0), 0)
    const totalFees = rows.reduce((a, r) => a + Number(r.fees ?? 0), 0)

    const grossProfit = wins.reduce((a, b) => a + b, 0)
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0))

    let streak = 0
    const signs = [...outcomes].reverse().map(outcomeSign)
    if (signs.length > 0 && signs[0] !== 0) {
      const sign = signs[0]
      for (const s of signs) {
        if (s === sign) streak++
        else break
      }
      if (sign === -1) streak = -streak
    }

    // Best symbol
    const symbolMap = new Map<string, number>()
    for (let i = 0; i < rows.length; i++) {
      const sym = rows[i].symbol
      symbolMap.set(sym, (symbolMap.get(sym) ?? 0) + pnls[i])
    }
    let bestSymbol: string | null = null
    let bestSymbolPnl = -Infinity
    for (const [sym, pnl] of symbolMap) {
      if (pnl > bestSymbolPnl) {
        bestSymbol = sym
        bestSymbolPnl = pnl
      }
    }

    const rrValues = rows.map((r) => Number(r.riskRewardRatio ?? 0)).filter((v) => v > 0)

    return {
      totalTrades: rows.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: calcWinRate(wins.length, rows.length),
      totalNetPnl,
      totalGrossPnl,
      totalFees,
      avgNetPnl: totalNetPnl / rows.length,
      avgWin: wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0,
      avgLoss: losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0,
      profitFactor: calcProfitFactor(grossProfit, grossLoss),
      avgRR: rrValues.length ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : 0,
      maxWin: wins.length ? Math.max(...wins) : 0,
      maxLoss: losses.length ? Math.min(...losses) : 0,
      maxDrawdown: calcMaxDrawdown(pnls),
      currentStreak: streak,
      bestSymbol,
    }
  },
)

export const getPnlCurve = authedAction(
  [z.date().optional(), z.date().optional()],
  async ({ userId }, dateFrom, dateTo): Promise<PnlDataPoint[]> => {
    const conditions = [eq(trades.userId, userId), eq(trades.status, 'closed'), ...(await globalConditions())]
    if (dateFrom) conditions.push(gte(trades.entryDatetime, dateFrom))
    if (dateTo) conditions.push(lte(trades.entryDatetime, dateTo))

    const rows = (await userHasTrades(userId))
      ? await db.query.trades.findMany({
          where: and(...conditions),
          columns: { entryDatetime: true, netPnl: true },
          orderBy: (t, { asc }) => [asc(t.entryDatetime)],
        })
      : getDemoTrades()

    // Aggregate by day
    const byDay = new Map<string, { pnl: number; trades: number }>()
    for (const row of rows) {
      const key = format(row.entryDatetime, 'yyyy-MM-dd')
      const existing = byDay.get(key) ?? { pnl: 0, trades: 0 }
      byDay.set(key, {
        pnl: existing.pnl + Number(row.netPnl ?? 0),
        trades: existing.trades + 1,
      })
    }

    let cumulative = 0
    const result: PnlDataPoint[] = []
    for (const [date, { pnl, trades }] of byDay) {
      cumulative += pnl
      result.push({ date, pnl, cumulative, trades })
    }

    return result
  },
)

// ─── Stats per symbol ─────────────────────────────────────────────────────────

export const getSymbolStats = authedAction([], async ({ userId }): Promise<SymbolStats[]> => {
  const rows = await db.query.trades.findMany({
    where: and(eq(trades.userId, userId), eq(trades.status, 'closed'), ...(await globalConditions())),
    columns: { symbol: true, netPnl: true },
  })

  const map = new Map<string, { pnl: number; wins: number; total: number }>()
  for (const row of rows) {
    const pnl = Number(row.netPnl ?? 0)
    const existing = map.get(row.symbol) ?? { pnl: 0, wins: 0, total: 0 }
    map.set(row.symbol, {
      pnl: existing.pnl + pnl,
      wins: existing.wins + (pnl > 0 ? 1 : 0),
      total: existing.total + 1,
    })
  }

  return Array.from(map.entries())
    .map(([symbol, { pnl, wins, total }]) => ({
      symbol,
      trades: total,
      netPnl: pnl,
      winRate: calcWinRate(wins, total),
    }))
    .sort((a, b) => b.netPnl - a.netPnl)
    .slice(0, 10)
})

export const getTradeStats = authedAction([], async ({ userId }): Promise<StatsData> => {
  const gf = await readGlobalFilters()
  const cfg = (await readGlobalSettings()).breakeven

  const baseConditions = [eq(trades.userId, userId), ...generalConditions(gf, { includeStatus: false, breakeven: cfg })]

  const demo = !(await userHasTrades(userId))

  const rows = demo
    ? getDemoTrades()
    : await db.query.trades.findMany({
        where: and(eq(trades.status, 'closed'), ...baseConditions),
        columns: {
          netPnl: true,
          grossPnl: true,
          fees: true,
          direction: true,
          entryDatetime: true,
          exitDatetime: true,
          riskAmount: true,
          riskRewardRatio: true,
          notes: true,
          symbol: true,
          entryPrice: true,
          entryQuantity: true,
          extra: true,
        },
      })

  const openTrades = demo
    ? 0
    : ((
        await db
          .select({ c: sql<number>`count(*)::int` })
          .from(trades)
          .where(and(eq(trades.status, 'open'), ...baseConditions))
      )[0]?.c ?? 0)

  const mapped: TradeRow[] = rows.map((r) => ({
    netPnl: Number(r.netPnl ?? 0),
    grossPnl: Number(r.grossPnl ?? 0),
    fees: Number(r.fees ?? 0),
    direction: r.direction,
    entryDatetime: r.entryDatetime,
    exitDatetime: r.exitDatetime ?? null,
    riskAmount: r.riskAmount !== null && r.riskAmount !== undefined ? Number(r.riskAmount) : null,
    riskRewardRatio: r.riskRewardRatio !== null && r.riskRewardRatio !== undefined ? Number(r.riskRewardRatio) : null,
    hasNotes: typeof r.notes === 'string' && r.notes.trim().length > 0,
    notional: tradeNotional(Number(r.entryPrice ?? 0), Number(r.entryQuantity ?? 0), multiplierFor(r.extra, r.symbol)),
  }))

  const dateRangeLabel =
    gf.dateFrom || gf.dateTo
      ? `${gf.dateFrom ? format(new Date(gf.dateFrom), 'd MMM yyyy') : '…'} – ${gf.dateTo ? format(new Date(gf.dateTo), 'd MMM yyyy') : '…'}`
      : null

  return {
    gross: computeBundle(mapped, 'gross', cfg),
    net: computeBundle(mapped, 'net', cfg),
    openTrades,
    dateRangeLabel,
    currency: 'USD',
  }
})
