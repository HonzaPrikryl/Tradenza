/**
 * Maximum Adverse / Favorable Excursion (MAE / MFE).
 *
 * MAE is how far price moved *against* an open position at its worst point;
 * MFE is how far it moved *in favour* at its best point. Both are reported as
 * non-negative magnitudes. The direction of the trade decides which extreme is
 * adverse and which is favourable — for a long the low is adverse and the high
 * is favourable; for a short it is the other way around. (The previous UI showed
 * low = loss / high = profit unconditionally, which was wrong for shorts.)
 *
 * Framework-agnostic (no 'use client'/'use server') so it can be imported from
 * both server and client components and unit-tested without any runtime.
 */

export interface ExcursionInput {
  direction: 'long' | 'short'
  /** Average/effective entry price. */
  entryPrice: number
  /** Lowest price the market printed while the position was open. */
  lowPrice: number
  /** Highest price the market printed while the position was open. */
  highPrice: number
  /**
   * Account-currency value of a 1.00 move in price for the *whole* position
   * (contract multiplier × quantity). When provided, money excursions are filled
   * in; otherwise they are null.
   */
  pointValue?: number | null
  /**
   * Initial risk (planned $ loss at the stop) for the trade. When provided
   * together with `pointValue`, R-multiple excursions are filled in.
   */
  riskAmount?: number | null
}

export interface Excursion {
  /** The adverse extreme price (worst price seen against the position). */
  maePrice: number
  /** The favourable extreme price (best price seen in favour of the position). */
  mfePrice: number
  /** Adverse excursion in price points (always ≥ 0). */
  maePoints: number
  /** Favourable excursion in price points (always ≥ 0). */
  mfePoints: number
  /** Adverse excursion in account currency, or null when `pointValue` is absent. */
  maeMoney: number | null
  /** Favourable excursion in account currency, or null when `pointValue` is absent. */
  mfeMoney: number | null
  /** Adverse excursion in R multiples, or null when risk/point value are absent. */
  maeR: number | null
  /** Favourable excursion in R multiples, or null when risk/point value are absent. */
  mfeR: number | null
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * Compute MAE/MFE from a trade's entry and the price extremes reached while it
 * was open. Returns null when the inputs are not usable (non-finite numbers).
 *
 * The entry price is always folded into the range (`min`/`max` with entry) so a
 * recorded low/high that just misses the entry fill can never yield a negative
 * excursion, and swapped low/high inputs are tolerated.
 */
export function computeExcursion(input: ExcursionInput): Excursion | null {
  const { direction, entryPrice, lowPrice, highPrice } = input
  if (!isFiniteNumber(entryPrice) || !isFiniteNumber(lowPrice) || !isFiniteNumber(highPrice)) {
    return null
  }

  // Robust to swapped inputs and to an entry fill outside the printed range.
  const lo = Math.min(lowPrice, highPrice, entryPrice)
  const hi = Math.max(lowPrice, highPrice, entryPrice)

  const isLong = direction === 'long'
  const maePrice = isLong ? lo : hi
  const mfePrice = isLong ? hi : lo

  // Magnitudes are non-negative by construction (lo ≤ entry ≤ hi).
  const maePoints = Math.abs(entryPrice - maePrice)
  const mfePoints = Math.abs(mfePrice - entryPrice)

  const pv = isFiniteNumber(input.pointValue) && input.pointValue > 0 ? input.pointValue : null
  const maeMoney = pv !== null ? maePoints * pv : null
  const mfeMoney = pv !== null ? mfePoints * pv : null

  const risk = isFiniteNumber(input.riskAmount) && input.riskAmount > 0 ? input.riskAmount : null
  const maeR = maeMoney !== null && risk !== null ? maeMoney / risk : null
  const mfeR = mfeMoney !== null && risk !== null ? mfeMoney / risk : null

  return { maePrice, mfePrice, maePoints, mfePoints, maeMoney, mfeMoney, maeR, mfeR }
}
