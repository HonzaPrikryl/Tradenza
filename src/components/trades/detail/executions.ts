import type { Trade } from '@/lib/db'

export interface NormalizedExecution {
  /** Unix seconds. */
  time: number
  side: 'buy' | 'sell'
  quantity: number
  price: number
  commission: number
  fee: number
}

interface RawExecution {
  datetime?: unknown
  side?: unknown
  quantity?: unknown
  price?: unknown
  commission?: unknown
  fee?: unknown
}

const toNum = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : 0
}

export function normalizeExecutions(trade: Trade): NormalizedExecution[] {
  const extra = trade.extra as { executions?: RawExecution[] } | null
  const raw = Array.isArray(extra?.executions) ? extra!.executions! : null

  if (raw && raw.length > 0) {
    const out: NormalizedExecution[] = []
    for (const e of raw) {
      const ts = typeof e.datetime === 'string' ? Date.parse(e.datetime) : NaN
      const price = toNum(e.price)
      const qty = toNum(e.quantity)
      if (!Number.isFinite(ts) || price <= 0 || qty <= 0) continue
      out.push({
        time: Math.floor(ts / 1000),
        side: e.side === 'sell' ? 'sell' : 'buy',
        quantity: qty,
        price,
        commission: toNum(e.commission),
        fee: toNum(e.fee),
      })
    }
    if (out.length > 0) return out.sort((a, b) => a.time - b.time)
  }

  // Fallback: synthesize an entry (+ exit) execution from the trade itself
  const out: NormalizedExecution[] = []
  const entrySide = trade.direction === 'long' ? 'buy' : 'sell'
  out.push({
    time: Math.floor(new Date(trade.entryDatetime).getTime() / 1000),
    side: entrySide,
    quantity: toNum(trade.entryQuantity),
    price: toNum(trade.entryPrice),
    commission: 0,
    fee: toNum(trade.fees),
  })
  if (trade.exitPrice && trade.exitDatetime) {
    out.push({
      time: Math.floor(new Date(trade.exitDatetime).getTime() / 1000),
      side: entrySide === 'buy' ? 'sell' : 'buy',
      quantity: toNum(trade.exitQuantity ?? trade.entryQuantity),
      price: toNum(trade.exitPrice),
      commission: 0,
      fee: 0,
    })
  }
  return out
}

export function storedMultiplier(trade: Trade): number | undefined {
  const extra = trade.extra as { contractMultiplier?: unknown } | null
  const m = toNum(extra?.contractMultiplier)
  return m > 0 ? m : undefined
}

export interface RiskPlanLeg {
  ticks: number
  qty: number
}

export interface RiskPlan {
  tickValue: number
  profitTargets: RiskPlanLeg[]
  stopLosses: RiskPlanLeg[]
}

export function storedRiskPlan(trade: Trade): RiskPlan | undefined {
  const extra = trade.extra as { riskPlan?: unknown } | null
  const rp = extra?.riskPlan as Partial<RiskPlan> | undefined
  if (!rp || typeof rp !== 'object') return undefined
  const legs = (arr: unknown): RiskPlanLeg[] =>
    Array.isArray(arr)
      ? arr.map((l) => ({ ticks: toNum((l as RiskPlanLeg)?.ticks), qty: toNum((l as RiskPlanLeg)?.qty) }))
      : []
  return {
    tickValue: toNum(rp.tickValue),
    profitTargets: legs(rp.profitTargets),
    stopLosses: legs(rp.stopLosses),
  }
}
