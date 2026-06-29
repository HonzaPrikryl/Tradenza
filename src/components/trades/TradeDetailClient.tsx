'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { formatDateTz, cn } from '@/lib/utils'
import { deleteTrade } from '@/lib/actions/trades'
import { getTradeCandles, type CandlesResult } from '@/lib/actions/candles'
import type { TagGroupWithValues } from '@/lib/actions/tags'
import TradeStatsPanel from './detail/TradeStatsPanel'
import TradeTagsPanel from './detail/TradeTagsPanel'
import NotesTabs from './detail/NotesTabs'
import { normalizeExecutions } from './detail/executions'
import { toast } from 'sonner'
import { t, tRich } from '@/i18n'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import ErrorBoundary from '@/components/ErrorBoundary'
import type { Trade } from '@/lib/db'

// Client-only: lightweight-charts needs the DOM
const TradeChart = dynamic(() => import('./detail/TradeChart'), { ssr: false })

interface Props {
  trade: Trade & {
    tradeTags: { tag: { id: string; name: string; color: string } }[]
    screenshots: { id: string; url: string; label: string | null }[]
    account?: { id: string; name: string } | null
  }
  tagGroups: TagGroupWithValues[]
  timezone?: string | null
  dayKey: string
  dailyNote: string
}

export default function TradeDetailClient({ trade, tagGroups, timezone, dayKey, dailyNote }: Props) {
  const router = useRouter()
  const confirm = useConfirm()
  const [sidebarTab, setSidebarTab] = useState<'stats' | 'executions'>('stats')

  const executions = useMemo(() => normalizeExecutions(trade), [trade])
  const selectedTagIds = useMemo(() => trade.tradeTags.map(({ tag }) => tag.id), [trade.tradeTags])

  const [candles, setCandles] = useState<CandlesResult | null>(null)
  useEffect(() => {
    let cancelled = false
    setCandles(null)
    getTradeCandles(trade.id)
      .then((r) => !cancelled && setCandles(r))
      .catch(() => !cancelled && setCandles({ status: 'error' }))
    return () => {
      cancelled = true
    }
  }, [trade.id])

  const handleDelete = async () => {
    const ok = await confirm({
      title: t('trades.detail.deleteTitle'),
      message: tRich('trades.detail.confirmDelete', {
        symbol: trade.symbol,
        date: formatDateTz(trade.entryDatetime, timezone),
      }),
      confirmLabel: t('trades.detail.deleteConfirm'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteTrade(trade.id)
      toast.success(t('trades.detail.deleted'))
      router.push('/trades')
    } catch {
      toast.error(t('trades.detail.deleteFailed'))
    }
  }

  return (
    <div className="p-4 lg:p-6 animate-in">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/trades"
            aria-label={t('trades.detail.breadcrumb')}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <h1 className="text-xl font-semibold font-mono">{trade.symbol}</h1>
          <span className="text-sm text-muted-foreground">{formatDateTz(trade.entryDatetime, timezone)}</span>
          <span
            className={cn(
              'rounded px-2 py-0.5 text-xs font-medium uppercase',
              trade.direction === 'long' ? 'badge-profit' : 'badge-loss',
            )}
          >
            {trade.direction}
          </span>
          {trade.account && (
            <span className="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {trade.account.name}
            </span>
          )}
          {trade.status === 'open' && (
            <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
              {t('trades.detail.statusOpen')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            aria-label={t('trades.detail.deleteTitle')}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-loss/30 hover:text-loss"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <aside className="w-full shrink-0 space-y-4 xl:w-[340px]">
          <TradeStatsPanel
            trade={trade}
            executions={executions}
            accountName={trade.account?.name ?? null}
            candlesResult={candles}
            tab={sidebarTab}
            onTabChange={setSidebarTab}
            timezone={timezone}
          />
          {sidebarTab === 'stats' && (
            <TradeTagsPanel tradeId={trade.id} groups={tagGroups} selectedTagIds={selectedTagIds} />
          )}
        </aside>

        <section className="w-full min-w-0 flex-1 space-y-4">
          <div className="h-[480px] rounded-xl border border-border bg-card p-2 lg:h-[560px]">
            <ErrorBoundary label={t('error.chart')}>
              <TradeChart executions={executions} result={candles} />
            </ErrorBoundary>
          </div>
          <NotesTabs tradeId={trade.id} initialNotes={trade.notes} date={dayKey} initialDailyNote={dailyNote} />
        </section>
      </div>
    </div>
  )
}
