// Pure P&L helpers used when persisting trades. Kept dependency-free (no
// 'use server', no i18n) so they can be unit-tested and shared by every write
// path — manual entry, CSV import and execution reconstruction.

// Trades are stored in numeric(18,8) columns. JS float math (e.g. 0.1 + 0.2)
// leaves binary dust that would otherwise be persisted verbatim; rounding to the
// column scale strips it without losing any precision the database can hold.
export function roundMoney(value: number, scale = 8): number {
  if (!Number.isFinite(value)) return 0
  return Number(value.toFixed(scale))
}

export interface PnlInput {
  direction: 'long' | 'short'
  entryPrice: number
  exitPrice: number
  quantity: number
  fees?: number
  /** Contract multiplier (e.g. ES = 50). Defaults to 1 for non-futures. */
  multiplier?: number
}

// Gross P&L applies the contract multiplier so futures are valued correctly;
// fees are subtracted only from net. Both are rounded from the raw figure so net
// never inherits a rounded gross.
export function derivePnl(p: PnlInput): { grossPnl: number; netPnl: number } {
  const mult = p.multiplier && p.multiplier > 0 ? p.multiplier : 1
  const dir = p.direction === 'long' ? 1 : -1
  const grossRaw = dir * (p.exitPrice - p.entryPrice) * p.quantity * mult
  return {
    grossPnl: roundMoney(grossRaw),
    netPnl: roundMoney(grossRaw - (p.fees ?? 0)),
  }
}
