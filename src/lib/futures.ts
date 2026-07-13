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
  NG: 10000, // Natural Gas
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

  ZT: 2000, // 2Y T-Note
  ZF: 1000, // 5Y T-Note
  ZN: 1000, // 10Y T-Note
  TN: 1000, // Ultra 10Y
  ZB: 1000, // 30Y T-Bond
  UB: 1000, // Ultra T-Bond

  // ── Agriculture (CBOT) ──────────────────────────────────────────────
  ZC: 50, // Corn
  ZW: 50,
  KE: 50, // Wheat
  ZS: 50, // Soybeans
  ZL: 600, // Soybean Oil
  ZM: 100, // Soybean Meal
  ZO: 50, // Oats

  // ── Softs (ICE) ─────────────────────────────────────────────────────
  CT: 500, // Cotton
  SB: 1120, // Sugar #11
  KC: 375, // Coffee
  CC: 10, // Cocoa
  OJ: 150, // Orange Juice

  // ── FX (CME) ────────────────────────────────────────────────────────
  '6E': 125000,
  M6E: 12500, // Euro / Micro
  '6B': 62500, // British Pound
  '6J': 12500000, // Japanese Yen
  '6A': 100000, // Australian Dollar
  '6C': 100000, // Canadian Dollar
  '6S': 125000, // Swiss Franc
  '6N': 100000, // New Zealand Dollar
  '6M': 500000, // Mexican Peso

  // ── Crypto (CME) ────────────────────────────────────────────────────
  BTC: 5,
  MBT: 0.1, // Bitcoin / Micro
  ETH: 50,
  MET: 0.1, // Ether / Micro

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
  PA: 0.1,

  ZT: 0.0078125, // 1/128
  ZF: 0.0078125, // 1/128
  ZN: 0.015625, // 1/64
  TN: 0.015625,
  ZB: 0.03125, // 1/32
  UB: 0.03125,

  // Agriculture
  ZC: 0.25,
  ZW: 0.25,
  KE: 0.25,
  ZS: 0.25,
  ZO: 0.25,
  ZL: 0.01,
  ZM: 0.1,

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
  '6J': 0.0000005,
  '6A': 0.0001,
  '6C': 0.00005,
  '6S': 0.0001,
  '6N': 0.0001,
  '6M': 0.00001,

  // Crypto
  BTC: 5,
  MBT: 5,
  ETH: 0.5,
  MET: 0.5,

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
 *  - stocks / crypto / forex / other → 1 (raw price × quantity is already correct;
 *    forex users can still set a custom multiplier per execution for pip/lot sizing)
 *
 * Centralises the rule so the manual entry form, CSV import and the trade editor
 * all price the same instrument identically.
 */
export function assetMultiplier(assetClass: string, symbol: string): number {
  if (assetClass === 'futures') return contractMultiplier(symbol) || 1
  if (assetClass === 'options') return OPTIONS_MULTIPLIER
  return 1
}

/**
 * Multiplier used to seed the executions editor's editable field. Like
 * `assetMultiplier` but returns 0 for an *unrecognised futures* symbol so the
 * field visibly prompts the user to supply the contract size, rather than
 * silently defaulting to 1.
 */
export function editorDefaultMultiplier(assetClass: string, symbol: string): number {
  const bySymbol = contractMultiplier(symbol)
  if (bySymbol > 0) return bySymbol
  if (assetClass === 'options') return OPTIONS_MULTIPLIER
  if (assetClass === 'futures') return 0
  return 1
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
