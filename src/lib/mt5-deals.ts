// MetaTrader "Deals" → round-trip trades.
//
// MT4/MT5 history reports list every *deal* on its own row: one row opens size
// ("in"), another closes it ("out"), and only the closing row carries the
// profit. Imported as-is, every opening deal became its own closed trade worth
// $0.00, the "Direction" column (in/out) was mapped as the trade side and read as
// nothing — so every trade fell back to long — and win rate was diluted by the
// zero rows.
//
// This turns such a table into the round-trip shape the trade importer already
// understands — one row per matched entry/exit chunk, with the broker's own
// profit preserved — before any column mapping happens. Chunks that share an
// opening deal are merged back into one trade by the importer's partial merge.

import { detectDecimalSeparator, parseNumber, parseBuySell } from './actions/wizard-helpers'
import { normalizeHeader } from './csv-columns'
import { roundMoney } from './trade-pnl'

type Row = Record<string, string>

// Volumes are lot fractions (0.01); float subtraction leaves dust behind.
const EPS = 1e-9

const findHeader = (headers: string[], ...names: string[]) => {
  const wanted = names.map((n) => normalizeHeader(n).norm)
  return headers.find((h) => wanted.includes(normalizeHeader(h).norm))
}

const dealDirection = (v: string | undefined): 'in' | 'out' | 'inout' | null => {
  const s = (v ?? '').trim().toLowerCase().replace(/\s+/g, '')
  if (s === 'in') return 'in'
  if (s === 'out') return 'out'
  if (s === 'in/out' || s === 'inout' || s === 'out/in') return 'inout'
  return null
}

interface DealColumns {
  symbol: string
  type: string
  direction: string
  volume: string
  price: string
  time: string
  commission?: string
  fee?: string
  swap?: string
  profit?: string
  comment?: string
}

/**
 * The MT deal columns, or null when the table is not a deal list. The decisive
 * signal is a column holding nothing but in/out values with both present — a
 * header name alone ("Direction") is too common to trust.
 */
export function detectDealColumns(headers: string[], rows: Row[]): DealColumns | null {
  const direction = headers.find((h) => {
    let ins = 0
    let outs = 0
    for (const r of rows) {
      const v = (r[h] ?? '').trim()
      if (!v) continue
      const d = dealDirection(v)
      if (d === null) return false
      if (d === 'in') ins++
      if (d !== 'in') outs++
    }
    return ins > 0 && outs > 0
  })
  if (!direction) return null

  const symbol = findHeader(headers, 'symbol')
  const type = findHeader(headers, 'type')
  const volume = findHeader(headers, 'volume', 'lots', 'size')
  const price = findHeader(headers, 'price')
  const time = findHeader(headers, 'time', 'date/time', 'datetime')
  if (!symbol || !type || !volume || !price || !time) return null

  return {
    symbol,
    type,
    direction,
    volume,
    price,
    time,
    commission: findHeader(headers, 'commission'),
    fee: findHeader(headers, 'fee'),
    swap: findHeader(headers, 'swap'),
    profit: findHeader(headers, 'profit'),
    comment: findHeader(headers, 'comment'),
  }
}

interface OpenLot {
  side: 'buy' | 'sell'
  time: string
  price: number
  /** Size still open. */
  remaining: number
  /** Size at open — the base for apportioning the opening commission. */
  volume: number
  costs: number
  comment: string
}

export const MT_DEAL_HEADERS = [
  'Symbol',
  'Type',
  'Volume',
  'Entry Price',
  'Entry Time',
  'Exit Price',
  'Exit Time',
  'Fees',
  'Gross P&L',
  'Net P&L',
  'Comment',
] as const

/**
 * Pair in/out deals FIFO per symbol into round-trip rows. Rows are taken in file
 * order (MT reports are chronological), so dates never need parsing here.
 * Balance, credit and other non-trade rows are dropped. Opening size that never
 * closes comes out as an open trade.
 */
export function pairMtDeals(rows: Row[], c: DealColumns): Row[] {
  const decimal = detectDecimalSeparator(
    rows.flatMap((r) => [c.volume, c.price, c.commission, c.fee, c.swap, c.profit].map((h) => (h ? r[h] : undefined))),
  )
  const num = (r: Row, h?: string) => (h ? (parseNumber(r[h], decimal) ?? 0) : 0)
  const fmt = (n: number) => String(roundMoney(n))

  const open = new Map<string, OpenLot[]>()
  const out: Row[] = []

  const emit = (
    symbol: string,
    lot: OpenLot,
    qty: number,
    exit?: { price: number; time: string; profit: number; costs: number },
  ) => {
    const entryCosts = lot.volume > 0 ? (lot.costs * qty) / lot.volume : 0
    const costs = entryCosts + (exit?.costs ?? 0)
    const gross = exit?.profit ?? 0
    out.push({
      Symbol: symbol,
      Type: lot.side,
      Volume: fmt(qty),
      'Entry Price': fmt(lot.price),
      'Entry Time': lot.time,
      'Exit Price': exit ? fmt(exit.price) : '',
      'Exit Time': exit?.time ?? '',
      // Commission and fees are negative in MT reports; swap can be either.
      Fees: fmt(Math.max(0, -costs)),
      'Gross P&L': exit ? fmt(gross) : '',
      'Net P&L': exit ? fmt(gross + costs) : '',
      Comment: lot.comment,
    })
  }

  for (const r of rows) {
    const symbol = (r[c.symbol] ?? '').trim().toUpperCase()
    const side = parseBuySell(r[c.type])
    const dir = dealDirection(r[c.direction])
    const volume = num(r, c.volume)
    if (!symbol || !side || !dir || volume <= 0) continue

    const price = num(r, c.price)
    const time = (r[c.time] ?? '').trim()
    const costs = num(r, c.commission) + num(r, c.fee) + num(r, c.swap)
    const profit = num(r, c.profit)
    const lots = open.get(symbol) ?? []

    let toOpen = dir === 'in' ? volume : 0
    if (dir !== 'in') {
      // An exit deal closes the oldest opposite-side size first. The deal's
      // profit belongs to what it closed; its costs are split by volume.
      const closable = lots.filter((l) => l.side !== side)
      const closing = Math.min(
        volume,
        closable.reduce((s, l) => s + l.remaining, 0),
      )
      let left = closing
      for (const lot of closable) {
        if (left <= EPS) break
        const qty = Math.min(lot.remaining, left)
        emit(symbol, lot, qty, { price, time, profit: (profit * qty) / closing, costs: (costs * qty) / volume })
        lot.remaining -= qty
        left -= qty
      }
      // In/out is a netting-account reversal: whatever the deal did not close
      // opens a new position the other way. A bare "out" with nothing to close
      // (history starting mid-position) has no entry to pair with and is dropped.
      if (dir === 'inout') toOpen = volume - closing
    }
    if (toOpen > EPS) {
      lots.push({
        side,
        time,
        price,
        remaining: toOpen,
        volume: toOpen,
        costs: (costs * toOpen) / volume,
        comment: c.comment ? (r[c.comment] ?? '').trim() : '',
      })
    }
    open.set(
      symbol,
      lots.filter((l) => l.remaining > EPS),
    )
  }

  for (const [symbol, lots] of open) for (const lot of lots) emit(symbol, lot, lot.remaining)
  return out
}

/**
 * Rewrite a MetaTrader deal list into round-trip rows; any other table passes
 * through untouched. `converted` lets the UI say what happened.
 */
export function normalizeMtDeals(table: { headers: string[]; rows: Row[] }): {
  headers: string[]
  rows: Row[]
  converted: boolean
} {
  const cols = detectDealColumns(table.headers, table.rows)
  if (!cols) return { ...table, converted: false }
  return { headers: [...MT_DEAL_HEADERS], rows: pairMtDeals(table.rows, cols), converted: true }
}
