// Breakeven classification. A trade (or aggregated day) is "breakeven" when its
// realized result falls inside a user-configured band instead of being exactly
// zero. The band is expressed either in account currency (dollar) or as a return
// percentage of the position's notional value. Kept pure (no 'use server') so it
// can be shared by every classification site and unit-tested.

import { contractMultiplier } from '@/lib/futures'

export type Outcome = 'win' | 'loss' | 'breakeven'
export type BreakevenMode = 'dollar' | 'percent'

export interface BreakevenConfig {
  mode: BreakevenMode
  /** Lower bound of the breakeven band (inclusive). */
  from: number
  /** Upper bound of the breakeven band (inclusive). */
  to: number
}

const toNum = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : 0
}

/** Position value used as the basis for percent-mode classification. */
export function tradeNotional(entryPrice: number, quantity: number, multiplier = 1): number {
  const n = Math.abs(entryPrice * quantity * (multiplier > 0 ? multiplier : 1))
  return Number.isFinite(n) ? n : 0
}

/**
 * Resolve a trade's contract multiplier from its stored `extra.contractMultiplier`,
 * falling back to the symbol's futures multiplier, then 1.
 */
export function multiplierFor(extra: unknown, symbol: string): number {
  const stored = toNum((extra as { contractMultiplier?: unknown } | null)?.contractMultiplier)
  if (stored > 0) return stored
  const bySymbol = contractMultiplier(symbol)
  return bySymbol > 0 ? bySymbol : 1
}

/**
 * Classify a P&L value against the breakeven band.
 *
 * - `cfg` null → legacy behaviour: only an exact 0 is breakeven.
 * - dollar mode → the band is compared against `pnl` directly.
 * - percent mode → the band is compared against the return % (`pnl / notional * 100`);
 *   when no positive notional is available the exact-zero rule is used instead.
 */
export function classifyOutcome(pnl: number, cfg: BreakevenConfig | null, notional?: number | null): Outcome {
  if (cfg) {
    let measure: number | null = pnl
    if (cfg.mode === 'percent') {
      measure = notional && notional > 0 ? (pnl / notional) * 100 : null
    }
    if (measure !== null) {
      if (measure < cfg.from) return 'loss'
      if (measure > cfg.to) return 'win'
      return 'breakeven'
    }
  }
  return pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven'
}

/** Map an outcome to a sign for streak/run calculations. */
export function outcomeSign(o: Outcome): number {
  return o === 'win' ? 1 : o === 'loss' ? -1 : 0
}

/**
 * The scalar the band is compared against for a single trade: dollars in dollar
 * mode, return % (pnl / notional × 100) in percent mode. Percent without a
 * positive notional contributes 0 (it cannot move the measure either way).
 *
 * These measures are additive across a day, which is the whole point: a day's
 * measure is the SUM of its trades' measures, so a +1R win and a −1R loss cancel
 * to ~0 (→ breakeven) while a day containing a real winner keeps that winner's
 * full percentage instead of having it diluted by other trades' notionals.
 */
export function outcomeMeasure(pnl: number, cfg: BreakevenConfig | null, notional?: number | null): number {
  if (!cfg || cfg.mode === 'dollar') return pnl
  return notional && notional > 0 ? (pnl / notional) * 100 : 0
}

/** Classify an already-computed measure (e.g. a day's summed trade measures). */
export function classifyMeasure(measure: number, cfg: BreakevenConfig | null): Outcome {
  if (cfg) {
    if (measure < cfg.from) return 'loss'
    if (measure > cfg.to) return 'win'
    return 'breakeven'
  }
  return measure > 0 ? 'win' : measure < 0 ? 'loss' : 'breakeven'
}

/**
 * Build a usable config from raw stored values, or null when the band is
 * effectively disabled. A zero-width [0, 0] band is treated as disabled because
 * it is identical to the exact-zero rule. Reversed bounds are normalised.
 */
export function normalizeBreakevenConfig(
  mode: string | null | undefined,
  from: number | null | undefined,
  to: number | null | undefined,
): BreakevenConfig | null {
  if (mode !== 'dollar' && mode !== 'percent') return null
  const f = Number.isFinite(from as number) ? (from as number) : 0
  const t = Number.isFinite(to as number) ? (to as number) : 0
  if (f === 0 && t === 0) return null
  return { mode, from: Math.min(f, t), to: Math.max(f, t) }
}
