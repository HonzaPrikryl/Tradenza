'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import Select from '@/components/ui/Select'
import type { RiskPlanLeg } from './executions'

export type LegMode = 'ticks' | 'price' | 'money'

function decimalsOf(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 2
  const s = String(n)
  const i = s.indexOf('.')
  return i < 0 ? 0 : s.length - i - 1
}

export default function LegEditor({
  legs,
  mode,
  onModeChange,
  entryPrice,
  tickSize,
  tickValue,
  priceSign,
  totalQty,
  kind,
  onChange,
}: {
  legs: RiskPlanLeg[]
  mode: LegMode
  onModeChange: (mode: LegMode) => void
  entryPrice: number
  tickSize: number
  tickValue: number
  priceSign: number
  totalQty: number
  kind: 'tp' | 'sl'
  onChange: (legs: RiskPlanLeg[]) => void
}) {
  const priceAvailable = tickSize > 0 && entryPrice > 0
  const moneyAvailable = tickValue > 0
  const effectiveMode: LegMode =
    (mode === 'price' && !priceAvailable) || (mode === 'money' && !moneyAvailable) ? 'ticks' : mode
  const decimals = decimalsOf(tickSize)

  const ticksToPrice = (ticks: number) => entryPrice + priceSign * ticks * tickSize
  const priceToTicks = (price: number) => {
    const tk = Math.round(((price - entryPrice) * priceSign) / tickSize)
    return tk > 0 ? tk : 0
  }
  const ticksToMoney = (ticks: number, qty: number) => ticks * qty * tickValue
  const moneyToTicks = (money: number, qty: number) => {
    const denom = qty * tickValue
    if (denom <= 0) return 0
    const tk = Math.round(money / denom)
    return tk > 0 ? tk : 0
  }

  const recalc = (next: RiskPlanLeg[]): RiskPlanLeg[] => {
    if (next.length === 0) return next
    const partials = next.slice(1).reduce((s, l) => s + (l.qty || 0), 0)
    const first = Math.max(1, totalQty - partials)
    return next.map((l, idx) => (idx === 0 ? { ...l, qty: first } : l))
  }

  const usedQty = legs.reduce((s, l) => s + (l.qty || 0), 0)
  const exceeds = usedQty > totalQty

  const converted = effectiveMode !== 'ticks'
  const qtyKey = legs.map((l) => l.qty).join(',')
  const [drafts, setDrafts] = useState<string[]>([])
  useEffect(() => {
    if (!converted) return
    setDrafts(
      legs.map((l) => {
        if (l.ticks <= 0) return ''
        return effectiveMode === 'price'
          ? ticksToPrice(l.ticks).toFixed(decimals)
          : String(Math.round(ticksToMoney(l.ticks, l.qty)))
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMode, legs.length, entryPrice, tickSize, priceSign, tickValue, qtyKey])

  const setLeg = (i: number, patch: Partial<RiskPlanLeg>) => legs.map((l, idx) => (idx === i ? { ...l, ...patch } : l))
  const setDraft = (i: number, raw: string) =>
    setDrafts((d) => {
      const n = [...d]
      n[i] = raw
      return n
    })

  const updateTicks = (i: number, raw: string) => {
    const v = raw === '' ? 0 : Math.max(0, Number(raw))
    onChange(setLeg(i, { ticks: Number.isFinite(v) ? v : 0 }))
  }
  const updateQty = (i: number, raw: string) => {
    const v = raw === '' ? 0 : Math.max(0, Number(raw))
    onChange(recalc(setLeg(i, { qty: Number.isFinite(v) ? v : 0 })))
  }
  const updateConverted = (i: number, raw: string) => {
    setDraft(i, raw)
    const num = Number(raw.replace(',', '.'))
    const empty = raw.trim() === '' || !Number.isFinite(num)
    const ticks = empty ? 0 : effectiveMode === 'price' ? priceToTicks(num) : moneyToTicks(num, legs[i]?.qty ?? 0)
    onChange(setLeg(i, { ticks }))
  }
  const remove = (i: number) => onChange(recalc(legs.filter((_, idx) => idx !== i)))
  const add = () => onChange(recalc([...legs, { ticks: 0, qty: 0 }]))

  const inputCls =
    'w-full bg-input border border-border rounded-md px-2.5 py-1.5 text-sm tabular focus:outline-none focus:ring-1 focus:ring-ring'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Select
          value={effectiveMode}
          onValueChange={(v) => onModeChange(v as LegMode)}
          align="end"
          className="h-7 w-28 py-1 text-xs"
          options={[
            { value: 'ticks', label: t('trades.detail.risk.unitTicks') },
            ...(priceAvailable ? [{ value: 'price', label: t('trades.detail.risk.unitPrice') }] : []),
            ...(moneyAvailable ? [{ value: 'money', label: t('trades.detail.risk.unitMoney') }] : []),
          ]}
        />
      </div>

      <div className="grid grid-cols-[1fr_72px_28px] items-center gap-2 px-0.5">
        <span className="text-[11px] text-muted-foreground">
          {effectiveMode === 'price'
            ? t('trades.detail.risk.price')
            : effectiveMode === 'money'
              ? t('trades.detail.risk.money')
              : t('trades.detail.risk.ticks')}
        </span>
        <span className="text-[11px] text-muted-foreground">{t('trades.detail.risk.qty')}</span>
        <span />
      </div>

      {legs.map((leg, i) => {
        const isFirst = i === 0
        return (
          <div key={i} className="grid grid-cols-[1fr_72px_28px] items-center gap-2">
            <div className="relative">
              {converted ? (
                <>
                  {effectiveMode === 'money' && (
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                  )}
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={drafts[i] ?? ''}
                    onChange={(e) => updateConverted(i, e.target.value)}
                    placeholder={effectiveMode === 'price' ? (0).toFixed(decimals) : '0'}
                    className={cn(inputCls, effectiveMode === 'money' && 'pl-5')}
                  />
                </>
              ) : (
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={leg.ticks || ''}
                  onChange={(e) => updateTicks(i, e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              )}
            </div>
            {isFirst ? (
              <input
                type="text"
                readOnly
                tabIndex={-1}
                value={leg.qty || 0}
                className={cn(inputCls, 'cursor-default text-muted-foreground')}
              />
            ) : (
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={leg.qty || ''}
                onChange={(e) => updateQty(i, e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            )}
            {isFirst ? (
              <button
                type="button"
                onClick={add}
                aria-label={t('trades.detail.risk.addLevel')}
                title={t('trades.detail.risk.addLevel')}
                className="flex h-8 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={t('trades.detail.risk.removeLeg')}
                className="flex h-8 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-loss"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )
      })}

      {exceeds && (
        <p className="text-[11px] text-loss">
          {t(kind === 'tp' ? 'trades.detail.risk.tpQtyExceeds' : 'trades.detail.risk.slQtyExceeds', {
            used: usedQty,
            total: totalQty,
          })}
        </p>
      )}
    </div>
  )
}
