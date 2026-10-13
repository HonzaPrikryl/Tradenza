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

export type ExecutionSide = 'buy' | 'sell' | 'dividend'

export interface PersistedExecution {
  datetime: string
  side: ExecutionSide
  quantity: number
  price: number
  commission: number
  fee: number
}

/**
 * Dividend rows are a plain cash credit (quantity × price, no contract
 * multiplier). They never open or close the position, never move the average
 * entry/exit, and land in the trade's P&L. Their commission/fee (e.g.
 * withholding tax) still counts towards the trade's fees.
 */
export const isDividend = (e: { side: ExecutionSide }) => e.side === 'dividend'

export const dividendAmount = (execs: readonly { side: ExecutionSide; quantity: number; price: number }[]) =>
  execs.reduce((s, e) => (isDividend(e) ? s + e.quantity * e.price : s), 0)

/**
 * The trade-level columns implied by a set of executions — shared by manual
 * entry and the executions editor so both persist the same numbers. The
 * earliest buy/sell opens the position; the opposite side closes it.
 * Returns null when there is no buy/sell execution at all.
 */
export function deriveTradeFromExecutions(execs: readonly PersistedExecution[], multiplier: number) {
  const sorted = [...execs].sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime))
  const fills = sorted.filter((e) => !isDividend(e))
  if (fills.length === 0) return null

  const entrySide = fills[0].side
  const direction: 'long' | 'short' = entrySide === 'buy' ? 'long' : 'short'
  const entries = fills.filter((e) => e.side === entrySide)
  const exits = fills.filter((e) => e.side !== entrySide)

  const sumQty = (rows: PersistedExecution[]) => rows.reduce((s, e) => s + e.quantity, 0)
  const avgPrice = (rows: PersistedExecution[]) => {
    const qty = sumQty(rows)
    return qty === 0 ? 0 : rows.reduce((s, e) => s + e.price * e.quantity, 0) / qty
  }

  const entryQuantity = sumQty(entries)
  const exitQuantity = sumQty(exits)
  const entryPrice = avgPrice(entries)
  const exitPrice = exits.length > 0 ? avgPrice(exits) : null
  const fees = sorted.reduce((s, e) => s + e.commission + e.fee, 0)
  const dividends = dividendAmount(sorted)

  let grossPnl: number | null = null
  let netPnl: number | null = null
  const matchedQty = Math.min(entryQuantity, exitQuantity)
  if (exitPrice !== null && matchedQty > 0) {
    const mult = multiplier > 0 ? multiplier : 1
    const dir = direction === 'long' ? 1 : -1
    const gross = dir * (exitPrice - entryPrice) * matchedQty * mult + dividends
    grossPnl = roundMoney(gross)
    netPnl = roundMoney(gross - fees)
  }

  return {
    sorted,
    direction,
    status: (exitQuantity >= entryQuantity && exits.length > 0 ? 'closed' : 'open') as 'open' | 'closed',
    entryQuantity,
    exitQuantity,
    entryPrice,
    exitPrice,
    entryDatetime: new Date(entries[0].datetime),
    exitDatetime: exits.length > 0 ? new Date(exits[exits.length - 1].datetime) : null,
    fees,
    dividends,
    grossPnl,
    netPnl,
  }
}
