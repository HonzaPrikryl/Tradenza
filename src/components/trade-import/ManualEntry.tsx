'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { t } from '@/i18n'
import { saveManualTrade } from '@/lib/actions/wizard'
import { contractMultiplier } from '@/lib/futures'
import DateTimeField from '@/components/ui/DateTimeField'
import DateField from '@/components/ui/DateField'

const ASSET_CLASSES = ['stocks', 'futures', 'options', 'forex', 'crypto', 'other'] as const
type AssetClass = (typeof ASSET_CLASSES)[number]

interface Execution {
  id: string
  dateTime: string // "YYYY-MM-DDTHH:mm:ss"
  expDate: string // "YYYY-MM-DD"
  multiplier: string
  qty: string
  side: 'buy' | 'sell'
  price: string
  comm: string
  fee: string
}

const emptyExec = (side: 'buy' | 'sell' = 'buy', multiplier = ''): Execution => ({
  id: Math.random().toString(36).slice(2),
  dateTime: '',
  expDate: '',
  multiplier,
  qty: '',
  side,
  price: '',
  comm: '',
  fee: '',
})

const cellInput = 'w-full bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/50'

const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? 0 : n
}

export default function ManualEntry({
  brokerId,
  accountId,
  cancelHref,
}: {
  brokerId: string
  accountId: string
  cancelHref?: string
}) {
  const router = useRouter()
  const assetClass: AssetClass = 'futures'
  const [symbol, setSymbol] = useState('')
  const [execs, setExecs] = useState<Execution[]>([emptyExec()])
  const [saving, setSaving] = useState(false)

  const hasSymbol = symbol.trim().length > 0

  const update = (id: string, patch: Partial<Execution>) =>
    setExecs((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const handleSymbolChange = (raw: string) => {
    const next = raw.toUpperCase()
    setSymbol(next)
    const mult = contractMultiplier(next)
    setExecs((rows) => rows.map((r) => ({ ...r, multiplier: mult ? String(mult) : '0' })))
  }

  const addRow = () =>
    setExecs((rows) => {
      const side = rows.length > 0 && rows[0].side === 'buy' ? 'sell' : 'buy'
      const mult = contractMultiplier(symbol)
      const last = rows[rows.length - 1]
      const row = emptyExec(side, mult ? String(mult) : '0')
      if (last) {
        row.expDate = last.expDate
        row.qty = last.qty
      }
      return [...rows, row]
    })

  const validExecs = execs.filter((r) => r.dateTime && num(r.qty) > 0 && num(r.price) > 0)
  const canSave = hasSymbol && validExecs.length > 0 && validExecs.length === execs.length

  const summary = useMemo(() => {
    if (validExecs.length === 0) return null
    const sorted = [...validExecs].sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
    const entrySide = sorted[0].side
    const direction: 'long' | 'short' = entrySide === 'buy' ? 'long' : 'short'
    const entries = sorted.filter((e) => e.side === entrySide)
    const exits = sorted.filter((e) => e.side !== entrySide)
    const qty = (rows: Execution[]) => rows.reduce((s, e) => s + num(e.qty), 0)
    const avg = (rows: Execution[]) => {
      const q = qty(rows)
      return q === 0 ? 0 : rows.reduce((s, e) => s + num(e.price) * num(e.qty), 0) / q
    }
    const entryQty = qty(entries)
    const exitQty = qty(exits)
    const avgEntry = avg(entries)
    const avgExit = exits.length > 0 ? avg(exits) : null
    const fees = sorted.reduce((s, e) => s + num(e.comm) + num(e.fee), 0)
    const matched = Math.min(entryQty, exitQty)
    const rawMult = num(sorted[0].multiplier)
    const mult = rawMult > 0 ? rawMult : 1
    let netPnl: number | null = null
    if (avgExit !== null && matched > 0) {
      const gross = (direction === 'long' ? avgExit - avgEntry : avgEntry - avgExit) * matched * mult
      netPnl = gross - fees
    }
    const open = exitQty < entryQty || exits.length === 0
    return { direction, entryQty, exitQty, avgEntry, avgExit, fees, netPnl, open }
  }, [validExecs])

  const save = async (addNext: boolean) => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const trimmed = symbol.trim().toUpperCase()
      const res = await saveManualTrade({
        accountId,
        assetClass,
        symbol: trimmed,
        contractMultiplier: num(execs[0]?.multiplier) || contractMultiplier(trimmed),
        expirationDate: execs[0]?.expDate || undefined,
        executions: execs.map((e) => ({
          datetime: new Date(e.dateTime).toISOString(),
          side: e.side,
          quantity: num(e.qty),
          price: num(e.price),
          commission: num(e.comm),
          fee: num(e.fee),
        })),
      })
      if (handleRateLimit(res)) {
        setSaving(false)
        return
      }
      toast.success(t('addTrades.manual.saved', { symbol: trimmed }))
      if (addNext) {
        setSymbol('')
        setExecs([emptyExec()])
        setSaving(false)
      } else {
        router.push('/trades')
      }
    } catch (e) {
      toast.error(getActionErrorMessage(e, 'addTrades.manual.saveError'))
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <h2 className="text-lg font-semibold">{t('addTrades.manual.details')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('addTrades.manual.timezoneNote')}</p>

      <div className="mt-6">
        <p className="mb-2 text-xs font-medium text-primary">{t('addTrades.manual.type')}</p>
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1">
          {ASSET_CLASSES.map((ac) => {
            const active = ac === assetClass
            const disabled = ac !== 'futures'
            return (
              <button
                key={ac}
                type="button"
                disabled={disabled}
                aria-disabled={disabled}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  active && 'bg-primary text-primary-foreground',
                  disabled && 'cursor-not-allowed text-muted-foreground/40',
                )}
              >
                {t(`addTrades.assets.${ac}`)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Symbol */}
      <div className="mt-6 max-w-sm">
        <p className="mb-2 text-xs font-medium text-primary">{t('addTrades.manual.symbol')}</p>
        <input
          value={symbol}
          onChange={(e) => handleSymbolChange(e.target.value)}
          placeholder={t('addTrades.manual.symbolPlaceholder')}
          className="w-full rounded-md border border-border bg-input/40 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {!hasSymbol ? (
        <p className="mt-6 rounded-xl border border-dashed border-border bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
          {t('addTrades.manual.symbolFirst')}
        </p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[56rem]">
              <thead>
                <tr className="bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-medium">{t('addTrades.manual.col.dateTime')}</th>
                  <th className="px-3 py-2.5 text-left font-medium">{t('addTrades.manual.col.expDate')}</th>
                  <th className="px-3 py-2.5 text-left font-medium">{t('addTrades.manual.col.multiplier')}</th>
                  <th className="px-3 py-2.5 text-left font-medium">{t('addTrades.manual.col.contracts')}</th>
                  <th className="px-3 py-2.5 text-left font-medium">{t('addTrades.manual.col.side')}</th>
                  <th className="px-3 py-2.5 text-left font-medium">{t('addTrades.manual.col.price')}</th>
                  <th className="px-3 py-2.5 text-left font-medium">{t('addTrades.manual.col.comm')}</th>
                  <th className="px-3 py-2.5 text-left font-medium">{t('addTrades.manual.col.fee')}</th>
                  <th className="w-16 pl-3 pr-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {execs.map((r) => (
                  <tr key={r.id} className="border-t border-border align-middle">
                    <td className="px-3 py-2 min-w-[13rem]">
                      <DateTimeField value={r.dateTime} onChange={(v) => update(r.id, { dateTime: v })} />
                    </td>
                    <td className="px-3 py-2 min-w-[11rem]">
                      <DateField value={r.expDate} onChange={(v) => update(r.id, { expDate: v })} />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input
                        inputMode="decimal"
                        value={r.multiplier}
                        onChange={(e) => update(r.id, { multiplier: e.target.value })}
                        placeholder="0"
                        className={cn(cellInput, 'tabular')}
                      />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input
                        inputMode="decimal"
                        value={r.qty}
                        onChange={(e) => update(r.id, { qty: e.target.value })}
                        placeholder="0"
                        className={cn(cellInput, 'tabular')}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="inline-flex rounded-md bg-muted/50 p-0.5">
                        {(['buy', 'sell'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => update(r.id, { side: s })}
                            className={cn(
                              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                              r.side === s
                                ? s === 'buy'
                                  ? 'bg-profit/20 text-profit'
                                  : 'bg-loss/20 text-loss'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {t(`addTrades.manual.${s}`)}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 w-28">
                      <input
                        inputMode="decimal"
                        value={r.price}
                        onChange={(e) => update(r.id, { price: e.target.value })}
                        placeholder="0.00"
                        className={cn(cellInput, 'tabular')}
                      />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input
                        inputMode="decimal"
                        value={r.comm}
                        onChange={(e) => update(r.id, { comm: e.target.value })}
                        placeholder="0.00"
                        className={cn(cellInput, 'tabular')}
                      />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input
                        inputMode="decimal"
                        value={r.fee}
                        onChange={(e) => update(r.id, { fee: e.target.value })}
                        placeholder="0.00"
                        className={cn(cellInput, 'tabular')}
                      />
                    </td>
                    <td className="w-16 pl-3 pr-4 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setExecs((rows) => rows.filter((x) => x.id !== r.id))}
                        disabled={execs.length === 1}
                        className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-loss disabled:pointer-events-none disabled:opacity-30"
                        aria-label={t('addTrades.manual.removeExecution')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td colSpan={9} className="px-4 py-3">
                    <button
                      type="button"
                      onClick={addRow}
                      className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      <Plus className="h-4 w-4" />
                      {t('addTrades.manual.createExecution')}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Live summary */}
          {summary && (
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
              <span>
                <span className="text-muted-foreground">{t('addTrades.manual.summary.direction')}: </span>
                <span
                  className={cn('font-medium uppercase', summary.direction === 'long' ? 'text-profit' : 'text-loss')}
                >
                  {summary.direction}
                </span>
              </span>
              <span>
                <span className="text-muted-foreground">{t('addTrades.manual.summary.avgEntry')}: </span>
                <span className="font-medium tabular">{summary.avgEntry.toLocaleString()}</span>
              </span>
              {summary.avgExit !== null && (
                <span>
                  <span className="text-muted-foreground">{t('addTrades.manual.summary.avgExit')}: </span>
                  <span className="font-medium tabular">{summary.avgExit.toLocaleString()}</span>
                </span>
              )}
              <span>
                <span className="text-muted-foreground">{t('addTrades.manual.summary.fees')}: </span>
                <span className="font-medium tabular">{summary.fees.toLocaleString()}</span>
              </span>
              <span>
                <span className="text-muted-foreground">{t('addTrades.manual.summary.status')}: </span>
                <span className="font-medium">
                  {summary.open ? t('addTrades.manual.summary.open') : t('addTrades.manual.summary.closed')}
                </span>
              </span>
              {summary.netPnl !== null && (
                <span className="ml-auto">
                  <span className="text-muted-foreground">{t('addTrades.manual.summary.netPnl')}: </span>
                  <span className={cn('font-semibold tabular', summary.netPnl >= 0 ? 'text-profit' : 'text-loss')}>
                    {formatCurrency(summary.netPnl)}
                  </span>
                </span>
              )}
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push(cancelHref ?? `/trade-import/method?broker=${brokerId}&account=${accountId}`)}
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          {t('addTrades.common.cancel')}
        </button>
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={() => save(true)}
          className={cn(
            'rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors',
            canSave && !saving
              ? 'border-primary/50 text-primary hover:bg-primary/10'
              : 'cursor-not-allowed border-border text-muted-foreground',
          )}
        >
          {t('addTrades.manual.saveAndNext')}
        </button>
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={() => save(false)}
          className={cn(
            'flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors',
            canSave && !saving
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'cursor-not-allowed bg-muted text-muted-foreground',
          )}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('addTrades.manual.save')}
        </button>
      </div>
    </div>
  )
}
