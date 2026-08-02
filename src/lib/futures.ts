import { forexPipSize, forexContractSize } from './forex'

export const FUTURES_MULTIPLIERS: Record<string, number> = {
  // ── Equity index (CME) ──────────────────────────────────────────────
  ES: 50,
  MES: 5, // S&P 500 / Micro
  NQ: 20,
  MNQ: 2, // Nasdaq 100 / Micro
  YM: 5,
  MYM: 0.5, // Dow / Micro
  RTY: 50,
  M2K: 5, // Russell 2000 / Micro
  EMD: 100, // S&P MidCap 400
  NKD: 5, // Nikkei 225 (USD)

  // ── Energy (NYMEX) ──────────────────────────────────────────────────
  CL: 1000,
  MCL: 100, // Crude Oil / Micro
  NG: 10000,
  QG: 2500, // Natural Gas / E-mini
  QM: 500, // E-mini Crude
  RB: 42000, // RBOB Gasoline
  HO: 42000, // Heating Oil
  BZ: 1000, // Brent Crude

  // ── Metals (COMEX / NYMEX) ──────────────────────────────────────────
  GC: 100,
  MGC: 10, // Gold / Micro
  SI: 5000,
  SIL: 1000, // Silver / Micro
  HG: 25000,
  MHG: 2500, // Copper / Micro
  PL: 50, // Platinum
  PA: 100, // Palladium
  ALI: 25, // Aluminum

  ZT: 2000, // 2Y T-Note
  ZF: 1000, // 5Y T-Note
  ZN: 1000, // 10Y T-Note
  TN: 1000, // Ultra 10Y
  ZB: 1000, // 30Y T-Bond
  UB: 1000, // Ultra T-Bond
  '2YY': 1000, // 2Y Yield
  '10Y': 1000, // 10Y Yield

  // ── Short-term rates (CME) ──────────────────────────────────────────
  SR3: 2500, // 3-Month SOFR
  SR1: 4167, // 1-Month SOFR
  ZQ: 4167, // 30-Day Fed Funds

  // ── Agriculture (CBOT) ──────────────────────────────────────────────
  ZC: 50, // Corn
  ZW: 50,
  KE: 50, // Wheat
  ZS: 50, // Soybeans
  ZL: 600, // Soybean Oil
  ZM: 100, // Soybean Meal
  ZO: 50, // Oats
  ZR: 2000, // Rough Rice

  // ── Livestock (CME) ─────────────────────────────────────────────────
  LE: 400, // Live Cattle
  HE: 400, // Lean Hogs
  GF: 500, // Feeder Cattle

  // ── Softs (ICE) ─────────────────────────────────────────────────────
  CT: 500, // Cotton
  SB: 1120, // Sugar #11
  KC: 375, // Coffee
  CC: 10, // Cocoa
  OJ: 150, // Orange Juice

  // ── FX (CME) ────────────────────────────────────────────────────────
  '6E': 125000,
  M6E: 12500, // Euro / Micro
  '6B': 62500,
  M6B: 6250, // British Pound / Micro
  '6J': 12500000,
  MJY: 1250000, // Japanese Yen / Micro
  '6A': 100000,
  M6A: 10000, // Australian Dollar / Micro
  '6C': 100000, // Canadian Dollar
  '6S': 125000,
  MSF: 12500, // Swiss Franc / Micro
  '6N': 100000, // New Zealand Dollar
  '6M': 500000, // Mexican Peso

  // ── Crypto (CME) ────────────────────────────────────────────────────
  BTC: 5,
  MBT: 0.1, // Bitcoin / Micro
  ETH: 50,
  MET: 0.1, // Ether / Micro
  SOL: 500, // Solana
  XRP: 50000, // XRP

  // ── Volatility ──────────────────────────────────────────────────────
  VX: 1000, // VIX
}

export const FUTURES_TICK_SIZE: Record<string, number> = {
  // Equity index
  ES: 0.25,
  MES: 0.25,
  NQ: 0.25,
  MNQ: 0.25,
  YM: 1,
  MYM: 1,
  RTY: 0.1,
  M2K: 0.1,
  EMD: 0.1,
  NKD: 5,

  // Energy
  CL: 0.01,
  MCL: 0.01,
  NG: 0.001,
  QG: 0.005,
  QM: 0.025,
  RB: 0.0001,
  HO: 0.0001,
  BZ: 0.01,

  // Metals
  GC: 0.1,
  MGC: 0.1,
  SI: 0.005,
  SIL: 0.005,
  HG: 0.0005,
  MHG: 0.0005,
  PL: 0.1,
  PA: 0.5, // $50/tick — palladium moves in half-dollars, not dimes
  ALI: 0.25,

  ZT: 0.00390625, // 1/256 — the 2Y trades in quarter-32nds
  ZF: 0.0078125, // 1/128
  ZN: 0.015625, // 1/64
  TN: 0.015625,
  ZB: 0.03125, // 1/32
  UB: 0.03125,
  '2YY': 0.001,
  '10Y': 0.001,

  // Short-term rates
  SR3: 0.005,
  SR1: 0.005,
  ZQ: 0.005,

  // Agriculture
  ZC: 0.25,
  ZW: 0.25,
  KE: 0.25,
  ZS: 0.25,
  ZO: 0.25,
  ZL: 0.01,
  ZM: 0.1,
  ZR: 0.005,

  // Livestock
  LE: 0.025,
  HE: 0.025,
  GF: 0.025,

  // Softs
  CT: 0.01,
  SB: 0.01,
  KC: 0.05,
  CC: 1,
  OJ: 0.05,

  // FX
  '6E': 0.00005,
  M6E: 0.0001,
  '6B': 0.0001,
  M6B: 0.0001,
  '6J': 0.0000005,
  MJY: 0.000001,
  '6A': 0.00005,
  M6A: 0.0001,
  '6C': 0.00005,
  '6S': 0.00005,
  MSF: 0.0001,
  '6N': 0.00005,
  '6M': 0.00001,

  // Crypto
  BTC: 5,
  MBT: 5,
  ETH: 0.5,
  MET: 0.5,
  SOL: 0.05,
  XRP: 0.0005,

  // Volatility
  VX: 0.05,
}

const MONTH_CODE = /[FGHJKMNQUVXZ]\d{1,2}$/

export function contractMultiplier(symbol: string): number {
  if (!symbol) return 0
  const s = symbol.trim().toUpperCase()
  if (s in FUTURES_MULTIPLIERS) return FUTURES_MULTIPLIERS[s]

  const root = s.replace(MONTH_CODE, '')
  if (root && root in FUTURES_MULTIPLIERS) return FUTURES_MULTIPLIERS[root]

  return 0
}

// Standard contract multiplier for a US-listed equity/index option: one contract
// controls 100 shares, so P&L per point of premium is ×100.
export const OPTIONS_MULTIPLIER = 100

/**
 * The value multiplier to apply to a per-point price move for a given asset class:
 *  - futures → the instrument's contract multiplier (falls back to 1 if unknown)
 *  - options → 100 (one contract = 100 shares)
 *  - forex   → the standard-lot contract size, because size is entered in lots
 *  - stocks / crypto / other → 1 (raw price × quantity is already correct)
 *
 * Centralises the rule so the manual entry form, CSV import and the trade editor
 * all price the same instrument identically. That is the whole point of this
 * function: every caller must go through it rather than re-deriving the rule,
 * otherwise the same trade is worth different amounts depending on how it
 * entered the app.
 */
export function assetMultiplier(assetClass: string, symbol: string): number {
  if (assetClass === 'futures') return contractMultiplier(symbol) || 1
  if (assetClass === 'options') return OPTIONS_MULTIPLIER
  if (assetClass === 'forex') return forexContractSize(symbol)
  return 1
}

/**
 * Multiplier used to seed an editable multiplier field. Like `assetMultiplier`
 * but returns 0 for an *unrecognised futures* symbol so the field visibly
 * prompts the user to supply the contract size, rather than silently
 * defaulting to 1.
 */
export function editorDefaultMultiplier(assetClass: string, symbol: string): number {
  if (assetClass === 'futures') return contractMultiplier(symbol)
  return assetMultiplier(assetClass, symbol)
}

export function tickSize(symbol: string): number {
  if (!symbol) return 0
  const s = symbol.trim().toUpperCase()
  if (s in FUTURES_TICK_SIZE) return FUTURES_TICK_SIZE[s]

  const root = s.replace(MONTH_CODE, '')
  if (root && root in FUTURES_TICK_SIZE) return FUTURES_TICK_SIZE[root]

  return 0
}

export function tickValue(symbol: string, mult?: number): number {
  const m = mult && mult > 0 ? mult : contractMultiplier(symbol)
  const ts = tickSize(symbol)
  if (m <= 0 || ts <= 0) return 0
  return m * ts
}

/**
 * A sensible price increment for any instrument, so the risk planner's price /
 * money modes work beyond futures:
 *  - futures → the contract's real tick (0 when unknown, to prompt the user)
 *  - forex → the pair's pip (0.0001, or 0.01 for JPY pairs)
 *  - stocks / options / crypto / cfd / other → 0.01 (a penny), a fine-enough
 *    granularity for entering price levels.
 */
export function instrumentTickSize(assetClass: string, symbol: string): number {
  const futuresTs = tickSize(symbol)
  if (futuresTs > 0) return futuresTs
  if (assetClass === 'forex') return forexPipSize(symbol)
  if (assetClass === 'futures') return 0
  return 0.01
}

/** Money value of one `instrumentTickSize` step given the value multiplier. */
export function instrumentTickValue(assetClass: string, symbol: string, mult: number): number {
  const ts = instrumentTickSize(assetClass, symbol)
  return ts > 0 && mult > 0 ? ts * mult : 0
}
