'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatCurrency, formatDateTimeTz, cn } from '@/lib/utils'
import { deleteTrade, deleteTrades, addTagToTrades, setTradesAccount, getFilteredTradeIds } from '@/lib/actions/trades'
import { createTag, createTagGroup, type TagGroupWithValues } from '@/lib/actions/tags'
import { exportTradesToCsv } from '@/lib/actions/export'
import { Trash2, ExternalLink, Download, Tag, ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import { t, tRich } from '@/i18n'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import Select from '@/components/ui/Select'
import ComboCreate, { type ComboOption } from '@/components/ui/ComboCreate'
import Pagination from '@/components/ui/Pagination'
import BulkModal from '@/components/trades/BulkModal'
import ActionMenu from '@/components/ui/ActionMenu'
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

type TradeRow = Trade & {
  tradeTags?: { tag: { id: string; name: string; color: string } }[]
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
  listFilters?: TradeFilters
  breakeven?: BreakevenConfig | null
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
  listFilters = {},
  breakeven = null,
}: Props) {
  const router = useRouter()
  const confirm = useConfirm()
  const searchParams = useSearchParams()

  const sel = useSelection()
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<'tag' | 'transfer' | null>(null)
  const [dialogIds, setDialogIds] = useState<string[]>([])
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
    } catch {
      toast.error(t('trades.bulk.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string, symbol: string) => {
    const ok = await confirm({
      title: t('common.delete'),
      message: tRich('trades.confirmDelete', { symbol }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteTrade(id)
      toast.success(t('trades.deleted'))
      router.refresh()
    } catch {
      toast.error(t('trades.deleteFailed'))
    }
  }

  const bulkDelete = async () => {
    const count = sel.size
    const ok = await confirm({
      title: t('trades.bulk.confirmDeleteTitle'),
      message: tRich('trades.bulk.confirmDelete', { count }),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await deleteTrades(ids())
      toast.success(t('trades.bulk.deletedMany', { count }))
      clearSel()
      router.refresh()
    } catch {
      toast.error(t('trades.bulk.actionFailed'))
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
      toast.success(t('trades.bulk.exported'))
    } catch {
      toast.error(t('trades.bulk.actionFailed'))
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
      await addTagToTrades(dialogIds, tagId)
      toast.success(t('trades.bulk.tagged', { count }))
      setDialog(null)
      clearSel()
      router.refresh()
    } catch {
      toast.error(t('trades.bulk.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const applyTransfer = async () => {
    if (!accountId || dialogIds.length === 0) return
    const count = dialogIds.length
    setBusy(true)
    try {
      await setTradesAccount(dialogIds, accountId)
      toast.success(t('trades.bulk.transferred', { count }))
      setDialog(null)
      clearSel()
      router.refresh()
    } catch {
      toast.error(t('trades.bulk.actionFailed'))
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
      if (!res?.group) return null
      const g = res.group
      setGroups((prev) =>
        prev.some((x) => x.id === g.id) ? prev : [...prev, { id: g.id, name: g.name, color: g.color, values: [] }],
      )
      setCategoryId(g.id)
      setTagId('')
      return { value: g.id, label: g.name, dot: g.color }
    } catch {
      toast.error(t('trades.bulk.actionFailed'))
      return null
    }
  }

  const handleCreateTag = async (name: string): Promise<ComboOption | null> => {
    if (!currentCat) return null
    try {
      const res = await createTag({ name, color: currentCat.color, groupId: currentCat.id })
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
    } catch {
      toast.error(t('trades.bulk.actionFailed'))
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-10 px-4 py-3 text-left">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-primary" />
                </th>
                {[
                  t('trades.col.symbol'),
                  t('trades.col.dir'),
                  t('trades.col.entry'),
                  t('trades.col.qty'),
                  t('trades.col.exit'),
                  t('trades.col.date'),
                  t('trades.col.setup'),
                  t('trades.col.pnl'),
                ].map((h, i) => (
                  <th key={i} className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                    {h}
                  </th>
                ))}
                <th className="w-px px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {trades.map((trade) => {
                const pnl = Number(trade.netPnl ?? 0)
                const outcome = classifyOutcome(
                  pnl,
                  breakeven,
                  tradeNotional(
                    Number(trade.entryPrice ?? 0),
                    Number(trade.entryQuantity ?? 0),
                    multiplierFor(trade.extra, trade.symbol),
                  ),
                )
                const isSel = sel.has(trade.id)
                return (
                  <tr
                    key={trade.id}
                    onClick={() => router.push(`/trades/${trade.id}`)}
                    className={cn(
                      'cursor-pointer transition-colors group',
                      isSel ? 'bg-primary/5' : 'hover:bg-accent/40',
                    )}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggle(trade.id)}
                        className="accent-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded font-medium uppercase',
                          trade.direction === 'long' ? 'badge-profit' : 'badge-loss',
                        )}
                      >
                        {trade.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular text-xs">{Number(trade.entryPrice).toFixed(4)}</td>
                    <td className="px-4 py-3 tabular text-xs">{Number(trade.entryQuantity).toFixed(2)}</td>
                    <td className="px-4 py-3 tabular text-xs">
                      {trade.exitPrice ? (
                        Number(trade.exitPrice).toFixed(4)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTimeTz(trade.entryDatetime, timezone)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px] truncate">
                      {trade.setupName ?? '—'}
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
                    <td className="w-px whitespace-nowrap px-3 py-3" onClick={(e) => e.stopPropagation()}>
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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
    </div>
  )
}
