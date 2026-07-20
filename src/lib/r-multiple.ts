/**
 * Realized R-multiple: how many multiples of the initial risk the trade
 * returned (`netPnl / riskAmount`).
 *
 * This is the single definition used across the app — the R filter, the
 * dashboard, progress stats and the trades table all report the realized R,
 * not the planned reward-to-risk ratio stored in `riskRewardRatio`. Trades
 * without an entered initial risk have no R-multiple and return `null`.
 */
export function realizedR(
  netPnl: string | number | null | undefined,
  riskAmount: string | number | null | undefined,
): number | null {
  if (netPnl === null || netPnl === undefined || netPnl === '') return null
  if (riskAmount === null || riskAmount === undefined || riskAmount === '') return null
  const pnl = Number(netPnl)
  const risk = Number(riskAmount)
  if (!Number.isFinite(pnl) || !Number.isFinite(risk) || risk <= 0) return null
  return pnl / risk
}

/** `-1.25R`, or an em dash when the trade carries no initial risk. */
export function formatR(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)}R`
}
