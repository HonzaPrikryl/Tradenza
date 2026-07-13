'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Info, Target, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { cn, formatCurrency, formatDateTimeTz, formatPercent } from '@/lib/utils'
import { t } from '@/i18n'
import { assetMultiplier, instrumentTickSize, instrumentTickValue } from '@/lib/futures'
import { updateTradeJournal, updateTradeRiskPlan } from '@/lib/actions/trades'
import { type CandlesResult } from '@/lib/actions/candles'
import ExecutionsEditor from './ExecutionsEditor'
import StarRating from './StarRating'
import RunningPnlChart from './RunningPnlChart'
import LegEditor, { type LegMode } from './LegEditor'
import SidebarSettings from './SidebarSettings'
import { setSidebarPrefs } from '@/lib/sidebar-prefs'
import { resolveListOrder, SIDEBAR_LISTS, type SidebarListId, type SidebarPrefs } from '@/lib/trade-sidebar'
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

export type SidebarTab = 'stats' | 'executions' | 'playbook'

export default function TradeStatsPanel({
  trade,
  executions,
  accountName,
  candlesResult,
  tab,
  onTabChange,
  timezone,
  playbookSlot,
  tagsSlot,
  strategySlot,
  initialPrefs = { hidden: [], order: {} },
}: {
  trade: Trade
  executions: NormalizedExecution[]
  accountName: string | null
  candlesResult?: CandlesResult | null
  tab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  timezone?: string | null
  playbookSlot?: React.ReactNode
  tagsSlot?: React.ReactNode
  strategySlot?: React.ReactNode
  initialPrefs?: SidebarPrefs
}) {
  const [rating, setRating] = useState(trade.rating ?? 0)

  // Global (per-user) sidebar visibility + order. Optimistic local state, persisted via cookie.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initialPrefs.hidden))
  const [order, setOrder] = useState<Record<SidebarListId, string[]>>(() => ({
    sections: resolveListOrder('sections', initialPrefs.order.sections),
    detailsRows: resolveListOrder('detailsRows', initialPrefs.order.detailsRows),
    riskRows: resolveListOrder('riskRows', initialPrefs.order.riskRows),
  }))
  const show = (key: string) => !hidden.has(key)

  const dirty = hidden.size > 0 || SIDEBAR_LISTS.some((l) => order[l.id].join() !== resolveListOrder(l.id).join())

  // Debounce cookie writes so rapid toggles/reorders coalesce into a single request.
  const pendingPrefs = useRef<SidebarPrefs | null>(null)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persist = (nextHidden: Set<string>, nextOrder: Record<SidebarListId, string[]>) => {
    pendingPrefs.current = { hidden: [...nextHidden], order: nextOrder }
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null
      const p = pendingPrefs.current
      if (p) void setSidebarPrefs(p).catch(() => {})
    }, 400)
  }
  // Flush any pending write on unmount so a quick change isn't lost.
  useEffect(
    () => () => {
      if (persistTimer.current) {
        clearTimeout(persistTimer.current)
        const p = pendingPrefs.current
        if (p) void setSidebarPrefs(p).catch(() => {})
      }
    },
    [],
  )
  const toggleHidden = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      persist(next, order)
      return next
    })
  }
  const reorder = (listId: SidebarListId, keys: string[]) => {
    setOrder((prev) => {
      const next = { ...prev, [listId]: keys }
      persist(hidden, next)
      return next
    })
  }
  const resetPrefs = () => {
    const nextHidden = new Set<string>()
    const nextOrder: Record<SidebarListId, string[]> = {
      sections: resolveListOrder('sections'),
      detailsRows: resolveListOrder('detailsRows'),
      riskRows: resolveListOrder('riskRows'),
    }
    setHidden(nextHidden)
    setOrder(nextOrder)
    persist(nextHidden, nextOrder)
  }

  const netPnl = trade.netPnl !== null ? Number(trade.netPnl) : null
  const grossPnl = trade.grossPnl !== null ? Number(trade.grossPnl) : null
  const fees = Number(trade.fees ?? 0)

  const mult = storedMultiplier(trade) ?? assetMultiplier(trade.assetClass, trade.symbol)
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

    const applyExec = (e: NormalizedExecution) => {
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

    // Path in raw price points (realized + unrealized), before any money scaling.
    const pts: number[] = []
    let lowPrice = Infinity
    let highPrice = -Infinity
    let any = false
    for (const c of candles) {
      if (c.t < entrySec) continue
      if (c.t > upTo) break
      while (ei < evs.length && evs[ei].time <= c.t) applyExec(evs[ei++])
      any = true
      lowPrice = Math.min(lowPrice, c.l)
      highPrice = Math.max(highPrice, c.h)
      const unreal = pos !== 0 ? pos * (c.c - avgCost) : 0
      pts.push(realized + unreal)
    }
    if (!any) return null

    // The exit fill's timestamp usually sits a few seconds past the last candle,
    // so it wasn't applied above. Drain the remaining fills at their real prices
    // to get the true realized terminal (in points).
    while (ei < evs.length) applyExec(evs[ei++])
    const closed = pos === 0
    const terminalPts = realized + (closed ? 0 : pos * (candles[candles.length - 1].c - avgCost))
    pts.push(terminalPts)

    // Convert points → money. For a closed trade, anchor to the trade's stored
    // result: derive the money-per-point factor from the actual gross P&L (so an
    // imperfect reconstructed multiplier or averaged fills can't skew the scale),
    // and pin the final point exactly to Net P&L. Open trades stay marked-to-
    // market at the instrument multiplier.
    const hasStored = grossPnl !== null || netPnl !== null
    if (closed && hasStored) {
      const actualGross = grossPnl !== null ? grossPnl : netPnl! + fees
      const factor = Math.abs(terminalPts) > 1e-9 ? actualGross / terminalPts : mult
      const series = pts.map((p) => p * factor)
      series[series.length - 1] = netPnl !== null ? netPnl : actualGross - fees
      return { series, lowPrice, highPrice }
    }
    return { series: pts.map((p) => p * mult), lowPrice, highPrice }
  }, [candles, executions, entrySec, exitSec, mult, fees, grossPnl, netPnl])

  const runningPnl = runningFromCandles?.series ?? []
  const showRunning = runningPnl.length >= 2

  const execPrices = executions.map((e) => e.price).filter((p) => p > 0)
  const priceLow = runningFromCandles ? runningFromCandles.lowPrice : execPrices.length ? Math.min(...execPrices) : null
  const priceHigh = runningFromCandles
    ? runningFromCandles.highPrice
    : execPrices.length
      ? Math.max(...execPrices)
      : null

  const symbolTickValue = instrumentTickValue(trade.assetClass, trade.symbol, mult)
  const ts = instrumentTickSize(trade.assetClass, trade.symbol)
  const stored = useMemo(() => storedRiskPlan(trade), [trade])
  const defaultQty = Math.max(1, Math.round(contractsTraded || entryQty || 1))

  const tickValue = stored?.tickValue || symbolTickValue || 0

  const [profitTargets, setProfitTargets] = useState<RiskPlanLeg[]>(() => initLegs(stored?.profitTargets, defaultQty))
  const [stopLosses, setStopLosses] = useState<RiskPlanLeg[]>(() => initLegs(stored?.stopLosses, defaultQty))
  const defaultLegMode: LegMode = trade.assetClass === 'futures' ? 'ticks' : 'price'
  const [targetMode, setTargetMode] = useState<LegMode>(defaultLegMode)
  const [stopMode, setStopMode] = useState<LegMode>(defaultLegMode)
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

  // Rows keyed by stable key; null when the row has no meaningful value to show.
  const detailRowNodes: Record<string, React.ReactNode> = {
    'row.side': (
      <Row
        label={t('trades.detail.stats.side')}
        value={
          <span className={cn('uppercase', trade.direction === 'long' ? 'text-profit' : 'text-loss')}>
            {trade.direction}
          </span>
        }
      />
    ),
    'row.account': accountName ? (
      <Row
        label={t('trades.detail.stats.account')}
        value={<span className="text-right text-sm font-medium">{accountName}</span>}
      />
    ) : null,
    'row.contracts': <Row label={t('trades.detail.stats.contracts')} value={contractsTraded || null} />,
    'row.points': (
      <Row
        label={t('trades.detail.stats.points')}
        value={points !== null ? points.toFixed(2).replace(/\.?0+$/, '') : null}
      />
    ),
    'row.priceMaeMfe':
      priceLow !== null && priceHigh !== null ? (
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
      ) : null,
    'row.multiplier': <Row label={t('trades.detail.stats.multiplier')} value={mult !== 1 ? mult : null} />,
    'row.commissions': <Row label={t('trades.detail.stats.commissions')} value={formatCurrency(fees)} />,
    'row.netRoi': (
      <Row label={t('trades.detail.stats.netRoi')} value={netRoi !== null ? formatPercent(netRoi, 2) : null} />
    ),
    'row.grossPnl': (
      <Row label={t('trades.detail.grossPnl')} value={grossPnl !== null ? formatCurrency(grossPnl) : null} />
    ),
  }

  const riskRowNodes: Record<string, React.ReactNode> = {
    'row.initialTarget': (
      <Row
        label={t('trades.detail.risk.initialTarget')}
        value={<span className="text-profit">{formatCurrency(targetUsd)}</span>}
      />
    ),
    'row.tradeRisk': (
      <Row
        label={t('trades.detail.risk.tradeRisk')}
        value={<span className="text-loss">-{formatCurrency(riskUsd)}</span>}
      />
    ),
    'row.plannedR': (
      <Row label={t('trades.detail.risk.plannedR')} value={plannedR !== null ? `${plannedR.toFixed(2)}R` : null} />
    ),
    'row.realizedR': (
      <Row
        label={t('trades.detail.risk.realizedR')}
        value={
          realizedR !== null ? (
            <span className={cn(realizedR >= 0 ? 'text-profit' : 'text-loss')}>{realizedR.toFixed(2)}R</span>
          ) : null
        }
      />
    ),
    'row.avgEntry': <Row label={t('trades.detail.stats.avgEntry')} value={formatCurrency(entryPrice)} />,
    'row.avgExit': (
      <Row label={t('trades.detail.stats.avgExit')} value={exitPrice !== null ? formatCurrency(exitPrice) : null} />
    ),
    'row.entryTime': (
      <Row label={t('trades.detail.stats.entryTime')} value={formatDateTimeTz(trade.entryDatetime, timezone)} />
    ),
    'row.exitTime': (
      <Row
        label={t('trades.detail.stats.exitTime')}
        value={trade.exitDatetime ? formatDateTimeTz(trade.exitDatetime, timezone) : null}
      />
    ),
  }

  const renderRows = (listId: SidebarListId, nodes: Record<string, React.ReactNode>) =>
    order[listId].map((key) => (show(key) && nodes[key] ? <Fragment key={key}>{nodes[key]}</Fragment> : null))

  // Top-level sidebar sections keyed by stable key (rendered after the pinned P&L header).
  const sectionNodes: Record<string, React.ReactNode> = {
    'block.runningPnl':
      candlesLoading || showRunning ? (
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
      ) : null,
    'block.strategy': strategySlot ?? null,
    'block.details': (
      <div className="rounded-xl border border-border bg-card px-5 py-3">
        <dl>{renderRows('detailsRows', detailRowNodes)}</dl>
      </div>
    ),
    'block.risk': (
      <div className="rounded-xl border border-border bg-card px-5 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle icon={<Target className="h-3.5 w-3.5 text-profit" />} label={t('trades.detail.takeProfit')} />
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

        <dl className="border-t border-border pt-3">{renderRows('riskRows', riskRowNodes)}</dl>
      </div>
    ),
    'block.tags': tagsSlot ?? null,
  }

  return (
    <div className="space-y-4">
      {/* ── Tabs: Stats / Executions / Playbook ── */}
      <div className="flex items-stretch gap-2">
        <div className="flex min-w-0 flex-1 rounded-lg border border-border bg-card p-1">
          {(['stats', 'executions', 'playbook'] as const).map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => onTabChange(tb)}
              className={cn(
                'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                tab === tb ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`trades.detail.tabs.${tb}`)}
            </button>
          ))}
        </div>
        {tab === 'stats' && (
          <SidebarSettings
            hidden={hidden}
            order={order}
            onToggle={toggleHidden}
            onReorder={reorder}
            onReset={resetPrefs}
            dirty={dirty}
          />
        )}
      </div>

      {tab === 'playbook' ? (
        playbookSlot
      ) : tab === 'executions' ? (
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
            {show('row.rating') && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
                <span className="text-xs text-muted-foreground">{t('trades.detail.stats.rating')}</span>
                <div className="flex items-center gap-2">
                  <StarRating value={rating} onChange={saveRating} />
                </div>
              </div>
            )}
          </div>

          {order.sections.map((key) =>
            show(key) && sectionNodes[key] ? <Fragment key={key}>{sectionNodes[key]}</Fragment> : null,
          )}
        </>
      )}
    </div>
  )
}
