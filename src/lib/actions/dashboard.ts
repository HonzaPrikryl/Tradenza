'use server'

import { db, trades, dashboardTemplates } from '@/lib/db'
import { eq, and, asc } from 'drizzle-orm'
import { calcProfitFactor, calcWinRate } from '@/lib/utils'
import { readGlobalFilters } from '@/lib/global-filters'
import { readGlobalSettings } from '@/lib/global-settings'
import { generalConditions } from './filter-sql'
import { validateLayout } from '@/lib/dashboard/types'
import type {
  DashboardWidgetData,
  CalendarData,
  CalendarDay,
  CalendarWeek,
  DashboardLayout,
  DashboardTemplateDTO,
  DayDetail,
  DayTrade,
  IntradayPoint,
} from '@/lib/dashboard/types'
import { DEFAULT_LAYOUT, PRESET_TEMPLATES } from '@/lib/dashboard/default-template'
import { buildWidgetData } from '@/lib/dashboard/compute'
import { getDemoTrades } from '@/lib/demo/trades'
import { userHasTrades } from '@/lib/demo/detect'
import { dayKeyInTz, timeLabelInTz } from '@/lib/date-tz'
import { classifyOutcome, classifyMeasure, outcomeMeasure, tradeNotional, multiplierFor } from '@/lib/breakeven'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { uuid, dateKey, year as yearSchema, month as monthSchema } from '@/lib/validation'
import { authedAction } from '@/lib/safe-action'

async function globalConditions() {
  const gf = await readGlobalFilters()
  const { breakeven } = await readGlobalSettings()
  return generalConditions(gf, { includeStatus: false, breakeven })
}

export const getDashboardWidgetData = authedAction([], async ({ userId }): Promise<DashboardWidgetData> => {
  const { timezone, breakeven } = await readGlobalSettings()
  const unit = (await readGlobalFilters()).unit

  // Brand-new users (no trades yet) see a sample dashboard instead of zeros.
  if (!(await userHasTrades(userId))) {
    return buildWidgetData(getDemoTrades(), timezone, unit, breakeven)
  }

  const rows = await db.query.trades.findMany({
    where: and(eq(trades.userId, userId), eq(trades.status, 'closed'), ...(await globalConditions())),
    columns: {
      netPnl: true,
      grossPnl: true,
      fees: true,
      symbol: true,
      entryDatetime: true,
      exitDatetime: true,
      entryPrice: true,
      entryQuantity: true,
      riskRewardRatio: true,
      riskAmount: true,
      extra: true,
    },
    orderBy: (t, { asc }) => [asc(t.entryDatetime)],
  })

  return buildWidgetData(rows, timezone, unit, breakeven)
})

export const getCalendarData = authedAction(
  [yearSchema, monthSchema],
  async ({ userId }, year, month): Promise<CalendarData> => {
    const { timezone, breakeven } = await readGlobalSettings()
    const unit = (await readGlobalFilters()).unit

    const rows = (await userHasTrades(userId))
      ? await db.query.trades.findMany({
          where: and(eq(trades.userId, userId), eq(trades.status, 'closed'), ...(await globalConditions())),
          columns: {
            netPnl: true,
            entryDatetime: true,
            riskAmount: true,
            symbol: true,
            entryPrice: true,
            entryQuantity: true,
            extra: true,
          },
        })
      : getDemoTrades()

    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const byDay = new Map<
      string,
      { pnl: number; measure: number; trades: number; wins: number; losses: number; rMultiple: number }
    >()
    for (const r of rows) {
      const key = dayKeyInTz(r.entryDatetime, timezone)
      if (!key.startsWith(prefix)) continue
      const pnl = Number(r.netPnl ?? 0)
      const risk = Number(r.riskAmount ?? 0)
      if (unit === 'r' && !(risk > 0)) continue
      // Per-trade win/loss counts honour the breakeven band…
      const notional = tradeNotional(
        Number(r.entryPrice ?? 0),
        Number(r.entryQuantity ?? 0),
        multiplierFor(r.extra, r.symbol),
      )
      const oc = classifyOutcome(pnl, breakeven, notional)
      const e = byDay.get(key) ?? { pnl: 0, measure: 0, trades: 0, wins: 0, losses: 0, rMultiple: 0 }
      e.pnl += pnl
      e.measure += outcomeMeasure(pnl, breakeven, notional)
      e.trades += 1
      if (oc === 'win') e.wins += 1
      else if (oc === 'loss') e.losses += 1
      if (risk > 0) e.rMultiple += pnl / risk
      byDay.set(key, e)
    }

    const days: CalendarDay[] = [...byDay.entries()]
      .map(([date, e]) => ({
        date,
        netPnl: unit === 'r' ? e.rMultiple : e.pnl,
        trades: e.trades,
        wins: e.wins,
        losses: e.losses,
        winRate: calcWinRate(e.wins, e.wins + e.losses),
        rMultiple: e.rMultiple,
        // …and the tile colour reflects the day's net outcome (offsetting trades → breakeven).
        outcome: classifyMeasure(e.measure, breakeven),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const first = new Date(Date.UTC(year, month - 1, 1))
    const startDow = first.getUTCDay()
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const weeks: CalendarWeek[] = []
    const dayMap = new Map(days.map((d) => [d.date, d]))
    let weekIndex = 0
    let cursor = 0
    while (cursor < startDow + daysInMonth) {
      let pnl = 0,
        tradingDays = 0,
        tradesCount = 0
      for (let i = 0; i < 7; i++) {
        const dayNum = cursor + i - startDow + 1
        if (dayNum < 1 || dayNum > daysInMonth) continue
        const key = `${prefix}-${String(dayNum).padStart(2, '0')}`
        const d = dayMap.get(key)
        if (d) {
          pnl += d.netPnl
          tradingDays += 1
          tradesCount += d.trades
        }
      }
      weeks.push({ weekIndex, netPnl: pnl, tradingDays, trades: tradesCount })
      weekIndex += 1
      cursor += 7
    }

    return {
      year,
      month,
      days,
      weeks,
      monthNetPnl: days.reduce((a, d) => a + d.netPnl, 0),
      monthTrades: days.reduce((a, d) => a + d.trades, 0),
      monthTradingDays: days.length,
    }
  },
)

// ─── Day detail ───────────────────────────────────────────────────────────────

export const getDayDetail = authedAction([dateKey], async ({ userId }, date): Promise<DayDetail> => {
  const { timezone, breakeven } = await readGlobalSettings()

  const rows = (await userHasTrades(userId))
    ? await db.query.trades.findMany({
        where: and(eq(trades.userId, userId), eq(trades.status, 'closed'), ...(await globalConditions())),
        columns: {
          id: true,
          symbol: true,
          direction: true,
          netPnl: true,
          entryDatetime: true,
          grossPnl: true,
          fees: true,
          entryPrice: true,
          entryQuantity: true,
          riskAmount: true,
          extra: true,
        },
        orderBy: (t, { asc }) => [asc(t.entryDatetime)],
      })
    : getDemoTrades()

  const dayRows = rows.filter((r) => dayKeyInTz(r.entryDatetime, timezone) === date)

  const dollarPnls = dayRows.map((r) => Number(r.netPnl ?? 0))
  const dayOutcomes = dayRows.map((r) =>
    classifyOutcome(
      Number(r.netPnl ?? 0),
      breakeven,
      tradeNotional(Number(r.entryPrice ?? 0), Number(r.entryQuantity ?? 0), multiplierFor(r.extra, r.symbol)),
    ),
  )
  const wins = dollarPnls.filter((_, i) => dayOutcomes[i] === 'win')
  const losses = dollarPnls.filter((_, i) => dayOutcomes[i] === 'loss')
  const grossProfitD = wins.reduce((a, b) => a + b, 0)
  const grossLossD = Math.abs(losses.reduce((a, b) => a + b, 0))

  const stats = {
    netPnl: dayRows.reduce((a, r) => a + Number(r.netPnl ?? 0), 0),
    totalTrades: dayRows.length,
    grossPnl: dayRows.reduce((a, r) => a + Number(r.grossPnl ?? 0), 0),
    wins: wins.length,
    losses: losses.length,
    winRate: calcWinRate(wins.length, dayRows.length),
    commissions: dayRows.reduce((a, r) => a + Number(r.fees ?? 0), 0),
    volume: dayRows.reduce((a, r) => a + Math.abs(Number(r.entryQuantity ?? 0)), 0),
    profitFactor: calcProfitFactor(grossProfitD, grossLossD),
  }

  let cum = 0
  const cumulative: IntradayPoint[] = [{ label: '', cumulative: 0, pnl: 0 }]
  const dayTrades: DayTrade[] = dayRows.map((r) => {
    const pnl = Number(r.netPnl ?? 0)
    const risk = Number(r.riskAmount ?? 0)
    cum += pnl
    const label = timeLabelInTz(r.entryDatetime, timezone)
    cumulative.push({ label, cumulative: cum, pnl })
    return {
      id: r.id,
      symbol: r.symbol,
      direction: r.direction,
      netPnl: pnl,
      time: label,
      rMultiple: risk > 0 ? pnl / risk : null,
    }
  })

  return { date, stats, trades: dayTrades, cumulative }
})

// ─── Template CRUD ────────────────────────────────────────────────────────────

function rowToDTO(r: {
  id: string
  name: string
  isDefault: boolean
  isPreset: boolean
  layout: unknown
}): DashboardTemplateDTO {
  return { id: r.id, name: r.name, isDefault: r.isDefault, isPreset: r.isPreset, layout: r.layout as DashboardLayout }
}

export const listTemplates = authedAction([], async ({ userId }): Promise<DashboardTemplateDTO[]> => {
  const rows = await db.query.dashboardTemplates.findMany({
    where: eq(dashboardTemplates.userId, userId),
    orderBy: [asc(dashboardTemplates.sortOrder), asc(dashboardTemplates.createdAt)],
  })
  return rows.map(rowToDTO)
})

export const getActiveLayout = authedAction(
  [],
  async ({ userId }): Promise<{ template: DashboardTemplateDTO | null; layout: DashboardLayout }> => {
    const rows = await db.query.dashboardTemplates.findMany({
      where: eq(dashboardTemplates.userId, userId),
      orderBy: [asc(dashboardTemplates.sortOrder), asc(dashboardTemplates.createdAt)],
    })
    if (rows.length === 0) return { template: null, layout: DEFAULT_LAYOUT }
    const active = rows.find((r) => r.isDefault) ?? rows[0]
    return { template: rowToDTO(active), layout: active.layout as DashboardLayout }
  },
)

// Layout structure is validated by `validateLayout` (returns field errors), so the
// schema only guards the scalar metadata and passes the layout through typed.
const saveTemplateSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(60),
  layout: z.custom<DashboardLayout>(),
  makeDefault: z.boolean().optional(),
})

export const saveTemplate = authedAction(
  [saveTemplateSchema],
  async (
    { userId },
    input,
  ): Promise<{ success: true; id: string } | { success: false; errors: ReturnType<typeof validateLayout> }> => {
    const errors = validateLayout(input.layout)
    if (errors.length > 0) return { success: false, errors }

    let id = input.id
    if (id) {
      await db
        .update(dashboardTemplates)
        .set({ name: input.name, layout: input.layout, updatedAt: new Date() })
        .where(and(eq(dashboardTemplates.id, id), eq(dashboardTemplates.userId, userId)))
    } else {
      const [created] = await db
        .insert(dashboardTemplates)
        .values({ userId, name: input.name, layout: input.layout, isDefault: false })
        .returning({ id: dashboardTemplates.id })
      id = created.id
    }

    if (input.makeDefault && id) await setDefaultTemplateInternal(userId, id)
    revalidatePath('/dashboard')
    return { success: true, id }
  },
)

export const updateWidgetSettings = authedAction(
  [z.string().min(1).max(200), z.record(z.unknown())],
  async ({ userId }, widgetId, settings) => {
    const apply = (layout: DashboardLayout): boolean => {
      let found = false
      for (const zone of ['top', 'main'] as const) {
        layout[zone] = layout[zone].map((w) => {
          if (w.id !== widgetId) return w
          found = true
          return { ...w, settings: { ...(w.settings ?? {}), ...settings } }
        })
      }
      return found
    }

    const rows = await db.query.dashboardTemplates.findMany({
      where: eq(dashboardTemplates.userId, userId),
      orderBy: [asc(dashboardTemplates.sortOrder), asc(dashboardTemplates.createdAt)],
    })
    const active = rows.find((r) => r.isDefault) ?? rows[0]

    if (active) {
      const layout = active.layout as DashboardLayout
      apply(layout)
      await db
        .update(dashboardTemplates)
        .set({ layout, updatedAt: new Date() })
        .where(and(eq(dashboardTemplates.id, active.id), eq(dashboardTemplates.userId, userId)))
    } else {
      const layout: DashboardLayout = {
        top: DEFAULT_LAYOUT.top.map((w) => ({ ...w })),
        main: DEFAULT_LAYOUT.main.map((w) => ({ ...w })),
      }
      apply(layout)
      await db.insert(dashboardTemplates).values({ userId, name: 'Default', layout, isDefault: true })
    }

    revalidatePath('/dashboard')
    return { success: true }
  },
)

async function setDefaultTemplateInternal(userId: string, id: string) {
  await db.update(dashboardTemplates).set({ isDefault: false }).where(eq(dashboardTemplates.userId, userId))
  await db
    .update(dashboardTemplates)
    .set({ isDefault: true })
    .where(and(eq(dashboardTemplates.id, id), eq(dashboardTemplates.userId, userId)))
}

export const setDefaultTemplate = authedAction([uuid], async ({ userId }, id) => {
  await setDefaultTemplateInternal(userId, id)
  revalidatePath('/dashboard')
  return { success: true }
})

export const renameTemplate = authedAction([uuid, z.string()], async ({ userId }, id, name) => {
  await db
    .update(dashboardTemplates)
    .set({ name: name.trim().slice(0, 30) || 'Untitled', updatedAt: new Date() })
    .where(and(eq(dashboardTemplates.id, id), eq(dashboardTemplates.userId, userId)))
  revalidatePath('/dashboard')
  return { success: true }
})

export const deleteTemplate = authedAction([uuid], async ({ userId }, id) => {
  await db.delete(dashboardTemplates).where(and(eq(dashboardTemplates.id, id), eq(dashboardTemplates.userId, userId)))
  revalidatePath('/dashboard')
  return { success: true }
})

export const createTemplateFromPreset = authedAction(
  [z.string().max(100), z.boolean().default(false)],
  async ({ userId }, presetKey, makeDefault) => {
    const preset = PRESET_TEMPLATES.find((p) => p.key === presetKey) ?? PRESET_TEMPLATES[0]
    const reId = (list: typeof preset.layout.top) => list.map((wi) => ({ ...wi, id: crypto.randomUUID() }))
    const layout: DashboardLayout = { top: reId(preset.layout.top), main: reId(preset.layout.main) }
    const [created] = await db
      .insert(dashboardTemplates)
      .values({ userId, name: preset.name, layout, isPreset: false })
      .returning({ id: dashboardTemplates.id })
    if (makeDefault) await setDefaultTemplateInternal(userId, created.id)
    revalidatePath('/dashboard')
    return { success: true, id: created.id }
  },
)
