'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Info, SlidersHorizontal } from 'lucide-react'
import Tooltip from '@/components/ui/Tooltip'
import ProgressRing from '@/components/progress/ProgressRing'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { getAdherenceOverview, type AdherenceOverview } from '@/lib/actions/adherence'
import type { BlockSummary } from '@/lib/adherence'
import type { GlobalFilters } from '@/lib/global-filters-types'
import { cn } from '@/lib/utils'
import { blockMeta, pctText } from './blockMeta'
import VerdictBanner from './VerdictBanner'
import AdherenceTrendChart from './AdherenceTrendChart'
import { t } from '@/i18n'

/**
 * The account-level view. `filtersKey` changes with the global header filter, which is
 * what re-runs the fetch, so this honours the same scope as every other page.
 */
export default function AdherenceTab({ filtersKey }: { filtersKey?: string }) {
  const [data, setData] = useState<AdherenceOverview | null>(null)
  const [failed, setFailed] = useState(false)
  // Sorted and joined so the effect re-runs on a real change, not on a new array identity.
  const [hidden, setHidden] = useState<string[]>([])
  const hiddenKey = [...hidden].sort().join(',')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    getAdherenceOverview(hiddenKey ? hiddenKey.split(',') : [])
      .then((res) => {
        if (cancelled) return
        if (handleRateLimit(res)) return
        setData(res)
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setBusy(false))
    return () => {
      cancelled = true
    }
  }, [filtersKey, hiddenKey])

  const toggleStrategy = (id: string) =>
    setHidden((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const scope = useMemo(() => describeScope(filtersKey), [filtersKey])

  if (failed) return <Note>{t('adherence.toast.saveError')}</Note>
  if (!data) return <Skeleton />

  const byChoice = hidden.length > 0

  return (
    <div className="space-y-5">
      <div className={cn('space-y-5 transition-opacity', busy && 'opacity-60')}>
        <div className="space-y-3">
          {scope && <ScopeChip label={scope} />}
          {data.trades === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 px-5 py-4 text-center">
              <p className="text-sm font-medium">
                {t(byChoice ? 'adherence.noSetupsShown.title' : 'adherence.noTradesInFilter.title')}
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                {t(byChoice ? 'adherence.noSetupsShown.description' : 'adherence.noTradesInFilter.description')}
              </p>
              {byChoice && (
                <button
                  type="button"
                  onClick={() => setHidden([])}
                  className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
                >
                  {t('adherence.perStrategy.showAll', { count: hidden.length })}
                </button>
              )}
            </div>
          ) : (
            <VerdictBanner verdict={data.verdict} />
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {data.summaries.map((summary) => (
            <BlockRing key={summary.block} summary={summary} />
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">{t('adherence.trend.title')}</h3>
            <Tooltip
              label={
                <span className="block max-w-xs font-normal">
                  {data.trend.bucketDays > 1
                    ? t('adherence.trend.hintGrouped', { days: data.trend.bucketDays })
                    : t('adherence.trend.hint')}
                </span>
              }
            >
              <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Tooltip>
          </div>
          {data.trend.points.length < 2 ? (
            <Note>{t('adherence.trend.empty')}</Note>
          ) : (
            <div className="h-56">
              <AdherenceTrendChart trend={data.trend} />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cn('rounded-xl border border-border bg-card p-4 transition-opacity', busy && 'opacity-60')}>
          <h3 className="mb-3 text-sm font-semibold">{t('adherence.missed.title')}</h3>
          {data.missed.length === 0 ? (
            <Note>{t('adherence.missed.empty')}</Note>
          ) : (
            <ul className="space-y-2">
              {data.missed.map((item) => {
                const meta = blockMeta(item.block)
                return (
                  <li key={item.itemId} className="flex items-start justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-start gap-2">
                      <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', meta.dotClass)} />
                      <span className="min-w-0">
                        <span className="leading-snug">{item.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {item.strategyId
                            ? (data.strategyNames[item.strategyId] ?? meta.name)
                            : t('adherence.universal')}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {t('adherence.missed.count', { missed: item.missed, total: item.total })} ·{' '}
                      <span className="text-loss">{Math.round(item.missedPct)}%</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          {/* The list doubles as the filter for everything above it: untick a setup and
              the rings, verdict, trend and skipped-criteria list drop its trades. Each row
              keeps its own figures either way, so an unticked setup can still be read and
              brought back. */}
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{t('adherence.perStrategy.title')}</h3>
            {hidden.length > 0 && (
              <button
                type="button"
                onClick={() => setHidden([])}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('adherence.perStrategy.showAll', { count: hidden.length })}
              </button>
            )}
          </div>
          {data.perStrategy.filter((s) => s.trades > 0).length === 0 ? (
            <Note>{t('adherence.perStrategy.empty')}</Note>
          ) : (
            <ul className="space-y-2.5">
              {data.perStrategy
                .filter((s) => s.trades > 0)
                .map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-2 transition-opacity',
                      hidden.includes(s.id) && 'opacity-45',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!hidden.includes(s.id)}
                        onChange={() => toggleStrategy(s.id)}
                        aria-label={t('adherence.perStrategy.toggle', { name: s.name })}
                        className="shrink-0 accent-primary"
                      />
                      <Link href={`/strategies/${s.id}`} className="min-w-0 truncate text-sm hover:text-primary">
                        {s.name}
                      </Link>
                    </span>
                    <span className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
                      {s.blocks.map((b) => {
                        const meta = blockMeta(b.block)
                        return (
                          <Tooltip
                            key={b.block}
                            label={
                              <span className="block font-normal">
                                {meta.name} ·{' '}
                                {t('adherence.coverage', { scored: b.scoredTrades, total: b.applicableTrades })}
                              </span>
                            }
                          >
                            <span className="flex items-center gap-1">
                              <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClass)} />
                              {pctText(b.adherencePct)}
                            </span>
                          </Tooltip>
                        )
                      })}
                      <span className="text-muted-foreground">
                        {t('adherence.perStrategy.trades', { count: s.trades })}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/** One line describing the header filter's scope, parsed from the refetch key. */
function describeScope(filtersKey?: string): string | null {
  if (!filtersKey) return null
  let f: GlobalFilters
  try {
    f = JSON.parse(filtersKey) as GlobalFilters
  } catch {
    return null
  }

  const parts: string[] = []
  if (f.dateFrom && f.dateTo) parts.push(t('adherence.scope.range', { from: f.dateFrom, to: f.dateTo }))
  else if (f.dateFrom) parts.push(t('adherence.scope.from', { from: f.dateFrom }))
  else if (f.dateTo) parts.push(t('adherence.scope.to', { to: f.dateTo }))
  if (f.accountIds && f.accountIds.length > 0) parts.push(t('adherence.scope.accounts', { count: f.accountIds.length }))

  const others =
    (f.sides?.length ? 1 : 0) +
    (f.statuses?.length ? 1 : 0) +
    (f.outcomes?.length ? 1 : 0) +
    (f.instruments?.length ? 1 : 0) +
    (f.symbolsInclude?.length || f.symbolsExclude?.length ? 1 : 0) +
    (f.strategiesInclude?.length || f.strategiesExclude?.length ? 1 : 0) +
    (f.ratings?.length ? 1 : 0) +
    (f.rMin != null || f.rMax != null ? 1 : 0) +
    (f.daysOfWeek?.length || f.months?.length ? 1 : 0) +
    (f.durationMin != null || f.durationMax != null ? 1 : 0) +
    (f.entryTimeRanges?.length || f.exitTimeRanges?.length ? 1 : 0) +
    (f.tagInclude?.length || f.excludeTags?.length ? 1 : 0)
  if (others > 0) parts.push(t('adherence.scope.more', { count: others }))

  return parts.length > 0 ? parts.join(' · ') : null
}

const ScopeChip = ({ label }: { label: string }) => (
  <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
    <SlidersHorizontal className="h-3 w-3 shrink-0" />
    {t('adherence.scope.label')} {label}
  </p>
)

function BlockRing({ summary }: { summary: BlockSummary }) {
  const meta = blockMeta(summary.block)
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
      <ProgressRing
        ratio={summary.adherencePct === null ? 0 : summary.adherencePct / 100}
        neutral={summary.adherencePct === null}
        size={64}
        label={pctText(summary.adherencePct)}
        sublabel={meta.letter}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.dotClass)} />
          <span className="truncate text-sm font-medium">{meta.name}</span>
          <Tooltip label={<span className="block max-w-xs font-normal">{meta.hint}</span>}>
            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Tooltip>
        </div>
        {/* Coverage is never optional next to adherence — see lib/adherence. */}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {summary.applicableTrades === 0
            ? t('adherence.noCriteria')
            : t('adherence.coverage', { scored: summary.scoredTrades, total: summary.applicableTrades })}
        </p>
      </div>
    </div>
  )
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
    {children}
  </p>
)

const Skeleton = () => (
  <div className="space-y-3">
    <div className="h-12 animate-pulse rounded-xl bg-card" />
    <div className="grid gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-card" />
      ))}
    </div>
    <div className="h-56 animate-pulse rounded-xl bg-card" />
  </div>
)
