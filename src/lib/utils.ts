import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { getFormats, getUiLocale } from '@/i18n/config'

// ─── Tailwind merge helper ────────────────────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculatePnl(
  direction: 'long' | 'short',
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  fees: number = 0,
): { grossPnl: number; netPnl: number } {
  let grossPnl: number

  if (direction === 'long') {
    grossPnl = (exitPrice - entryPrice) * quantity
  } else {
    grossPnl = (entryPrice - exitPrice) * quantity
  }

  const netPnl = grossPnl - fees
  return { grossPnl, netPnl }
}

export function calculateRR(
  direction: 'long' | 'short',
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
): number | null {
  const risk = Math.abs(entryPrice - stopLoss)
  const reward = Math.abs(takeProfit - entryPrice)
  if (risk === 0) return null
  return reward / risk
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat(getUiLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Percentage with up to 2 decimals: whole numbers drop the decimals
// (100 → "100%"), fractional values keep them (99.5 → "99.50%").
export function formatPctSmart(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)}%`
}

// ─── Display unit ($ / R-multiple) ────────────────────────────────────────────
export type DisplayUnit = 'dollar' | 'r'

export function formatUnit(value: number, unit: DisplayUnit, currency = 'USD'): string {
  if (unit === 'r') return `${value < 0 ? '-' : ''}${Math.abs(value).toFixed(2)}R`
  return formatCurrency(value, currency)
}

// Whole-number variant (no decimals) for headline figures like the Net P&L widget.
export function formatUnitWhole(value: number, unit: DisplayUnit, currency = 'USD'): string {
  if (unit === 'r') return `${value < 0 ? '-' : ''}${Math.round(Math.abs(value))}R`
  return new Intl.NumberFormat(getUiLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function compactUnit(value: number, unit: DisplayUnit, currency = 'USD'): string {
  const sign = value < 0 ? '-' : ''
  const a = Math.abs(value)
  if (unit === 'r') return `${sign}${a.toFixed(a >= 100 ? 0 : 1)}R`
  const sym = currency === 'EUR' ? '€' : '$'
  if (a >= 1000) return `${sign}${sym}${(a / 1000).toFixed(1)}K`
  return `${sign}${sym}${a.toFixed(0)}`
}

export function axisUnit(value: number, unit: DisplayUnit): string {
  const sign = value < 0 ? '-' : ''
  const a = Math.abs(value)
  if (unit === 'r') return `${sign}${a.toFixed(a >= 10 ? 0 : 1)}R`
  return `${sign}$${a >= 1000 ? (a / 1000).toFixed(1) + 'k' : a.toFixed(0)}`
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat(getUiLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatDate(date: Date | string, fmt?: string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  const f = getFormats()
  return format(d, fmt ?? f.dateFormat, { locale: f.dateFnsLocale })
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  const f = getFormats()
  return format(d, f.dateTimeFormat, { locale: f.dateFnsLocale })
}

function partsInTz(d: Date, tz: string | null | undefined): Record<string, string> {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>
  if (p.hour === '24') p.hour = '00'
  return p
}

// Build a "wall clock" Date from the calendar parts as seen in `tz`, so the
// shared locale-aware formatters render the timezone-correct date.
function wallClockInTz(d: Date, tz: string): Date {
  const p = partsInTz(d, tz)
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
}

export function formatDateTz(date: Date | string, tz?: string | null): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!tz) return formatDate(date)
  return formatDate(wallClockInTz(d, tz))
}

export function formatDateTimeTz(date: Date | string, tz?: string | null): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  if (!tz) return formatDateTime(date)
  return formatDateTime(wallClockInTz(d, tz))
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

export function calcWinRate(wins: number, total: number): number {
  if (total === 0) return 0
  return (wins / total) * 100
}

export function calcProfitFactor(grossProfit: number, grossLoss: number): number {
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0
  return Math.abs(grossProfit / grossLoss)
}

export function calcMaxDrawdown(pnlSeries: number[]): number {
  let peak = -Infinity
  let maxDD = 0
  let cumulative = 0

  for (const pnl of pnlSeries) {
    cumulative += pnl
    if (cumulative > peak) peak = cumulative
    const dd = peak - cumulative
    if (dd > maxDD) maxDD = dd
  }

  return maxDD
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export function getPnlColor(value: number): string {
  if (value > 0) return 'text-profit'
  if (value < 0) return 'text-loss'
  return 'text-muted-foreground'
}

export function getPnlBg(value: number): string {
  if (value > 0) return 'bg-profit/10 text-profit'
  if (value < 0) return 'bg-loss/10 text-loss'
  return 'bg-muted text-muted-foreground'
}
