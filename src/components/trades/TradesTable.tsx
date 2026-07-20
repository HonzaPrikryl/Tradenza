'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatCurrency, formatDateTimeTz, cn } from '@/lib/utils'
import { realizedR, formatR } from '@/lib/r-multiple'
import { deleteTrade, deleteTrades, addTagToTrades, setTradesAccount, getFilteredTradeIds } from '@/lib/actions/trades'
import { setTradesStrategy, type StrategyDTO } from '@/lib/actions/strategies'
import { createTag, createTagGroup, type TagGroupWithValues } from '@/lib/actions/tags'
import { exportTradesToCsv } from '@/lib/actions/export'
import { track } from '@/lib/analytics'
import Link from 'next/link'
import { Trash2, ExternalLink, Download, Tag, ArrowRightLeft, BookMarked } from 'lucide-react'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { t, tRich } from '@/i18n'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import Select from '@/components/ui/Select'
import ComboCreate, { type ComboOption } from '@/components/ui/ComboCreate'
import Pagination from '@/components/ui/Pagination'
import BulkModal from '@/components/trades/BulkModal'
import ActionMenu from '@/components/ui/ActionMenu'
import SortableTh from '@/components/ui/SortableTh'
import {
  Table,
  TableBody,
  TableCell,
  TableCheckbox,
  TableHead,
  TableHeadRow,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/Table'
import { useSelection } from '@/hooks/useSelection'
import { UNGROUPED_ID } from '@/lib/tags-constants'
import type { TradeFilters } from '@/types'
import type { Trade } from '@/lib/db'
import { classifyOutcome, tradeNotional, multiplierFor, type BreakevenConfig } from '@/lib/breakeven'

const PALETTE = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#64748b',
  '#84cc16',
]

/** Column definitions; `sortKey` marks the columns the server can sort by. */
const COLUMNS: { key: string; labelKey: string; sortKey?: string }[] = [
  { key: 'symbol', labelKey: 'trades.col.symbol' },
  { key: 'dir', labelKey: 'trades.col.dir' },
  { key: 'entry', labelKey: 'trades.col.entry' },
  { key: 'qty', labelKey: 'trades.col.qty' },
  { key: 'exit', labelKey: 'trades.col.exit' },
  { key: 'date', labelKey: 'trades.col.date', sortKey: 'entryDatetime' },
  { key: 'strategy', labelKey: 'trades.col.strategy' },
  { key: 'rmultiple', labelKey: 'trades.col.rmultiple', sortKey: 'rMultiple' },
  { key: 'pnl', labelKey: 'trades.col.pnl', sortKey: 'netPnl' },
]

type TradeRow = Trade & {
  tradeTags?: { tag: { id: string; name: string; color: string } }[]
  strategy?: { id: string; name: string; color: string } | null
}

interface Props {
  trades: TradeRow[]
  total: number
  page: number
  totalPages: number
  pageSize?: number
  currency?: string
  timezone?: string | null
  accounts?: { id: string; name: string }[]
  tagGroups?: TagGroupWithValues[]
  strategies?: StrategyDTO[]
  listFilters?: TradeFilters
  breakeven?: BreakevenConfig | null
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (column: string) => void
}

export default function TradesTable({
  trades,
  total,
  page,
  totalPages,
  pageSize = 25,
  currency = 'USD',
  timezone,
  accounts = [],
  tagGroups = [],
  strategies = [],
  listFilters = {},
  breakeven = null,
  sortBy,
  sortOrder,
  onSort,
}: Props) {
  const router = useRouter()
  const confirm = useConfirm()
  const searchParams = useSearchParams()

  const sel = useSelection()
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<'tag' | 'transfer' | 'strategy' | null>(null)
  const [dialogIds, setDialogIds] = useState<string[]>([])
  const [strategyId, setStrategyId] = useState('')
  const [groups, setGroups] = useState<TagGroupWithValues[]>(tagGroups)
  const [categoryId, setCategoryId] = useState('')
  const [tagId, setTagId] = useState('')
  const [accountId, setAccountId] = useState('')

  const tradeIds = trades.map((tr) => tr.id)
  const toggle = (id: string) => sel.toggle(id)
  const allChecked = sel.allSelected(tradeIds)
  const toggleAll = () => sel.toggleAll(tradeIds)
  const clearSel = () => sel.clear()

  const ids = () => sel.ids

  const allMatchingSelected = total > 0 && sel.size >= total
  const selectAllMatching = async () => {
    setBusy(true)
    try {
      const all = await getFilteredTradeIds(listFilters)
      sel.set(all)
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'trades.bulk.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string, symbol: string) => {
    const ok = await confirm({
      title: t('common.delete'),
      message: tRich('trades.confirmDelete', { symbol }),
      variant: 'delete',
    })
    if (!ok) return
    try {
      if (handleRateLimit(await deleteTrade(id))) return
      toast.success(t('trades.deleted'))
      router.refresh()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'trades.deleteFailed'))
    }
  }

  const bulkDelete = async () => {
    const count = sel.size
    const ok = await confirm({
      title: t('trades.bulk.confirmDeleteTitle'),
      message: tRich('trades.bulk.confirmDelete', { count }),
      variant: 'delete',
    })
    if (!ok) return
    setBusy(true)
    try {
      if (handleRateLimit(await deleteTrades(ids()))) return
      toast.success(t('trades.bulk.deletedMany', { count }))
      clearSel()
      router.refresh()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'trades.bulk.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const exportIds = async (targetIds: string[]) => {
    setBusy(true)
    try {
      const csv = await exportTradesToCsv(targetIds)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tradenza-export-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      track({ name: 'trades_exported', props: { count: targetIds.length || undefined } })
      toast.success(t('trades.bulk.exported'))
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'trades.bulk.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const openTag = (targetIds: string[]) => {
    setDialogIds(targetIds)
    setCategoryId('')
    setTagId('')
    setDialog('tag')
  }
  const openTransfer = (targetIds: string[]) => {
    setDialogIds(targetIds)
    setAccountId('')
    setDialog('transfer')
  }

  const applyTag = async () => {
    if (!tagId || dialogIds.length === 0) return
    const count = dialogIds.length
    setBusy(true)
    try {
      if (handleRateLimit(await addTagToTrades(dialogIds, tagId))) return
      toast.success(t('trades.bulk.tagged', { count }))
      setDialog(null)
      clearSel()
      router.refresh()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'trades.bulk.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const applyTransfer = async () => {
    if (!accountId || dialogIds.length === 0) return
    const count = dialogIds.length
    setBusy(true)
    try {
      if (handleRateLimit(await setTradesAccount(dialogIds, accountId))) return
      toast.success(t('trades.bulk.transferred', { count }))
      setDialog(null)
      clearSel()
      router.refresh()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'trades.bulk.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const openStrategy = (targetIds: string[]) => {
    setDialogIds(targetIds)
    setStrategyId('')
    setDialog('strategy')
  }

  const applyStrategy = async () => {
    if (!strategyId || dialogIds.length === 0) return
    const count = dialogIds.length
    const next = strategyId === '__none__' ? null : strategyId
    setBusy(true)
    try {
      if (handleRateLimit(await setTradesStrategy(dialogIds, next))) return
      toast.success(t('trades.bulk.strategySet', { count }))
      setDialog(null)
      clearSel()
      router.refresh()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'trades.bulk.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const rowMenuSelect = (trade: TradeRow, key: string) => {
    switch (key) {
      case 'open':
        window.open(`/trades/${trade.id}`, '_blank', 'noopener,noreferrer')
        break
      case 'export':
        exportIds([trade.id])
        break
      case 'tag':
        openTag([trade.id])
        break
      case 'transfer':
        openTransfer([trade.id])
        break
      case 'delete':
        handleDelete(trade.id, trade.symbol)
        break
    }
  }

  const realCategories = groups.filter((g) => g.id !== UNGROUPED_ID)
  const categoryOptions: ComboOption[] = realCategories.map((g) => ({
    value: g.id,
    label: g.name,
    dot: g.color,
  }))
  const currentCat = groups.find((g) => g.id === categoryId)
  const tagOptions: ComboOption[] = (currentCat?.values ?? []).map((v) => ({
    value: v.id,
    label: v.name,
    dot: v.color,
  }))

  const handleCreateCategory = async (name: string): Promise<ComboOption | null> => {
    try {
      const color = PALETTE[realCategories.length % PALETTE.length]
      const res = await createTagGroup({ name, color })
      if (handleRateLimit(res)) return null
      if (!res?.group) return null
      const g = res.group
      setGroups((prev) =>
        prev.some((x) => x.id === g.id) ? prev : [...prev, { id: g.id, name: g.name, color: g.color, values: [] }],
      )
      setCategoryId(g.id)
      setTagId('')
      return { value: g.id, label: g.name, dot: g.color }
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'trades.bulk.actionFailed'))
      return null
    }
  }

  const handleCreateTag = async (name: string): Promise<ComboOption | null> => {
    if (!currentCat) return null
    try {
      const res = await createTag({ name, color: currentCat.color, groupId: currentCat.id })
      if (handleRateLimit(res)) return null
      if (!res?.tag) return null
      const tag = res.tag
      setGroups((prev) =>
        prev.map((g) =>
          g.id === currentCat.id
            ? {
                ...g,
                values: g.values.some((v) => v.id === tag.id)
                  ? g.values
                  : [...g.values, { id: tag.id, name: tag.name, color: tag.color, groupId: g.id, tradeCount: 0 }],
              }
            : g,
        ),
      )
      return { value: tag.id, label: tag.name, dot: tag.color }
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'trades.bulk.actionFailed'))
      return null
    }
  }

  const hasActiveFilters = Array.from(searchParams.keys()).some((k) => k !== 'page')

  if (trades.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <p className="text-muted-foreground text-sm">{t('trades.empty')}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {hasActiveFilters ? t('trades.emptyFilters') : t('trades.emptyHint')}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Bulk actions bar */}
      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium">{t('trades.bulk.selected', { count: sel.size })}</span>
          <button onClick={clearSel} className="text-xs text-muted-foreground hover:text-foreground">
            {t('trades.bulk.clear')}
          </button>
          {allChecked &&
            total > trades.length &&
            (allMatchingSelected ? (
              <span className="text-xs text-muted-foreground">{t('trades.bulk.allMatchingSelected', { total })}</span>
            ) : (
              <button
                onClick={selectAllMatching}
                disabled={busy}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                {t('trades.bulk.selectAllMatching', { total })}
              </button>
            ))}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={() => exportIds(ids())}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {t('trades.bulk.exportCsv')}
            </button>
            <button
              onClick={() => openTag(ids())}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Tag className="h-3.5 w-3.5" />
              {t('trades.bulk.addTag')}
            </button>
            <button
              onClick={() => openTransfer(ids())}
              disabled={busy || accounts.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {t('trades.bulk.transfer')}
            </button>
            <button
              onClick={() => openStrategy(ids())}
              disabled={busy || strategies.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              <BookMarked className="h-3.5 w-3.5" />
              {t('trades.bulk.setStrategy')}
            </button>
            <button
              onClick={bulkDelete}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-loss/40 px-3 py-1.5 text-xs font-medium text-loss transition-colors hover:bg-loss/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('trades.bulk.delete')}
            </button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableHeadRow className="bg-transparent">
                <TableHeaderCell className="w-10">
                  <TableCheckbox checked={allChecked} onChange={toggleAll} label={t('common.selectAll')} />
                </TableHeaderCell>
                {COLUMNS.map((col) =>
                  col.sortKey && onSort ? (
                    <SortableTh
                      key={col.key}
                      label={t(col.labelKey)}
                      column={col.sortKey}
                      activeColumn={sortBy ?? ''}
                      sortOrder={sortOrder ?? 'desc'}
                      onSort={onSort}
                    />
                  ) : (
                    <TableHeaderCell key={col.key} className="text-xs">
                      {t(col.labelKey)}
                    </TableHeaderCell>
                  ),
                )}
                <TableHeaderCell className="w-px px-3" />
              </TableHeadRow>
            </TableHead>
            <TableBody className="divide-y divide-border">
              {trades.map((trade) => {
                const pnl = Number(trade.netPnl ?? 0)
                const outcome = classifyOutcome(
                  pnl,
                  breakeven,
                  tradeNotional(
                    Number(trade.entryPrice ?? 0),
                    Number(trade.entryQuantity ?? 0),
                    multiplierFor(trade.extra, trade.symbol, trade.assetClass),
                  ),
                )
                const isSel = sel.has(trade.id)
                return (
                  <TableRow
                    key={trade.id}
                    interactive
                    selected={isSel}
                    onClick={() => router.push(`/trades/${trade.id}`)}
                    className="group border-0"
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <TableCheckbox checked={isSel} onChange={() => toggle(trade.id)} label={t('common.selectRow')} />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono font-medium">{trade.symbol}</span>
                      {trade.tradeTags && trade.tradeTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {trade.tradeTags.map(({ tag }) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center gap-1 text-[10px] leading-none px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded font-medium uppercase',
                          trade.direction === 'long' ? 'badge-profit' : 'badge-loss',
                        )}
                      >
                        {trade.direction}
                      </span>
                    </TableCell>
                    <TableCell className="tabular text-xs">{Number(trade.entryPrice).toFixed(4)}</TableCell>
                    <TableCell className="tabular text-xs">{Number(trade.entryQuantity).toFixed(2)}</TableCell>
                    <TableCell className="tabular text-xs">
                      {trade.exitPrice ? (
                        Number(trade.exitPrice).toFixed(4)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTimeTz(trade.entryDatetime, timezone)}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs text-muted-foreground">
                      {trade.strategy ? (
                        <Link
                          href={`/trades?strategyId=${trade.strategy.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate text-foreground hover:underline"
                        >
                          {trade.strategy.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular">
                      {formatR(realizedR(trade.netPnl, trade.riskAmount))}
                    </TableCell>
                    <TableCell>
                      {trade.netPnl !== null ? (
                        <span
                          className={cn(
                            'tabular font-medium text-sm',
                            outcome === 'win' ? 'text-profit' : outcome === 'loss' ? 'text-loss' : 'text-breakeven',
                          )}
                        >
                          {formatCurrency(pnl, currency)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="w-px whitespace-nowrap px-3" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        icon="horizontal"
                        width={176}
                        items={[
                          { key: 'open', label: t('trades.openNewTab'), icon: ExternalLink },
                          { key: 'export', label: t('trades.bulk.exportCsv'), icon: Download },
                          { key: 'tag', label: t('trades.bulk.addTag'), icon: Tag },
                          { key: 'transfer', label: t('trades.bulk.transfer'), icon: ArrowRightLeft },
                          { key: 'delete', label: t('trades.bulk.delete'), icon: Trash2, danger: true },
                        ]}
                        onSelect={(k) => rowMenuSelect(trade, k)}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} />
      </div>

      {/* Add-tag dialog */}
      {dialog === 'tag' && (
        <BulkModal
          title={t('trades.bulk.addTagTitle', { count: sel.size })}
          onClose={() => setDialog(null)}
          onApply={applyTag}
          applyDisabled={!tagId || busy}
        >
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t('trades.bulk.category')}
            </label>
            <ComboCreate
              value={categoryId}
              onChange={(v) => {
                setCategoryId(v)
                setTagId('')
              }}
              options={categoryOptions}
              onCreate={handleCreateCategory}
              placeholder={t('trades.bulk.selectCategory')}
              createLabel={(name) => t('trades.bulk.createCategory', { name })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('trades.bulk.tag')}</label>
            <ComboCreate
              value={tagId}
              onChange={setTagId}
              options={tagOptions}
              onCreate={handleCreateTag}
              placeholder={t('trades.bulk.selectTag')}
              createLabel={(name) => t('trades.bulk.createTag', { name })}
              disabled={!categoryId}
            />
          </div>
        </BulkModal>
      )}

      {/* Transfer dialog */}
      {dialog === 'transfer' && (
        <BulkModal
          title={t('trades.bulk.transferTitle', { count: sel.size })}
          onClose={() => setDialog(null)}
          onApply={applyTransfer}
          applyDisabled={!accountId || busy}
        >
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('trades.bulk.account')}</label>
            <Select
              value={accountId}
              onValueChange={setAccountId}
              placeholder={t('trades.bulk.selectAccount')}
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          </div>
        </BulkModal>
      )}

      {/* Set-strategy dialog */}
      {dialog === 'strategy' && (
        <BulkModal
          title={t('trades.bulk.setStrategyTitle', { count: sel.size })}
          onClose={() => setDialog(null)}
          onApply={applyStrategy}
          applyDisabled={!strategyId || busy}
        >
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t('trades.bulk.strategy')}
            </label>
            <Select
              value={strategyId}
              onValueChange={setStrategyId}
              placeholder={t('trades.bulk.selectStrategy')}
              options={[
                ...strategies.map((s) => ({ value: s.id, label: s.name })),
                { value: '__none__', label: t('strategies.panel.none') },
              ]}
            />
          </div>
        </BulkModal>
      )}
    </div>
  )
}
