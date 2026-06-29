'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Dialog from '@/components/ui/Dialog'
import Link from 'next/link'
import {
  Calendar,
  ChevronDown,
  DollarSign,
  Filter,
  Settings,
  Wallet,
  Check,
  X,
  Menu,
  MoreHorizontal,
  ChevronRight,
  Info,
} from 'lucide-react'
import { format } from 'date-fns'
import { setAccountsFilter, setDateRangeFilter, setDisplayUnit, resetFilters } from '@/lib/global-filters'
import type { GlobalFilters, DisplayUnit } from '@/lib/global-filters-types'
import type { TagGroupWithValues } from '@/lib/actions/tags'
import DateRangePicker from '@/components/ui/DateRangePicker'
import FiltersPanel from '@/components/ui/FiltersPanel'
import { useSidebar } from '@/components/layout/SidebarContext'
import MobileSheet from '@/components/layout/MobileSheet'
import Logo from '@/components/ui/Logo'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

interface AccountOpt {
  id: string
  name: string
}

interface Props {
  accounts: AccountOpt[]
  tagGroups: TagGroupWithValues[]
  filters: GlobalFilters
  symbols: string[]
}

const prettyDate = (s?: string) => (s ? format(new Date(s), 'd. M. yyyy') : null)

function MenuRow({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 hover:bg-accent transition-colors"
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
      <span className="ml-auto text-xs text-muted-foreground truncate max-w-[150px]">{value}</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  )
}

// ─── Reusable dropdown (desktop) ──────────────────────────────────────────────

function Dropdown({
  name,
  openId,
  setOpenId,
  trigger,
  children,
  align = 'left',
  width = 'w-64',
}: {
  name: string
  openId: string | null
  setOpenId: (v: string | null) => void
  trigger: React.ReactNode
  children: (close: () => void) => React.ReactNode
  align?: 'left' | 'right'
  width?: string
}) {
  const open = openId === name
  const ref = useRef<HTMLDivElement>(null)
  const close = () => setOpenId(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!target) return
      if (ref.current && ref.current.contains(target)) return
      if (target.closest?.('[data-radix-popper-content-wrapper]')) return
      if (document.querySelector('[data-radix-popper-content-wrapper],[data-open-dropdown]')) return
      close()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpenId(open ? null : name)}
        className={cn(
          'flex items-center gap-2 h-9 px-3 rounded-md border border-border text-sm transition-colors',
          open ? 'bg-accent' : 'bg-card hover:bg-accent',
        )}
      >
        {trigger}
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          className={cn(
            'absolute z-40 mt-1.5 bg-popover border border-border rounded-lg shadow-2xl p-2',
            width,
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}

export default function AppHeader({ accounts, tagGroups, filters, symbols }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const { toggle } = useSidebar()
  const [isPending, startTransition] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'accounts' | 'actions' | null>(null)
  const [actionView, setActionView] = useState<'menu' | 'date' | 'filters' | 'unit'>('menu')
  const [unitInfoOpen, setUnitInfoOpen] = useState(false)

  const onTrades = (pathname?.startsWith('/trades') || pathname?.startsWith('/stats')) ?? false

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn()
      router.refresh()
    })

  // — Account label —
  const selectedAccountIds =
    filters.accountIds && filters.accountIds.length > 0
      ? filters.accountIds.filter((id) => accounts.some((a) => a.id === id))
      : filters.accountIds

  useEffect(() => {
    if (!filters.accountIds || filters.accountIds.length === 0) return
    const valid = filters.accountIds.filter((id) => accounts.some((a) => a.id === id))
    if (valid.length !== filters.accountIds.length) {
      run(() => setAccountsFilter(valid.length ? valid : null))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, filters.accountIds])

  const accountLabel =
    !selectedAccountIds || selectedAccountIds.length === 0
      ? t('header.allAccounts')
      : selectedAccountIds.length === 1
        ? (accounts.find((a) => a.id === selectedAccountIds[0])?.name ?? t('header.accountsCount', { count: 1 }))
        : t('header.accountsCount', { count: selectedAccountIds.length })

  const toggleAccount = (id: string) => {
    const cur = selectedAccountIds ?? []
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    run(() => setAccountsFilter(next.length ? next : null))
  }

  const dateLabel =
    filters.dateFrom || filters.dateTo
      ? `${prettyDate(filters.dateFrom) ?? '…'} – ${prettyDate(filters.dateTo) ?? '…'}`
      : t('header.wholePeriod')

  const unitLabel = filters.unit === 'r' ? t('header.unitR') : t('header.unitDollar')

  const activeQuickCount =
    (filters.sides.length > 0 ? 1 : 0) +
    (filters.statuses.length > 0 ? 1 : 0) +
    (filters.outcomes.length > 0 ? 1 : 0) +
    (filters.instruments.length > 0 ? 1 : 0) +
    (filters.symbolsInclude.length > 0 || filters.symbolsExclude.length > 0 ? 1 : 0) +
    (filters.ratings.length > 0 ? 1 : 0) +
    (filters.rMin !== undefined || filters.rMax !== undefined || filters.rNone ? 1 : 0) +
    (filters.daysOfWeek.length > 0 ? 1 : 0) +
    (filters.months.length > 0 ? 1 : 0) +
    (filters.durationMin !== undefined || filters.durationMax !== undefined ? 1 : 0) +
    (filters.entryTimeRanges.length > 0 ? 1 : 0) +
    (filters.exitTimeRanges.length > 0 ? 1 : 0) +
    (filters.tagInclude.length > 0 ? 1 : 0) +
    (filters.excludeTags.length > 0 ? 1 : 0)

  const renderAccounts = () => (
    <div className="space-y-0.5">
      <button
        onClick={() => run(() => setAccountsFilter(null))}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent"
      >
        <span
          className={cn(
            'w-4 h-4 rounded border border-border flex items-center justify-center',
            (!selectedAccountIds || selectedAccountIds.length === 0) && 'bg-primary border-primary',
          )}
        >
          {(!selectedAccountIds || selectedAccountIds.length === 0) && (
            <Check className="w-3 h-3 text-primary-foreground" />
          )}
        </span>
        {t('header.allAccounts')}
      </button>
      <div className="h-px bg-border my-1" />
      <div className="max-h-64 overflow-y-auto space-y-0.5">
        {accounts.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">{t('header.noAccounts')}</p>}
        {accounts.map((a) => {
          const allSelected = !selectedAccountIds || selectedAccountIds.length === 0
          const checked = allSelected || (selectedAccountIds?.includes(a.id) ?? false)
          return (
            <button
              key={a.id}
              onClick={() => toggleAccount(a.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left"
            >
              <span
                className={cn(
                  'w-4 h-4 rounded border border-border flex items-center justify-center shrink-0',
                  checked && 'bg-primary border-primary',
                )}
              >
                {checked && <Check className="w-3 h-3 text-primary-foreground" />}
              </span>
              <span className="truncate">{a.name}</span>
            </button>
          )
        })}
      </div>
      <div className="h-px bg-border my-1" />
      <Link
        href="/accounts"
        className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
      >
        <Settings className="w-3.5 h-3.5" />
        {t('header.manageAccounts')}
      </Link>
    </div>
  )

  const renderDate = (close: () => void) => (
    <DateRangePicker
      from={filters.dateFrom}
      to={filters.dateTo}
      onChange={(from, to) => {
        run(() => setDateRangeFilter(from, to))
        if (from && to) close()
      }}
    />
  )

  const renderFilters = (close: () => void) => (
    <FiltersPanel tagGroups={tagGroups} filters={filters} symbols={symbols} onClose={close} />
  )

  const renderUnit = (close: () => void) => (
    <div className="space-y-0.5">
      {(
        [
          ['dollar', t('header.unitDollar')],
          ['r', t('header.unitR')],
        ] as [DisplayUnit, string][]
      ).map(([val, label]) => (
        <button
          key={val}
          onClick={() => {
            run(() => setDisplayUnit(val))
            if (val === 'r') setUnitInfoOpen(true)
            close()
          }}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded text-sm hover:bg-accent"
        >
          {label}
          {filters.unit === val && <Check className="w-4 h-4 text-primary" />}
        </button>
      ))}
    </div>
  )

  const closeSheet = () => setSheet(null)

  return (
    <header className="flex items-center gap-2 flex-wrap border-b border-border bg-background/80 backdrop-blur px-4 sm:px-6 py-3 sticky top-0 z-30">
      <button
        onClick={toggle}
        className="lg:hidden flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card hover:bg-accent transition-colors shrink-0"
        aria-label={t('common.menu')}
      >
        <Menu className="w-4 h-4" />
      </button>
      <Link href="/dashboard" className="lg:hidden flex items-center mr-1 shrink-0">
        <Logo variant="icon" className="h-8 sm:hidden" priority />
        <Logo variant="expand" className="h-10 hidden sm:flex" priority />
      </Link>

      <div className="hidden lg:flex items-center gap-2">
        <Dropdown
          name="accounts"
          openId={openId}
          setOpenId={setOpenId}
          width="w-72"
          trigger={
            <>
              <Wallet className="w-4 h-4 text-muted-foreground" />
              <span className="max-w-[140px] truncate">{accountLabel}</span>
            </>
          }
        >
          {() => renderAccounts()}
        </Dropdown>

        <Dropdown
          name="date"
          openId={openId}
          setOpenId={setOpenId}
          width="w-auto"
          trigger={
            <>
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="max-w-[180px] truncate">{dateLabel}</span>
              {(filters.dateFrom || filters.dateTo) && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={t('header.clearDate')}
                  onClick={(e) => {
                    e.stopPropagation()
                    run(() => setDateRangeFilter(undefined, undefined))
                  }}
                  className="-mr-1 ml-0.5 flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-loss/15 hover:text-loss"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
            </>
          }
        >
          {(close) => renderDate(close)}
        </Dropdown>

        <Dropdown
          name="filters"
          openId={openId}
          setOpenId={setOpenId}
          width="w-auto"
          trigger={
            <>
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span>{t('header.filters')}</span>
              {activeQuickCount > 0 && (
                <>
                  <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {activeQuickCount}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={t('header.clearFilters')}
                    onClick={(e) => {
                      e.stopPropagation()
                      run(() => resetFilters())
                    }}
                    className="-mr-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-loss/15 hover:text-loss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </span>
                </>
              )}
            </>
          }
        >
          {(close) => renderFilters(close)}
        </Dropdown>

        {!onTrades && (
          <Dropdown
            name="unit"
            openId={openId}
            setOpenId={setOpenId}
            width="w-44"
            trigger={
              <>
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <span>{unitLabel}</span>
              </>
            }
          >
            {(close) => renderUnit(close)}
          </Dropdown>
        )}
      </div>

      <div className="flex lg:hidden items-center gap-2 ml-auto">
        <button
          onClick={() => {
            setActionView('menu')
            setSheet('actions')
          }}
          className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card hover:bg-accent transition-colors"
          aria-label={t('header.filtersAndActions')}
        >
          <MoreHorizontal className="w-4 h-4" />
          {activeQuickCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
              {activeQuickCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setSheet('accounts')}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card hover:bg-accent transition-colors"
          aria-label={t('header.accountsAria')}
        >
          <Wallet className="w-4 h-4" />
        </button>
      </div>

      {isPending && <span className="text-xs text-muted-foreground hidden lg:inline">…</span>}

      <MobileSheet open={sheet === 'accounts'} title={t('header.allAccounts')} onClose={closeSheet}>
        {renderAccounts()}
      </MobileSheet>

      <MobileSheet
        open={sheet === 'actions'}
        title={
          actionView === 'menu'
            ? 'Options'
            : actionView === 'date'
              ? 'Date range'
              : actionView === 'filters'
                ? t('header.filters')
                : 'Display unit'
        }
        onClose={closeSheet}
        onBack={actionView === 'menu' ? undefined : () => setActionView('menu')}
      >
        {actionView === 'menu' && (
          <div className="space-y-1">
            <MenuRow
              icon={<Filter className="w-4 h-4 text-muted-foreground" />}
              label={t('header.filters')}
              value={activeQuickCount > 0 ? `${activeQuickCount} active` : 'None'}
              onClick={() => setActionView('filters')}
            />
            <MenuRow
              icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
              label="Date range"
              value={dateLabel}
              onClick={() => setActionView('date')}
            />
            {!onTrades && (
              <MenuRow
                icon={<DollarSign className="w-4 h-4 text-muted-foreground" />}
                label="Display unit"
                value={unitLabel}
                onClick={() => setActionView('unit')}
              />
            )}
          </div>
        )}

        {actionView === 'date' && (
          <div className="space-y-2">
            {(filters.dateFrom || filters.dateTo) && (
              <button
                onClick={() => {
                  run(() => setDateRangeFilter(undefined, undefined))
                  closeSheet()
                }}
                className="text-xs text-muted-foreground hover:text-loss"
              >
                {t('header.clearDateShort')}
              </button>
            )}
            {renderDate(closeSheet)}
          </div>
        )}

        {actionView === 'filters' && renderFilters(closeSheet)}

        {actionView === 'unit' && !onTrades && renderUnit(closeSheet)}
      </MobileSheet>

      {unitInfoOpen && (
        <Dialog onClose={() => setUnitInfoOpen(false)} z="z-[200]" className="max-w-sm rounded-xl p-5 animate-fade-in">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Info className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">{t('header.unitR')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('header.rMultipleInfo')}</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setUnitInfoOpen(false)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              {t('common.gotIt')}
            </button>
          </div>
        </Dialog>
      )}
    </header>
  )
}
