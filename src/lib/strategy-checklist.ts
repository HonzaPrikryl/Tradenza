import { computeBundle, type TradeRow, type PlType } from '@/lib/stats-compute'
import type { BreakevenConfig } from '@/lib/breakeven'

export type ChecklistProgress = { entry: string[]; exit: string[] } | null

export interface ChecklistTrade {
  row: TradeRow
  progress: ChecklistProgress
}

export interface CriterionPerformance {
  kind: 'entry' | 'exit'
  text: string
  followed: number // trades where this criterion was ticked
  total: number // trades the strategy could have applied it to
  followedPct: number // followed / total * 100
  winRateFollowed: number | null // win% among trades where it was followed
  winRateMissed: number | null // win% among trades where it was not
  avgPnlFollowed: number | null // avg trade P&L when followed
  avgPnlMissed: number | null // avg trade P&L when missed
}

export interface ComplianceSplit {
  count: number
  winRate: number | null
  avgPnl: number | null
  expectancy: number | null
}

export interface ChecklistAnalytics {
  totalCriteria: number
  adherencePct: number | null // avg share of criteria ticked across trades
  criteria: CriterionPerformance[]
  full: ComplianceSplit
  partial: ComplianceSplit
}

const ticked = (progress: ChecklistProgress, kind: 'entry' | 'exit', text: string): boolean =>
  !!progress && progress[kind].includes(text)

function split(rows: TradeRow[], mode: PlType, cfg: BreakevenConfig | null): ComplianceSplit {
  if (rows.length === 0) return { count: 0, winRate: null, avgPnl: null, expectancy: null }
  const b = computeBundle(rows, mode, cfg)
  return { count: rows.length, winRate: b.winPct, avgPnl: b.avgTradePnl, expectancy: b.tradeExpectancy }
}

// Average share (0–100) of the strategy's criteria a trade ticked, across all
// trades. Null when the strategy has no criteria or there are no trades.
export function adherenceOf(trades: ChecklistTrade[], entryCriteria: string[], exitCriteria: string[]): number | null {
  const total = entryCriteria.length + exitCriteria.length
  if (total === 0 || trades.length === 0) return null
  const sumShare = trades.reduce((acc, tr) => {
    const done =
      entryCriteria.filter((c) => ticked(tr.progress, 'entry', c)).length +
      exitCriteria.filter((c) => ticked(tr.progress, 'exit', c)).length
    return acc + done / total
  }, 0)
  return (sumShare / trades.length) * 100
}

export function computeChecklistAnalytics(
  trades: ChecklistTrade[],
  entryCriteria: string[],
  exitCriteria: string[],
  mode: PlType,
  cfg: BreakevenConfig | null,
): ChecklistAnalytics {
  const totalCriteria = entryCriteria.length + exitCriteria.length

  const perCriterion = (kind: 'entry' | 'exit', text: string): CriterionPerformance => {
    const followedRows: TradeRow[] = []
    const missedRows: TradeRow[] = []
    for (const tr of trades) (ticked(tr.progress, kind, text) ? followedRows : missedRows).push(tr.row)
    const bF = followedRows.length ? computeBundle(followedRows, mode, cfg) : null
    const bM = missedRows.length ? computeBundle(missedRows, mode, cfg) : null
    return {
      kind,
      text,
      followed: followedRows.length,
      total: trades.length,
      followedPct: trades.length ? (followedRows.length / trades.length) * 100 : 0,
      winRateFollowed: bF ? bF.winPct : null,
      winRateMissed: bM ? bM.winPct : null,
      avgPnlFollowed: bF ? bF.avgTradePnl : null,
      avgPnlMissed: bM ? bM.avgTradePnl : null,
    }
  }

  const criteria: CriterionPerformance[] = [
    ...entryCriteria.map((c) => perCriterion('entry', c)),
    ...exitCriteria.map((c) => perCriterion('exit', c)),
  ]

  // Full compliance = every defined criterion ticked. Only meaningful when the
  // strategy actually defines criteria.
  const fullRows: TradeRow[] = []
  const partialRows: TradeRow[] = []
  if (totalCriteria > 0) {
    for (const tr of trades) {
      const done =
        entryCriteria.filter((c) => ticked(tr.progress, 'entry', c)).length +
        exitCriteria.filter((c) => ticked(tr.progress, 'exit', c)).length
      ;(done === totalCriteria ? fullRows : partialRows).push(tr.row)
    }
  }

  return {
    totalCriteria,
    adherencePct: adherenceOf(trades, entryCriteria, exitCriteria),
    criteria,
    full: split(fullRows, mode, cfg),
    partial: split(partialRows, mode, cfg),
  }
}
