import { db, trades, tradeTags, accounts } from '@/lib/db'
import { and, or, gte, lte, eq, isNull, inArray, notInArray, sql, type SQL, type AnyColumn } from 'drizzle-orm'
import type { GlobalFilters } from '@/lib/global-filters-types'
import type { BreakevenConfig } from '@/lib/breakeven'

export function generalConditions(
  gf: GlobalFilters,
  opts: { includeStatus?: boolean; breakeven?: BreakevenConfig | null } = {},
): SQL[] {
  const out: SQL[] = []

  const archivedAccounts = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.archived, true))
  const notArchived = or(isNull(trades.accountId), notInArray(trades.accountId, archivedAccounts))
  if (notArchived) out.push(notArchived)

  if (gf.accountIds) out.push(inArray(trades.accountId, gf.accountIds))
  if (gf.dateFrom) out.push(gte(trades.entryDatetime, new Date(gf.dateFrom)))
  if (gf.dateTo) out.push(lte(trades.entryDatetime, new Date(`${gf.dateTo}T23:59:59.999`)))

  // Side (long/short)
  if (gf.sides.length > 0) out.push(inArray(trades.direction, gf.sides))

  if (opts.includeStatus && gf.statuses.length > 0) out.push(inArray(trades.status, gf.statuses))

  if (gf.outcomes.length > 0) {
    // The win/loss/breakeven measure honours the breakeven band. A null config is
    // equivalent to a zero-width dollar band [0, 0] (i.e. only an exact 0 = breakeven).
    const be = opts.breakeven
    const from = be ? be.from : 0
    const to = be ? be.to : 0
    const measure =
      be?.mode === 'percent'
        ? sql`(${trades.netPnl}::numeric / nullif(${trades.entryPrice}::numeric * ${trades.entryQuantity}::numeric * coalesce((${trades.extra}->>'contractMultiplier')::numeric, 1), 0) * 100)`
        : sql`${trades.netPnl}::numeric`
    const parts: SQL[] = []
    if (gf.outcomes.includes('win')) parts.push(sql`${measure} > ${to}`)
    if (gf.outcomes.includes('loss')) parts.push(sql`${measure} < ${from}`)
    if (gf.outcomes.includes('breakeven')) parts.push(sql`${measure} >= ${from} and ${measure} <= ${to}`)
    const orCond = or(...parts)
    if (orCond) out.push(orCond)
  }

  // Instrument (asset class)
  if (gf.instruments.length > 0) {
    out.push(inArray(trades.assetClass, gf.instruments as (typeof trades.assetClass.enumValues)[number][]))
  }

  // Symbol include / exclude
  if (gf.symbolsInclude.length > 0) out.push(inArray(trades.symbol, gf.symbolsInclude))
  if (gf.symbolsExclude.length > 0) out.push(notInArray(trades.symbol, gf.symbolsExclude))

  // Strategy include / exclude. Exclude keeps trades with no strategy (a null
  // strategyId isn't "one of the excluded"), so it only drops the named ones.
  if (gf.strategiesInclude.length > 0) out.push(inArray(trades.strategyId, gf.strategiesInclude))
  if (gf.strategiesExclude.length > 0) {
    const keep = or(isNull(trades.strategyId), notInArray(trades.strategyId, gf.strategiesExclude))
    if (keep) out.push(keep)
  }

  // Trade rating
  if (gf.ratings.length > 0) out.push(inArray(trades.rating, gf.ratings))

  const hasRange = gf.rMin !== undefined || gf.rMax !== undefined
  if (hasRange || gf.rNone) {
    const rExpr = sql`(${trades.netPnl}::numeric / nullif(${trades.riskAmount}::numeric, 0))`
    const rangeParts: SQL[] = []
    if (gf.rMin !== undefined) rangeParts.push(sql`${rExpr} >= ${gf.rMin}`)
    if (gf.rMax !== undefined) rangeParts.push(sql`${rExpr} <= ${gf.rMax}`)
    const rangeCond = rangeParts.length > 0 ? and(...rangeParts) : undefined
    const noR = sql`(${trades.riskAmount} is null or ${trades.riskAmount}::numeric = 0)`

    if (rangeCond && gf.rNone) {
      const c = or(rangeCond, noR)
      if (c) out.push(c)
    } else if (rangeCond) {
      out.push(rangeCond)
    } else if (gf.rNone) {
      out.push(noR)
    }
  }

  // ── Day & Time ──
  const inList = (expr: SQL, vals: number[]) =>
    sql`${expr} in (${sql.join(
      vals.map((v) => sql`${v}`),
      sql`, `,
    )})`

  if (gf.daysOfWeek.length > 0) {
    out.push(inList(sql`extract(dow from ${trades.entryDatetime})`, gf.daysOfWeek))
  }
  if (gf.months.length > 0) {
    out.push(inList(sql`extract(month from ${trades.entryDatetime})`, gf.months))
  }

  const durMin = gf.durationMin
  const durMax = gf.durationMax
  if ((durMin !== undefined && durMin !== null) || (durMax !== undefined && durMax !== null)) {
    const durExpr = sql`(extract(epoch from (${trades.exitDatetime} - ${trades.entryDatetime})) / 60)`
    const parts: SQL[] = [sql`${trades.exitDatetime} is not null`]
    if (durMin !== undefined && durMin !== null) parts.push(sql`${durExpr} >= ${durMin}`)
    if (durMax !== undefined && durMax !== null) parts.push(sql`${durExpr} <= ${durMax}`)
    const c = and(...parts)
    if (c) out.push(c)
  }

  const hhmm = (s: string) => {
    const [h, m] = s.split(':').map(Number)
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
  }
  const timeConds = (col: AnyColumn, ranges: { from: string; to: string }[]): SQL | undefined => {
    if (ranges.length === 0) return undefined
    const minExpr = sql`(extract(hour from ${col}) * 60 + extract(minute from ${col}))`
    const parts = ranges.map((r) => {
      const a = hhmm(r.from)
      const b = hhmm(r.to)
      return a <= b ? sql`(${minExpr} >= ${a} and ${minExpr} <= ${b})` : sql`(${minExpr} >= ${a} or ${minExpr} <= ${b})`
    })
    return or(...parts)
  }
  const entryT = timeConds(trades.entryDatetime, gf.entryTimeRanges)
  if (entryT) out.push(entryT)
  const exitT = timeConds(trades.exitDatetime, gf.exitTimeRanges)
  if (exitT) out.push(and(sql`${trades.exitDatetime} is not null`, exitT)!)

  for (const grp of gf.tagInclude) {
    if (grp.tagIds.length === 0) continue
    if (grp.matchAll) {
      const sub = db
        .select({ id: tradeTags.tradeId })
        .from(tradeTags)
        .where(inArray(tradeTags.tagId, grp.tagIds))
        .groupBy(tradeTags.tradeId)
        .having(sql`count(distinct ${tradeTags.tagId}) = ${grp.tagIds.length}`)
      out.push(inArray(trades.id, sub))
    } else {
      const sub = db.select({ id: tradeTags.tradeId }).from(tradeTags).where(inArray(tradeTags.tagId, grp.tagIds))
      out.push(inArray(trades.id, sub))
    }
  }

  if (gf.excludeTags.length > 0) {
    const sub = db.select({ id: tradeTags.tradeId }).from(tradeTags).where(inArray(tradeTags.tagId, gf.excludeTags))
    out.push(notInArray(trades.id, sub))
  }

  return out
}
