import { Fragment } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import type { Metadata } from 'next'
import { getStrategyDetail } from '@/lib/actions/strategies'
import StrategyEquityChart from '@/components/strategies/StrategyEquityChart'
import StrategyDetailActions from '@/components/strategies/StrategyDetailActions'
import StrategyImageGallery from '@/components/strategies/StrategyImageGallery'
import SortableTradesTable from '@/components/trades/SortableTradesTable'
import { formatCurrency, cn } from '@/lib/utils'
import type { ChecklistAnalytics, ComplianceSplit, CriterionPerformance } from '@/lib/strategy-checklist'
import { t } from '@/i18n'

export const metadata: Metadata = { title: t('strategies.title') }
export const dynamic = 'force-dynamic'

function pnlClass(v: number): string | undefined {
  if (v === 0) return undefined
  return v > 0 ? 'text-profit' : 'text-loss'
}

function CriteriaList({ title, items, dotClass }: { title: string; items: string[]; dotClass: string }) {
  return (
    <>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-snug">
            <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

export default async function StrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getStrategyDetail(id)
  if (!detail) notFound()

  const { strategy, stats, curve, checklist, recentTrades } = detail
  const hasData = stats.totalTrades > 0
  const showPerformance = checklist.totalCriteria > 0 && hasData

  return (
    <div className="p-4 sm:p-6 w-full animate-in">
      <Link
        href="/strategies"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('strategies.detail.back')}
      </Link>

      <div className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="min-w-0 text-xl font-semibold tracking-tight">{strategy.name}</h1>
          <StrategyDetailActions strategy={strategy} />
        </div>
        {strategy.description && (
          <div className="bg-card rounded-lg mt-4 p-4">
            <div
              className="rte mt-2 w-full text-sm text-foreground"
              dangerouslySetInnerHTML={{ __html: strategy.description }}
            />
          </div>
        )}
      </div>

      {/* Playbook definition */}
      {(() => {
        const hasCriteria =
          !showPerformance && (strategy.entryChecklist.length > 0 || strategy.exitChecklist.length > 0)
        const hasImages = strategy.imageUrls.length > 0
        if (!hasCriteria && !hasImages) return null
        return (
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start">
            {hasCriteria && (
              <div className="w-full rounded-xl border border-border bg-card p-4 lg:flex-1">
                {strategy.entryChecklist.length > 0 && (
                  <CriteriaList
                    title={t('strategies.detail.entryChecklistTitle')}
                    items={strategy.entryChecklist}
                    dotClass="bg-profit/70"
                  />
                )}
                {strategy.exitChecklist.length > 0 && (
                  <div className={strategy.entryChecklist.length > 0 ? 'mt-4 border-t border-border pt-4' : ''}>
                    <CriteriaList
                      title={t('strategies.detail.exitChecklistTitle')}
                      items={strategy.exitChecklist}
                      dotClass="bg-loss/70"
                    />
                  </div>
                )}
              </div>
            )}
            {hasImages && (
              <div className="w-full rounded-xl border border-border bg-card p-4 lg:flex-1">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('strategies.detail.referenceTitle')}
                </h2>
                <StrategyImageGallery images={strategy.imageUrls} />
              </div>
            )}
          </div>
        )
      })()}

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label={t('strategies.stats.trades')} value={String(stats.totalTrades)} />
        <Tile
          label={t('strategies.stats.netPnl')}
          value={formatCurrency(stats.totalPnl)}
          valueClass={pnlClass(stats.totalPnl)}
        />
        <Tile label={t('strategies.stats.winRate')} value={hasData ? `${Math.round(stats.winPct)}%` : '—'} />
        <Tile label={t('strategies.stats.expectancy')} value={hasData ? formatCurrency(stats.tradeExpectancy) : '—'} />
        <Tile label={t('strategies.stats.avgR')} value={hasData ? `${stats.avgRealizedR.toFixed(2)}R` : '—'} />
        <Tile
          label={t('strategies.stats.profitFactor')}
          value={hasData && Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '—'}
        />
      </div>

      {/* Playbook performance */}
      {showPerformance && <PlaybookPerformance checklist={checklist} />}

      {/* Equity curve */}
      {curve.length > 1 && (
        <div className="mb-4">
          <h2 className="mb-3 text-sm font-semibold">{t('strategies.detail.equity')}</h2>
          <div className="h-64 rounded-xl border border-border bg-card p-3">
            <StrategyEquityChart data={curve} />
          </div>
        </div>
      )}

      {/* Recent trades */}
      <div className="mb-4">
        <h2 className="mb-3 text-sm font-semibold">{t('strategies.detail.recent')}</h2>
        {recentTrades.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {t('strategies.detail.noTrades')}
          </div>
        ) : (
          <SortableTradesTable
            trades={recentTrades}
            storageKey="tradenza-strategy-trades-sort"
            columnsKey="strategies.detail.columns"
            rowBasePath="/trades"
          />
        )}
      </div>
    </div>
  )
}

function Tile({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className={cn('text-lg font-semibold tabular-nums', valueClass)}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

const asPct = (v: number | null): string => (v === null ? '—' : `${Math.round(v)}%`)
const asMoney = (v: number | null): string => (v === null ? '—' : formatCurrency(v))

// Below this many trades on either side, a win%/avg-P&L split is too noisy to
// trust — we still show it but fade it so it isn't read as a real signal.
const MIN_SAMPLE = 3

// "Does following the playbook pay?" — per-criterion outcome splits plus an
// overall adherence figure and a full-vs-partial compliance comparison.
function PlaybookPerformance({ checklist }: { checklist: ChecklistAnalytics }) {
  const { adherencePct, criteria, full, partial } = checklist
  const groups = [
    { kind: 'entry' as const, title: t('strategies.detail.entryChecklistTitle'), dot: 'bg-profit/70' },
    { kind: 'exit' as const, title: t('strategies.detail.exitChecklistTitle'), dot: 'bg-loss/70' },
  ].filter((g) => criteria.some((c) => c.kind === g.kind))
  const anyHurts = criteria.some(criterionHurts)

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{t('strategies.detail.playbook.title')}</h2>
        {adherencePct !== null && (
          <span className="text-xs text-muted-foreground">
            {t('strategies.detail.playbook.adherence')}:{' '}
            <span className="font-semibold tabular-nums text-foreground">{Math.round(adherencePct)}%</span>
          </span>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <ComplianceTile label={t('strategies.detail.playbook.full')} split={full} />
        <ComplianceTile label={t('strategies.detail.playbook.partial')} split={partial} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 text-left font-medium">{t('strategies.detail.playbook.criterion')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('strategies.detail.playbook.followed')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('strategies.detail.playbook.winFollowed')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('strategies.detail.playbook.winMissed')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('strategies.detail.playbook.pnlFollowed')}</th>
              <th className="py-2 pl-3 text-right font-medium">{t('strategies.detail.playbook.pnlMissed')}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.kind}>
                <tr>
                  <td colSpan={6} className="pb-1 pt-3">
                    <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span className={cn('h-1.5 w-1.5 rounded-full', g.dot)} />
                      {g.title}
                    </span>
                  </td>
                </tr>
                {criteria
                  .filter((c) => c.kind === g.kind)
                  .map((c, i) => (
                    <CriterionRow key={`${g.kind}-${i}`} c={c} />
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {anyHurts && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-loss" />
          {t('strategies.detail.playbook.hurtsNote')}
        </p>
      )}
    </div>
  )
}

// A criterion "hurts" when — on a big enough sample both ways — following it
// produced worse average P&L than skipping it. That's the actionable flag.
function criterionHurts(c: CriterionPerformance): boolean {
  const missed = c.total - c.followed
  return (
    c.followed >= MIN_SAMPLE &&
    missed >= MIN_SAMPLE &&
    c.avgPnlFollowed !== null &&
    c.avgPnlMissed !== null &&
    c.avgPnlFollowed < c.avgPnlMissed
  )
}

function CriterionRow({ c }: { c: CriterionPerformance }) {
  const missed = c.total - c.followed
  const followedThin = c.followed < MIN_SAMPLE
  const missedThin = missed < MIN_SAMPLE
  const hurts = criterionHurts(c)
  const thin = 'text-muted-foreground/40'

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-3">
        <span className="flex items-start gap-2">
          <span className="leading-snug">{c.text}</span>
          {hurts && (
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-loss"
              aria-label={t('strategies.detail.playbook.hurtsTooltip')}
            />
          )}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
        {c.followed}/{c.total} · {Math.round(c.followedPct)}%
      </td>
      <td className={cn('px-3 py-2 text-right tabular-nums', followedThin && thin)}>{asPct(c.winRateFollowed)}</td>
      <td className={cn('px-3 py-2 text-right tabular-nums text-muted-foreground', missedThin && thin)}>
        {asPct(c.winRateMissed)}
      </td>
      <td className={cn('px-3 py-2 text-right tabular-nums', followedThin ? thin : pnlClass(c.avgPnlFollowed ?? 0))}>
        {asMoney(c.avgPnlFollowed)}
      </td>
      <td className={cn('py-2 pl-3 text-right tabular-nums', missedThin ? thin : pnlClass(c.avgPnlMissed ?? 0))}>
        {asMoney(c.avgPnlMissed)}
      </td>
    </tr>
  )
}

function ComplianceTile({ label, split }: { label: string; split: ComplianceSplit }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t('strategies.detail.playbook.trades', { count: split.count })}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-4">
        <div>
          <div className={cn('text-lg font-semibold tabular-nums', pnlClass(split.expectancy ?? 0))}>
            {asMoney(split.expectancy)}
          </div>
          <div className="text-[11px] text-muted-foreground">{t('strategies.detail.playbook.expectancy')}</div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums">{asPct(split.winRate)}</div>
          <div className="text-[11px] text-muted-foreground">{t('strategies.detail.playbook.winRate')}</div>
        </div>
      </div>
    </div>
  )
}
