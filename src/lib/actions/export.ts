'use server'

import { db, trades } from '@/lib/db'
import { and, eq, inArray } from 'drizzle-orm'
import { uuidArray } from '@/lib/validation'
import { authedAction } from '@/lib/safe-action'

// ─── Export to CSV ────────────────────────────────────────────────────────────

export const exportTradesToCsv = authedAction([uuidArray.optional()], async ({ userId }, ids): Promise<string> => {
  const rows = await db.query.trades.findMany({
    where: ids && ids.length > 0 ? and(eq(trades.userId, userId), inArray(trades.id, ids)) : eq(trades.userId, userId),
    orderBy: (t, { asc }) => [asc(t.entryDatetime)],
  })

  const headers = [
    'Symbol',
    'Side',
    'Qty',
    'Entry Price',
    'Exit Price',
    'Entry Time',
    'Exit Time',
    'Gross P&L',
    'Net P&L',
    'Commission',
    'Setup',
    'Notes',
    'Rating',
  ]

  const escape = (v: string | null | undefined) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const csvRows = rows.map((t) =>
    [
      escape(t.symbol),
      escape(t.direction === 'long' ? 'Buy' : 'Sell'),
      escape(t.entryQuantity),
      escape(t.entryPrice),
      escape(t.exitPrice),
      escape(t.entryDatetime.toISOString()),
      escape(t.exitDatetime?.toISOString()),
      escape(t.grossPnl),
      escape(t.netPnl),
      escape(t.fees),
      escape(t.setupName),
      escape(t.notes),
      escape(t.rating?.toString()),
    ].join(','),
  )

  return [headers.join(','), ...csvRows].join('\n')
})
