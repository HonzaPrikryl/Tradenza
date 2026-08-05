'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { Pencil, Check, X, Trash2, Plus } from 'lucide-react'
import { cn, formatCurrency, formatDateTime } from '@/lib/utils'
import { t, tRich } from '@/i18n'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useSelection } from '@/hooks/useSelection'
import { updateTradeExecutions } from '@/lib/actions/trades'
import { editorDefaultMultiplier } from '@/lib/futures'
import DateTimeField from '@/components/ui/DateTimeField'
import { positionState, storedMultiplier, type NormalizedExecution } from './executions'
import type { Trade } from '@/lib/db'

const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? 0 : n
}
const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const fromUnix = (sec: number) => toLocalInput(new Date(sec * 1000))

interface Row {
  id: string
  datetime: string
  side: 'buy' | 'sell'
  qty: string
  price: string
  comm: string
  fee: string
}

let _idc = 0
const mkId = () => `e${_idc++}`

const cellCls =
  'w-full rounded-md border border-border bg-input/40 px-2 py-1.5 text-sm tabular focus:border-primary focus:outline-none'
const miniLabel = 'mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground'

const positionOf = (rows: Row[]) =>
  positionState(rows.map((r) => ({ time: new Date(r.datetime).getTime(), side: r.side, quantity: num(r.qty) })))

export default function ExecutionsEditor({ trade, executions }: { trade: Trade; executions: NormalizedExecution[] }) {
  const router = useRouter()
  const confirm = useConfirm()

  const [rows, setRows] = useState<Row[]>(() =>
    executions.map((e) => ({
      id: mkId(),
      datetime: fromUnix(e.time),
      side: e.side,
      qty: String(e.quantity),
      price: String(e.price),
      comm: String(e.commission),
      fee: String(e.fee),
    })),
  )
  const initMult = storedMultiplier(trade) ?? editorDefaultMultiplier(trade.assetClass, trade.symbol)
  const [multiplier, setMultiplier] = useState<string>(initMult ? String(initMult) : '')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Row | null>(null)
  const [isNew, setIsNew] = useState(false)
  const sel = useSelection()
  const [saving, setSaving] = useState(false)

  const { entrySide, openQty } = useMemo(() => positionOf(rows), [rows])
  const isOpen = openQty > 0

  const projectedOpenQty = useMemo(() => {
    if (!draft) return openQty
    const next = isNew ? [...rows, draft] : rows.map((r) => (r.id === draft.id ? draft : r))
    return positionOf(next).openQty
  }, [draft, isNew, rows, openQty])

  const startEdit = (r: Row) => {
    setIsNew(false)
    setEditingId(r.id)
    setDraft({ ...r })
  }
  const cancelEdit = () => {
    setEditingId(null)
    setDraft(null)
    setIsNew(false)
  }
  const patch = (p: Partial<Row>) => setDraft((d) => (d ? { ...d, ...p } : d))

  const addRow = () => {
    const closingSide: 'buy' | 'sell' = entrySide === 'buy' ? 'sell' : 'buy'
    setIsNew(true)
    const id = mkId()
    setEditingId(id)
    setDraft({
      id,
      datetime: toLocalInput(new Date()),
      side: isOpen ? closingSide : entrySide,
      qty: isOpen ? String(openQty) : '',
      price: '',
      comm: '',
      fee: '',
    })
  }

  const toggleSel = (id: string) => sel.toggle(id)
  const rowIds = rows.map((r) => r.id)
  const allChecked = sel.allSelected(rowIds)
  const toggleAll = () => sel.toggleAll(rowIds)

  const persist = async (nextRows: Row[]) => {
    setSaving(true)
    try {
      const res = await updateTradeExecutions(trade.id, {
        contractMultiplier: num(multiplier) || undefined,
        executions: nextRows.map((r) => ({
          datetime: new Date(r.datetime).toISOString(),
          side: r.side,
          quantity: num(r.qty),
          price: num(r.price),
          commission: num(r.comm),
          fee: num(r.fee),
        })),
      })
      if (handleRateLimit(res)) return false
      setRows(nextRows)
      toast.success(t('trades.detail.exec.saved'))
      router.refresh()
      return true
    } catch (e) {
      toast.error(getActionErrorMessage(e, 'trades.detail.exec.saveError'))
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveRow = async () => {
    if (!draft) return
    if (!draft.datetime || isNaN(new Date(draft.datetime).getTime()) || num(draft.qty) <= 0 || num(draft.price) <= 0) {
      toast.error(t('trades.detail.exec.invalid'))
      return
    }
    const next = isNew
      ? [...rows, draft].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
      : rows.map((r) => (r.id === draft.id ? draft : r))
    if (await persist(next)) cancelEdit()
  }

  const deleteRow = async (r: Row) => {
    if (rows.length <= 1) {
      toast.error(t('trades.detail.exec.cannotDeleteLast'))
      return
    }
    const ok = await confirm({
      title: t('trades.detail.exec.delete'),
      message: tRich('trades.detail.exec.confirmDelete'),
      variant: 'delete',
    })
    if (!ok) return
    if (await persist(rows.filter((x) => x.id !== r.id))) {
      sel.remove(r.id)
      if (editingId === r.id) cancelEdit()
    }
  }

  const bulkDelete = async () => {
    if (sel.size === 0) return
    if (sel.size >= rows.length) {
      toast.error(t('trades.detail.exec.cannotDeleteLast'))
      return
    }
    const ok = await confirm({
      title: t('trades.detail.exec.delete'),
      message: tRich('trades.detail.exec.confirmDeleteSelected', { count: sel.size }),
      variant: 'delete',
    })
    if (!ok) return
    if (await persist(rows.filter((r) => !sel.has(r.id)))) sel.clear()
  }

  const grossPnl = trade.grossPnl !== null ? Number(trade.grossPnl) : null

  const editorForm = (onDelete?: () => void) => {
    if (!draft) return null
    return (
      <div className="rounded-md border border-primary/50 px-2.5 py-2.5 space-y-2">
        {isNew && (
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
            {t('trades.detail.exec.newTitle')}
          </p>
        )}
        <div>
          <label className={miniLabel}>{t('trades.detail.exec.time')}</label>
          <DateTimeField value={draft.datetime} onChange={(v) => patch({ datetime: v })} />
        </div>
        <div>
          <label className={miniLabel}>{t('trades.detail.exec.side')}</label>
          <div className="inline-flex rounded-md bg-muted/50 p-0.5">
            {(['buy', 'sell'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => patch({ side: s })}
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium transition-colors',
                  draft.side === s
                    ? s === 'buy'
                      ? 'bg-profit/20 text-profit'
                      : 'bg-loss/20 text-loss'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`trades.detail.exec.${s}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={miniLabel}>{t('trades.detail.exec.qty')}</label>
            <input
              autoFocus={isNew}
              inputMode="decimal"
              value={draft.qty}
              onChange={(e) => patch({ qty: e.target.value })}
              className={cellCls}
            />
          </div>
          <div>
            <label className={miniLabel}>{t('trades.detail.exec.multiplier')}</label>
            <input
              inputMode="decimal"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              className={cellCls}
            />
          </div>
          <div>
            <label className={miniLabel}>{t('trades.detail.exec.price')}</label>
            <input
              inputMode="decimal"
              value={draft.price}
              onChange={(e) => patch({ price: e.target.value })}
              className={cellCls}
            />
          </div>
          <div>
            <label className={miniLabel}>{t('trades.detail.exec.commission')}</label>
            <input
              inputMode="decimal"
              value={draft.comm}
              onChange={(e) => patch({ comm: e.target.value })}
              className={cellCls}
            />
          </div>
          <div>
            <label className={miniLabel}>{t('trades.detail.exec.fee')}</label>
            <input
              inputMode="decimal"
              value={draft.fee}
              onChange={(e) => patch({ fee: e.target.value })}
              className={cellCls}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {projectedOpenQty <= 0
            ? t('trades.detail.exec.willClose')
            : t('trades.detail.exec.willRemain', { qty: projectedOpenQty })}
        </p>

        <div className="flex items-center justify-end gap-1 pt-0.5">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={saving}
              aria-label={t('trades.detail.exec.delete')}
              className="mr-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-loss/10 hover:text-loss disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={cancelEdit}
            aria-label={t('trades.detail.exec.cancel')}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={saveRow}
            disabled={saving}
            aria-label={t('trades.detail.exec.save')}
            className="rounded-md bg-primary p-1.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide">{t('trades.detail.exec.title')}</span>
        {rows.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-primary" />
            {t('common.all')}
          </label>
        )}
      </div>

      <div className="mb-3 space-y-1.5 rounded-md bg-muted/40 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('trades.detail.exec.position')}</span>
          <span className={cn('text-xs font-medium', isOpen ? 'text-primary' : 'text-muted-foreground')}>
            {isOpen ? t('trades.detail.exec.openQty', { qty: openQty }) : t('trades.detail.exec.flat')}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('trades.detail.grossPnl')}</span>
          <span
            className={cn(
              'text-sm font-semibold tabular',
              grossPnl === null ? 'text-muted-foreground' : grossPnl >= 0 ? 'text-profit' : 'text-loss',
            )}
          >
            {grossPnl !== null ? formatCurrency(grossPnl) : '—'}
          </span>
        </div>
      </div>

      {sel.size > 0 && (
        <button
          onClick={bulkDelete}
          disabled={saving}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-loss/40 px-3 py-1.5 text-xs text-loss transition-colors hover:bg-loss/10 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('trades.detail.exec.deleteSelected', { count: sel.size })}
        </button>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          if (editingId === r.id && draft && !isNew) {
            return <div key={r.id}>{editorForm(() => deleteRow(r))}</div>
          }
          return (
            <div
              key={r.id}
              className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 transition-colors hover:border-border/80"
            >
              <input
                type="checkbox"
                checked={sel.has(r.id)}
                onChange={() => toggleSel(r.id)}
                className="accent-primary"
              />
              <button
                type="button"
                onClick={() => startEdit(r)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
                    r.side === 'buy' ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss',
                  )}
                >
                  {t(`trades.detail.exec.${r.side}`)}
                </span>
                <span className="min-w-0 truncate text-sm tabular">
                  {num(r.qty)} @ {num(r.price)}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular">
                  {formatDateTime(new Date(r.datetime))}
                </span>
              </button>
              <button
                type="button"
                onClick={() => startEdit(r)}
                aria-label={t('trades.detail.exec.edit')}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}

        {isNew && draft && editorForm()}

        {rows.length === 0 && !isNew && (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('trades.detail.exec.empty')}</p>
        )}
      </div>

      {!isNew && (
        <button
          type="button"
          onClick={addRow}
          disabled={saving}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('trades.detail.exec.add')}
        </button>
      )}
    </div>
  )
}
