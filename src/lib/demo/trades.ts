// Demo trade dataset. Shown to brand-new users (zero real trades) so the
// dashboard and trades pages present a lively, believable preview instead of a
// wall of zeros. Kept pure (no DB/auth) so any server action can feed it into
// the exact same computation path as real data — guaranteeing identical shapes.
//
// The dataset is deterministic (seeded RNG) but anchored to "now", so the
// calendar and time-of-day widgets always have data in the current period.
// Regenerated at most once per day and cached in module scope.

import type { Trade } from '@/lib/db'

// mulberry32 — tiny deterministic PRNG so the demo looks the same across renders.
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Plain equities keep the contract multiplier at 1, so P&L, notional and the
// breakeven classification all stay intuitive in the preview.
const SYMBOLS: { s: string; price: number }[] = [
  { s: 'AAPL', price: 195 },
  { s: 'NVDA', price: 120 },
  { s: 'TSLA', price: 250 },
  { s: 'MSFT', price: 430 },
  { s: 'AMZN', price: 185 },
  { s: 'META', price: 505 },
  { s: 'AMD', price: 160 },
  { s: 'SPY', price: 548 },
]

const SETUPS = ['Breakout', 'Pullback', 'Trend continuation', 'Reversal', 'Range fade']

// How many days back the demo history spans.
const HISTORY_DAYS = 74

let cache: { day: string; trades: Trade[] } | null = null

function generate(now: Date): Trade[] {
  const rng = makeRng(20240517)
  const out: Trade[] = []
  let idx = 0

  for (let d = HISTORY_DAYS; d >= 0; d--) {
    const date = new Date(now)
    date.setDate(now.getDate() - d)
    const dow = date.getDay()
    if (dow === 0 || dow === 6) continue // no weekend trading
    if (rng() < 0.32) continue // some flat days

    const nTrades = 1 + Math.floor(rng() * 3) // 1–3 trades that day
    for (let k = 0; k < nTrades; k++) {
      const sym = SYMBOLS[Math.floor(rng() * SYMBOLS.length)]
      const direction: 'long' | 'short' = rng() < 0.72 ? 'long' : 'short'
      const qty = 10 + Math.floor(rng() * 90)

      const entry = new Date(date)
      entry.setHours(9 + Math.floor(rng() * 6), Math.floor(rng() * 60), 0, 0)
      const durationMin = 3 + Math.floor(rng() * 200)
      const exit = new Date(entry.getTime() + durationMin * 60_000)

      const win = rng() < 0.56
      const fees = round2(1 + rng() * 6)
      const magnitude = win ? 40 + rng() * 690 : 30 + rng() * 440
      const grossPnl = round2(win ? magnitude : -magnitude)
      const netPnl = round2(grossPnl - fees)

      const entryPrice = round2(sym.price * (0.9 + rng() * 0.2))
      const dir = direction === 'long' ? 1 : -1
      const exitPrice = round2(entryPrice + (grossPnl / qty) * dir)

      const riskAmount = round2(80 + rng() * 240)
      // Planned reward-to-risk, matching the 2R target set below. (The realized
      // R-multiple is derived from netPnl / riskAmount, it is not stored.)
      const rr = 2
      const stopLoss = round2(direction === 'long' ? entryPrice - riskAmount / qty : entryPrice + riskAmount / qty)
      const takeProfit = round2(
        direction === 'long' ? entryPrice + (riskAmount * 2) / qty : entryPrice - (riskAmount * 2) / qty,
      )

      out.push({
        id: `demo-${String(idx).padStart(4, '0')}`,
        userId: 'demo',
        accountId: null,
        strategyId: null,
        symbol: sym.s,
        direction,
        status: 'closed',
        assetClass: 'stocks',
        entryPrice: String(entryPrice),
        entryQuantity: String(qty),
        entryDatetime: entry,
        exitPrice: String(exitPrice),
        exitQuantity: String(qty),
        exitDatetime: exit,
        fees: String(fees),
        grossPnl: String(grossPnl),
        netPnl: String(netPnl),
        stopLoss: String(stopLoss),
        takeProfit: String(takeProfit),
        riskRewardRatio: String(rr),
        riskAmount: String(riskAmount),
        checklistProgress: null,
        setupName: SETUPS[Math.floor(rng() * SETUPS.length)],
        notes: null,
        rating: Math.round((2 + rng() * 3) * 2) / 2,
        emotionBefore: null,
        emotionAfter: null,
        mistakes: null,
        lessons: null,
        importSource: 'demo',
        externalId: null,
        extra: null,
        createdAt: entry,
        updatedAt: exit,
      })
      idx++
    }
  }

  return out
}

/** Deterministic demo trades, anchored to today and cached per calendar day. */
export function getDemoTrades(): Trade[] {
  const now = new Date()
  const dayKey = now.toISOString().slice(0, 10)
  if (cache && cache.day === dayKey) return cache.trades
  const trades = generate(now)
  cache = { day: dayKey, trades }
  return trades
}
