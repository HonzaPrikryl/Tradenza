'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, Trash2, Target, Search, LayoutGrid, List as ListIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import SortableTh from '@/components/ui/SortableTh'
import StrategyFormModal from '@/components/strategies/StrategyFormModal'
import { useTableSort } from '@/hooks/useTableSort'
import { deleteStrategy, type StrategyDTO, type StrategyOverviewRow } from '@/lib/actions/strategies'
import { formatCurrency, cn } from '@/lib/utils'
import { AreaSparkline } from '@/components/stats/StatVisuals'
import { t } from '@/i18n'

type View = 'cards' | 'list'
type SortKey = 'name' | 'tradeCount' | 'netPnl' | 'winRate' | 'adherence'
const STRATEGY_SORT_KEYS: SortKey[] = ['name', 'tradeCount', 'netPnl', 'winRate', 'adherence']
const VIEW_KEY = 'tz_strategies_view'

export default function StrategiesClient({ strategies }: { strategies: StrategyOverviewRow[] }) {
  const router = useRouter()
  const confirm = useConfirm()

  const [view, setView] = useState<View>('cards')
  const [query, setQuery] = useState('')
  const {
    sortBy: sortKey,
    sortOrder: sortDir,
    toggleSort,
  } = useTableSort({
    storageKey: 'tradenza-strategies-sort',
    defaultSortBy: 'name',
    defaultSortOrder: 'asc',
    validSortKeys: STRATEGY_SORT_KEYS,
  })

  // { strategy: null } → create; { strategy } → edit; null → closed.
  const [modal, setModal] = useState<{ strategy: StrategyDTO | null } | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(VIEW_KEY)
    if (stored === 'cards' || stored === 'list') setView(stored)
  }, [])

  function switchView(v: View) {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? strategies.filter((s) => `${s.name} ${s.description ?? ''}`.toLowerCase().includes(q))
      : strategies
    return [...filtered].sort((a, b) => {
      let cmp: number
      const key = sortKey as SortKey
      if (key === 'name') cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      else if (key === 'adherence') cmp = (a.adherence ?? -1) - (b.adherence ?? -1)
      else cmp = (a[key] as number) - (b[key] as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [strategies, query, sortKey, sortDir])

  const openNew = () => setModal({ strategy: null })
  const openEdit = (s: StrategyDTO) => setModal({ strategy: s })

  async function remove(s: StrategyDTO) {
    const ok = await confirm({
      title: t('strategies.delete.title'),
      message: t('strategies.delete.body', { name: s.name }),
      confirmLabel: t('strategies.delete.confirm'),
    })
    if (!ok) return
    const res = await deleteStrategy(s.id)
    if (handleRateLimit(res)) return
    if (res.success) {
      toast.success(t('strategies.toast.deleted'))
      router.refresh()
    }
  }

  const winRateText = (s: StrategyOverviewRow) => (s.tradeCount > 0 ? `${Math.round(s.winRate)}%` : '—')
  const adherenceText = (s: StrategyOverviewRow) => (s.adherence !== null ? `${Math.round(s.adherence)}%` : '—')

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('strategies.search')}
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            <button
              onClick={() => switchView('cards')}
              aria-label={t('strategies.view.cards')}
              className={cn('rounded p-1.5', view === 'cards' ? 'bg-accent text-foreground' : 'text-muted-foreground')}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => switchView('list')}
              aria-label={t('strategies.view.list')}
              className={cn('rounded p-1.5', view === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground')}
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
          {strategies.length > 0 && (
            <button
              onClick={openNew}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              {t('strategies.new')}
            </button>
          )}
        </div>
      </div>

      {strategies.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Target className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-sm font-semibold">{t('strategies.empty.title')}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t('strategies.empty.description')}</p>
          <button
            onClick={openNew}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('strategies.empty.cta')}
          </button>
        </div>
      ) : view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => (
            <Link
              key={s.id}
              href={`/strategies/${s.id}`}
              className="group block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              {/* Title */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 truncate font-medium">{s.name}</h3>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <IconBtn label={t('strategies.edit')} onClick={() => openEdit(s)} icon={Pencil} />
                  <IconBtn label={t('strategies.delete.confirm')} onClick={() => remove(s)} icon={Trash2} danger />
                </div>
              </div>
              {/* Two groups under the title, vertically centred: metrics · chart */}
              <div className="mt-3 flex items-center gap-4 border-t border-border pt-3">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 text-xs">
                  <Metric label={t('strategies.stats.trades')} value={String(s.tradeCount)} />
                  <Metric
                    label={t('strategies.stats.netPnl')}
                    value={formatCurrency(s.netPnl)}
                    valueClass={s.netPnl > 0 ? 'text-profit' : s.netPnl < 0 ? 'text-loss' : undefined}
                  />
                  <Metric label={t('strategies.stats.winRate')} value={winRateText(s)} />
                  <Metric label={t('strategies.stats.adherence')} value={adherenceText(s)} />
                </div>
                <div className="w-1/2 max-w-[180px] shrink-0">
                  <AreaSparkline points={s.daily.map((d) => d.cumulative)} className="h-14 w-full" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <SortableTh
                  label={t('strategies.list.name')}
                  column="name"
                  activeColumn={sortKey}
                  sortOrder={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label={t('strategies.stats.trades')}
                  column="tradeCount"
                  activeColumn={sortKey}
                  sortOrder={sortDir}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableTh
                  label={t('strategies.stats.netPnl')}
                  column="netPnl"
                  activeColumn={sortKey}
                  sortOrder={sortDir}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableTh
                  label={t('strategies.stats.winRate')}
                  column="winRate"
                  activeColumn={sortKey}
                  sortOrder={sortDir}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableTh
                  label={t('strategies.stats.adherence')}
                  column="adherence"
                  activeColumn={sortKey}
                  sortOrder={sortDir}
                  onSort={toggleSort}
                  align="right"
                />
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/strategies/${s.id}`)}
                  className="group cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.tradeCount}</td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right tabular-nums',
                      s.netPnl > 0 ? 'text-profit' : s.netPnl < 0 ? 'text-loss' : undefined,
                    )}
                  >
                    {formatCurrency(s.netPnl)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{winRateText(s)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{adherenceText(s)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <IconBtn
                        label={t('strategies.edit')}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEdit(s)
                        }}
                        icon={Pencil}
                      />
                      <IconBtn
                        label={t('strategies.delete.confirm')}
                        onClick={(e) => {
                          e.stopPropagation()
                          remove(s)
                        }}
                        icon={Trash2}
                        danger
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <StrategyFormModal strategy={modal.strategy} onClose={() => setModal(null)} onSaved={() => router.refresh()} />
      )}
    </div>
  )
}

function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className={cn('tabular-nums font-medium text-foreground', valueClass)}>{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  )
}

function IconBtn({
  label,
  onClick,
  icon: Icon,
  danger,
}: {
  label: string
  onClick: (e: React.MouseEvent) => void
  icon: typeof Pencil
  danger?: boolean
}) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault()
        onClick(e)
      }}
      aria-label={label}
      className={cn('rounded p-1 text-muted-foreground', danger ? 'hover:text-loss' : 'hover:text-foreground')}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
