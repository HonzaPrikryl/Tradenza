'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Info, Target, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { cn, formatCurrency, formatDateTimeTz, formatPercent } from '@/lib/utils'
import { t } from '@/i18n'
import { contractMultiplier, tickValue as tickValueFor, tickSize as tickSizeFor } from '@/lib/futures'
import { updateTradeJournal, updateTradeRiskPlan } from '@/lib/actions/trades'
import { type CandlesResult } from '@/lib/actions/candles'
import ExecutionsEditor from './ExecutionsEditor'
import StarRating from './StarRating'
import RunningPnlChart from './RunningPnlChart'
import LegEditor, { type LegMode } from './LegEditor'
import type { Trade } from '@/lib/db'
import { storedMultiplier, storedRiskPlan, type NormalizedExecution, type RiskPlanLeg } from './executions'

function initLegs(stored: RiskPlanLeg[] | undefined, totalQty: number): RiskPlanLeg[] {
  const base = stored?.length ? stored : [{ ticks: 0, qty: totalQty }]
  const partials = base.slice(1).reduce((s, l) => s + (l.qty || 0), 0)
  const first = Math.max(1, totalQty - partials)
  return base.map((l, i) => (i === 0 ? { ...l, qty: first } : l))
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium tabular">
        {value ?? <span className="font-normal text-muted-foreground">—</span>}
      </span>
    </div>
  )
}

function SectionTitle({ icon, label, hint }: { icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      {hint && (
        <span title={hint}>
          <Info className="h-3 w-3 text-muted-foreground" />
        </span>
      )}
    </div>
  )
}

export default function TradeStatsPanel({
  trade,
  executions,
  accountName,
  candlesResult,
  tab,
  onTabChange,
  timezone,
}: {
  trade: Trade
  executions: NormalizedExecution[]
  accountName: string | null
  candlesResult?: CandlesResult | null
  tab: 'stats' | 'executions'
  onTabChange: (tab: 'stats' | 'executions') => void
  timezone?: string | null
}) {
  const [rating, setRating] = useState(trade.rating ?? 0)

  const netPnl = trade.netPnl !== null ? Number(trade.netPnl) : null
  const grossPnl = trade.grossPnl !== null ? Number(trade.grossPnl) : null
  const fees = Number(trade.fees ?? 0)

  const mult = storedMultiplier(trade) ?? (contractMultiplier(trade.symbol) || 1)
  const entryPrice = Number(trade.entryPrice)
  const entryQty = Number(trade.entryQuantity)
  const exitPrice = trade.exitPrice !== null ? Number(trade.exitPrice) : null

  const dirSign = trade.direction === 'long' ? 1 : -1
  const points = exitPrice !== null ? (exitPrice - entryPrice) * dirSign : null
  const adjustedCost = entryPrice * entryQty * mult
  const netRoi = netPnl !== null && adjustedCost > 0 ? (netPnl / adjustedCost) * 100 : null
  const contractsTraded = executions
    .filter((e) => (trade.direction === 'long' ? e.side === 'buy' : e.side === 'sell'))
    .reduce((s, e) => s + e.quantity, 0)

  const candlesLoading = candlesResult === null
  const candles = candlesResult?.status === 'ok' ? candlesResult.candles : null
  const entrySec = Math.floor(new Date(trade.entryDatetime).getTime() / 1000)
  const exitSec = trade.exitDatetime ? Math.floor(new Date(trade.exitDatetime).getTime() / 1000) : null

  const runningFromCandles = useMemo(() => {
    if (!candles || candles.length === 0) return null
    const evs = [...executions].sort((a, b) => a.time - b.time)
    const upTo = exitSec ?? Infinity
    let ei = 0
    let pos = 0
    let avgCost = 0
    let realized = 0
    const series: number[] = []
    let lowPrice = Infinity
    let highPrice = -Infinity
    let any = false
    for (const c of candles) {
      if (c.t < entrySec) continue
      if (c.t > upTo) break
      while (ei < evs.length && evs[ei].time <= c.t) {
        const e = evs[ei]
        ei++
        const q = e.side === 'buy' ? e.quantity : -e.quantity
        if (pos === 0 || Math.sign(pos) === Math.sign(q)) {
          const tot = Math.abs(pos) + Math.abs(q)
          avgCost = tot > 0 ? (avgCost * Math.abs(pos) + e.price * Math.abs(q)) / tot : e.price
          pos += q
        } else {
          const closeQty = Math.min(Math.abs(pos), Math.abs(q))
          realized += closeQty * (e.price - avgCost) * Math.sign(pos)
          const np = pos + q
          if (Math.sign(np) !== Math.sign(pos) && np !== 0) avgCost = e.price
          if (np === 0) avgCost = 0
          pos = np
        }
      }
      any = true
      lowPrice = Math.min(lowPrice, c.l)
      highPrice = Math.max(highPrice, c.h)
      const unreal = pos !== 0 ? pos * (c.c - avgCost) : 0
      series.push((realized + unreal) * mult)
    }
    if (!any) return null
    return { series, lowPrice, highPrice }
  }, [candles, executions, entrySec, exitSec, mult])

  const runningPnl = runningFromCandles?.series ?? []
  const showRunning = runningPnl.length >= 2

  const execPrices = executions.map((e) => e.price).filter((p) => p > 0)
  const priceLow = runningFromCandles ? runningFromCandles.lowPrice : execPrices.length ? Math.min(...execPrices) : null
  const priceHigh = runningFromCandles
    ? runningFromCandles.highPrice
    : execPrices.length
      ? Math.max(...execPrices)
      : null

  const symbolTickValue = tickValueFor(trade.symbol, mult)
  const ts = tickSizeFor(trade.symbol)
  const stored = useMemo(() => storedRiskPlan(trade), [trade])
  const defaultQty = Math.max(1, Math.round(contractsTraded || entryQty || 1))

  const tickValue = stored?.tickValue || symbolTickValue || 0

  const [profitTargets, setProfitTargets] = useState<RiskPlanLeg[]>(() => initLegs(stored?.profitTargets, defaultQty))
  const [stopLosses, setStopLosses] = useState<RiskPlanLeg[]>(() => initLegs(stored?.stopLosses, defaultQty))
  const [targetMode, setTargetMode] = useState<LegMode>('ticks')
  const [stopMode, setStopMode] = useState<LegMode>('ticks')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  const targetUsd = profitTargets.reduce((s, l) => s + l.ticks * l.qty * tickValue, 0)
  const riskUsd = stopLosses.reduce((s, l) => s + l.ticks * l.qty * tickValue, 0)
  const plannedR = riskUsd > 0 ? targetUsd / riskUsd : null
  const realizedR = riskUsd > 0 && netPnl !== null ? netPnl / riskUsd : null

  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setSaveState('saving')
    const id = setTimeout(async () => {
      try {
        if (handleRateLimit(await updateTradeRiskPlan(trade.id, { tickValue, profitTargets, stopLosses }))) return
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 1500)
      } catch (err) {
        setSaveState('idle')
        toast.error(getActionErrorMessage(err, 'trades.detail.saveFailed'))
      }
    }, 700)
    return () => clearTimeout(id)
  }, [tickValue, profitTargets, stopLosses, trade.id])

  const saveRating = async (value: number) => {
    const next = value === rating ? 0 : value
    const prev = rating
    setRating(next)
    try {
      if (handleRateLimit(await updateTradeJournal(trade.id, { rating: next }))) return
    } catch (err) {
      setRating(prev)
      toast.error(getActionErrorMessage(err, 'trades.detail.saveFailed'))
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Tabs: Stats / Executions ── */}
      <div className="inline-flex rounded-lg border border-border bg-card p-1">
        {(['stats', 'executions'] as const).map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => onTabChange(tb)}
            className={cn(
              'rounded-md px-5 py-1.5 text-sm font-medium transition-colors',
              tab === tb ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(tb === 'stats' ? 'trades.detail.tabs.stats' : 'trades.detail.tabs.executions')}
          </button>
        ))}
      </div>

      {tab === 'executions' ? (
        <ExecutionsEditor trade={trade} executions={executions} />
      ) : (
        <>
          {/* ── Header: Net P&L + rating + account ── */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-start justify-between gap-3 px-5 py-4">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'h-10 w-1 shrink-0 rounded-full',
                    netPnl === null ? 'bg-muted' : netPnl >= 0 ? 'bg-profit' : 'bg-loss',
                  )}
                />
                <div>
                  <p className="text-xs text-muted-foreground">{t('trades.detail.netPnl')}</p>
                  <p
                    className={cn(
                      'text-2xl font-semibold tabular',
                      netPnl === null ? '' : netPnl >= 0 ? 'text-profit' : 'text-loss',
                    )}
                  >
                    {netPnl !== null ? formatCurrency(netPnl) : '—'}
                  </p>
                </div>
              </div>
              {realizedR !== null && (
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">{t('trades.detail.risk.realizedR')}</p>
                  <p className={cn('text-lg font-semibold tabular', realizedR >= 0 ? 'text-profit' : 'text-loss')}>
                    {realizedR.toFixed(2)}R
                  </p>
                </div>
              )}
            </div>

            {/* Rating */}
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <span className="text-xs text-muted-foreground">{t('trades.detail.stats.rating')}</span>
              <div className="flex items-center gap-2">
                <StarRating value={rating} onChange={saveRating} />
              </div>
            </div>
          </div>

          {(candlesLoading || showRunning) && (
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <SectionTitle
                  icon={<span className="text-muted-foreground">~</span>}
                  label={t('trades.detail.risk.runningPnl')}
                />
                {showRunning && (
                  <span
                    className={cn(
                      'text-sm font-semibold tabular',
                      runningPnl[runningPnl.length - 1] >= 0 ? 'text-profit' : 'text-loss',
                    )}
                  >
                    {formatCurrency(runningPnl[runningPnl.length - 1])}
                  </span>
                )}
              </div>
              {candlesLoading ? (
                <div className="h-[76px] w-full animate-pulse rounded-md bg-muted/30" />
              ) : (
                <RunningPnlChart
                  points={runningPnl}
                  target={targetUsd > 0 ? targetUsd : null}
                  risk={riskUsd > 0 ? -riskUsd : null}
                />
              )}
            </div>
          )}

          {/* ── Details ── */}
          <div className="rounded-xl border border-border bg-card px-5 py-3">
            <dl>
              <Row
                label={t('trades.detail.stats.side')}
                value={
                  <span className={cn('uppercase', trade.direction === 'long' ? 'text-profit' : 'text-loss')}>
                    {trade.direction}
                  </span>
                }
              />
              {accountName && (
                <Row
                  label={t('trades.detail.stats.account')}
                  value={<span className="text-right text-sm font-medium">{accountName}</span>}
                />
              )}
              <Row label={t('trades.detail.stats.contracts')} value={contractsTraded || null} />
              <Row
                label={t('trades.detail.stats.points')}
                value={points !== null ? points.toFixed(2).replace(/\.?0+$/, '') : null}
              />
              {priceLow !== null && priceHigh !== null && (
                <Row
                  label={t('trades.detail.risk.priceMaeMfe')}
                  value={
                    <span className="text-xs">
                      <span className="text-loss">{formatCurrency(priceLow)}</span>
                      <span className="mx-0.5 text-muted-foreground">/</span>
                      <span className="text-profit">{formatCurrency(priceHigh)}</span>
                    </span>
                  }
                />
              )}
              <Row label={t('trades.detail.stats.multiplier')} value={mult !== 1 ? mult : null} />
              <Row label={t('trades.detail.stats.commissions')} value={formatCurrency(fees)} />
              <Row label={t('trades.detail.stats.netRoi')} value={netRoi !== null ? formatPercent(netRoi, 2) : null} />
              <Row label={t('trades.detail.grossPnl')} value={grossPnl !== null ? formatCurrency(grossPnl) : null} />
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-card px-5 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <SectionTitle
                icon={<Target className="h-3.5 w-3.5 text-profit" />}
                label={t('trades.detail.takeProfit')}
              />
            </div>
            <LegEditor
              legs={profitTargets}
              mode={targetMode}
              onModeChange={setTargetMode}
              entryPrice={entryPrice}
              tickSize={ts}
              tickValue={tickValue}
              priceSign={dirSign}
              totalQty={defaultQty}
              kind="tp"
              onChange={setProfitTargets}
            />

            <div className="flex items-center justify-between border-t border-border pt-4">
              <SectionTitle icon={<Shield className="h-3.5 w-3.5 text-loss" />} label={t('trades.detail.stopLoss')} />
            </div>
            <LegEditor
              legs={stopLosses}
              mode={stopMode}
              onModeChange={setStopMode}
              entryPrice={entryPrice}
              tickSize={ts}
              tickValue={tickValue}
              priceSign={-dirSign}
              totalQty={defaultQty}
              kind="sl"
              onChange={setStopLosses}
            />

            <div className="h-3 text-right text-[11px] text-muted-foreground">
              {saveState === 'saving' && t('trades.detail.savingNote')}
              {saveState === 'saved' && t('trades.detail.savedNote')}
            </div>

            <dl className="border-t border-border pt-3">
              <Row
                label={t('trades.detail.risk.initialTarget')}
                value={<span className="text-profit">{formatCurrency(targetUsd)}</span>}
              />
              <Row
                label={t('trades.detail.risk.tradeRisk')}
                value={<span className="text-loss">-{formatCurrency(riskUsd)}</span>}
              />
              <Row
                label={t('trades.detail.risk.plannedR')}
                value={plannedR !== null ? `${plannedR.toFixed(2)}R` : null}
              />
              <Row
                label={t('trades.detail.risk.realizedR')}
                value={
                  realizedR !== null ? (
                    <span className={cn(realizedR >= 0 ? 'text-profit' : 'text-loss')}>{realizedR.toFixed(2)}R</span>
                  ) : null
                }
              />
              <Row label={t('trades.detail.stats.avgEntry')} value={formatCurrency(entryPrice)} />
              <Row
                label={t('trades.detail.stats.avgExit')}
                value={exitPrice !== null ? formatCurrency(exitPrice) : null}
              />
              <Row label={t('trades.detail.stats.entryTime')} value={formatDateTimeTz(trade.entryDatetime, timezone)} />
              <Row
                label={t('trades.detail.stats.exitTime')}
                value={trade.exitDatetime ? formatDateTimeTz(trade.exitDatetime, timezone) : null}
              />
            </dl>
          </div>
        </>
      )}
    </div>
  )
}
