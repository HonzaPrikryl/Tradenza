// Forex instrument valuation.
//
// In this app a trade's P&L is `(exit − entry) × quantity × multiplier`. For
// forex the natural multiplier is the *contract size*: the number of base-
// currency units in one standard lot. That is 100,000 for essentially every
// standard FX pair, so a trader entering size in **lots** (1.0, 0.1 micro, …)
// with multiplier 100,000 gets a correct P&L — mirroring how futures pre-fill
// their contract multiplier.
//
// The per-pip value emerges from the price scale automatically: a pip is 0.0001
// for most pairs but 0.01 for JPY-quoted pairs, so 1 lot = $10/pip on EURUSD and
// ¥1,000/pip on USDJPY without any special-casing in the P&L formula.
//
// Caveat: P&L comes out in the pair's *quote* currency. For USD-quoted majors
// (EURUSD, GBPUSD, …) that is USD directly; for JPY or cross pairs the figure is
// in the quote currency and a separate FX conversion would be needed to express
// it in the account currency. That cross-currency conversion is out of scope
// here (it needs live rates) and is unchanged by this module.

// Units of base currency in one standard lot. Standard across major FX pairs.
export const FOREX_STANDARD_LOT = 100_000

// ISO-4217 codes we recognise when splitting a pair into base/quote.
const CURRENCIES = new Set([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'AUD',
  'CAD',
  'NZD',
  'SEK',
  'NOK',
  'DKK',
  'SGD',
  'HKD',
  'MXN',
  'ZAR',
  'PLN',
  'TRY',
  'CNH',
])

// The most commonly traded pairs — used for recognition and documentation. All
// share the 100,000-unit standard-lot contract size; they differ only in pip
// size (JPY pairs use 0.01, the rest 0.0001).
export const FOREX_MAJORS = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'USDCHF',
  'AUDUSD',
  'USDCAD',
  'NZDUSD',
  'EURJPY',
  'GBPJPY',
  'EURGBP',
  'EURCHF',
  'AUDJPY',
  'CHFJPY',
  'CADJPY',
  'NZDJPY',
  'EURAUD',
  'EURCAD',
  'GBPCHF',
  'GBPAUD',
  'GBPCAD',
  'AUDNZD',
  'AUDCAD',
] as const

// Strip separators/suffixes and return the 6-letter core, e.g. "EUR/USD.r" → "EURUSD".
function normalizePair(symbol: string): string {
  return (symbol || '').toUpperCase().replace(/[^A-Z]/g, '')
}

// Split a pair into [base, quote] when both are recognised currencies.
function splitPair(symbol: string): [string, string] | null {
  const s = normalizePair(symbol)
  if (s.length < 6) return null
  const base = s.slice(0, 3)
  const quote = s.slice(3, 6)
  if (CURRENCIES.has(base) && CURRENCIES.has(quote)) return [base, quote]
  return null
}

// True when the symbol parses as a currency pair (both sides known currencies).
export function isForexPair(symbol: string): boolean {
  return splitPair(symbol) !== null
}

// Public [base, quote] split, or null. `EUR/USD` → ['EUR', 'USD'].
export function forexPairParts(symbol: string): [string, string] | null {
  return splitPair(symbol)
}

// Pip (smallest conventional increment) for a pair: 0.01 for JPY-quoted pairs,
// otherwise 0.0001. Defaults to 0.0001 for unrecognised symbols.
export function forexPipSize(symbol: string): number {
  const parts = splitPair(symbol)
  return parts && parts[1] === 'JPY' ? 0.01 : 0.0001
}

// Contract size (base-currency units per standard lot) to use as the P&L
// multiplier. 100,000 for standard FX; the default also applies to any symbol a
// user has explicitly classified as forex, so the pre-fill is always sensible.
export function forexContractSize(_symbol: string): number {
  return FOREX_STANDARD_LOT
}

// Value of one pip for a standard lot, expressed in the pair's quote currency
// (e.g. 10 for EURUSD → $10, 1000 for USDJPY → ¥1,000). Informational.
export function forexPipValue(symbol: string, lots = 1): number {
  return forexPipSize(symbol) * forexContractSize(symbol) * lots
}
