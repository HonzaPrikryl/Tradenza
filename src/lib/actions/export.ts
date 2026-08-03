'use server'

import { db, trades } from '@/lib/db'
import { and, eq, inArray } from 'drizzle-orm'
import { uuidArray } from '@/lib/validation'
import { authedAction } from '@/lib/safe-action'
import { realizedR } from '@/lib/r-multiple'

// ─── Export to CSV ────────────────────────────────────────────────────────────

function adherence(
  progress: { entry: string[]; exit: string[] } | null,
  entryChecklist: string[] | null,
  exitChecklist: string[] | null,
): { entry: string; exit: string } {
  const fmt = (ticked: string[] | undefined, all: string[] | null) => {
    if (!all || all.length === 0) return ''
    const live = (ticked ?? []).filter((t) => all.includes(t))
    return `${live.length}/${all.length}`
  }
  return { entry: fmt(progress?.entry, entryChecklist), exit: fmt(progress?.exit, exitChecklist) }
}

export const exportTradesToCsv = authedAction([uuidArray.optional()], async ({ userId }, ids): Promise<string> => {
  const rows = await db.query.trades.findMany({
    where: ids && ids.length > 0 ? and(eq(trades.userId, userId), inArray(trades.id, ids)) : eq(trades.userId, userId),
    orderBy: (t, { asc }) => [asc(t.entryDatetime)],
    with: {
      strategy: { columns: { name: true, entryChecklist: true, exitChecklist: true } },
      account: { columns: { name: true } },
      tradeTags: { with: { tag: { columns: { name: true } } } },
    },
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
    'Stop Loss',
    'Take Profit',
    'Risk Amount',
    'R Multiple',
    'Strategy',
    'Entry Adherence',
    'Exit Adherence',
    'Account',
    'Tags',
    'Rating',
    'Notes',
    'Emotion Before',
    'Emotion After',
    'Mistakes',
    'Lessons',
  ]

  const escape = (v: string | null | undefined) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const csvRows = rows.map((t) => {
    const adh = adherence(t.checklistProgress, t.strategy?.entryChecklist ?? null, t.strategy?.exitChecklist ?? null)
    const r = realizedR(t.netPnl, t.riskAmount)
    return [
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
      escape(t.stopLoss),
      escape(t.takeProfit),
      escape(t.riskAmount),
      escape(r === null ? '' : r.toFixed(4)),
      escape(t.strategy?.name),
      escape(adh.entry),
      escape(adh.exit),
      escape(t.account?.name),
      escape(t.tradeTags.map((tt) => tt.tag.name).join('; ')),
      escape(t.rating?.toString()),
      escape(t.notes),
      escape(t.emotionBefore),
      escape(t.emotionAfter),
      escape(t.mistakes),
      escape(t.lessons),
    ].join(',')
  })

  return [headers.join(','), ...csvRows].join('\n')
})
