'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { useTableSort } from '@/hooks/useTableSort'
import {
  Plus,
  Pencil,
  Upload,
  FilePlus2,
  Archive,
  ArchiveRestore,
  Eraser,
  Trash2,
  Eye,
  EyeOff,
  ArrowRightLeft,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { t, tRich } from '@/i18n'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import Select from '@/components/ui/Select'
import ActionMenu, { type ActionMenuItem } from '@/components/ui/ActionMenu'
import DataTable from '@/components/ui/DataTable'
import { accountColumns, balanceOf } from '@/components/accounts/accountColumns'
import Dialog from '@/components/ui/Dialog'
import {
  updateAccount,
  deleteAccount,
  setAccountArchived,
  clearAccountTrades,
  transferTrades,
  type AccountWithStats,
  type AccountInput,
} from '@/lib/actions/accounts'

// ─── Accounts list ────────────────────────────────────────────────────────────

const ACCOUNT_SORT_KEYS = ['name', 'balance', 'createdAt'] as const

interface AccountsListProps {
  accounts: AccountWithStats[]
  title: string
  subtitle?: string
}

const inputClass =
  'w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
const labelClass = 'mb-1 block text-xs font-medium text-muted-foreground'

export default function AccountsList({ accounts, title, subtitle }: AccountsListProps) {
  const router = useRouter()
  const confirm = useConfirm()
  const { sortBy, sortOrder, toggleSort } = useTableSort({
    storageKey: 'tradenza-accounts-sort',
    defaultSortBy: 'createdAt',
    defaultSortOrder: 'desc',
    validSortKeys: ACCOUNT_SORT_KEYS,
  })
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<AccountWithStats | null>(null)
  const [form, setForm] = useState<AccountInput | null>(null)
  const [saving, setSaving] = useState(false)
  const [transferring, setTransferring] = useState<AccountWithStats | null>(null)
  const [transferTarget, setTransferTarget] = useState('')
  const [transferSaving, setTransferSaving] = useState(false)

  const rows = useMemo(() => {
    const filtered = accounts.filter((r) => showArchived || !r.archived)
    return [...filtered].sort((a, b) => {
      let cmp: number
      if (sortBy === 'name') cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      else if (sortBy === 'balance') cmp = balanceOf(a) - balanceOf(b)
      else cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [accounts, showArchived, sortBy, sortOrder])

  const activeCount = accounts.filter((r) => !r.archived).length
  const isLastActive = (a: AccountWithStats) => !a.archived && activeCount === 1

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      if (handleRateLimit(await fn())) return
      toast.success(msg)
      router.refresh()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'accounts.toast.actionFailed'))
    }
  }

  const openEdit = (a: AccountWithStats) => {
    setEditing(a)
    setForm({
      name: a.name,
      firm: a.firm ?? '',
      broker: a.broker ?? '',
      timezone: a.timezone ?? '',
      accountSize: a.accountSize ? Number(a.accountSize) : '',
      phase: a.phase ?? '',
      startingBalance: a.startingBalance ? Number(a.startingBalance) : '',
      currency: a.currency,
    })
  }

  const submitEdit = async () => {
    if (!editing || !form) return
    if (!form.name.trim()) {
      toast.error(t('accounts.toast.nameRequired'))
      return
    }
    setSaving(true)
    try {
      if (handleRateLimit(await updateAccount(editing.id, form))) return
      toast.success(t('accounts.toast.updated'))
      setEditing(null)
      router.refresh()
    } catch (e) {
      toast.error(getActionErrorMessage(e, 'accounts.toast.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const submitTransfer = async () => {
    if (!transferring || !transferTarget) return
    setTransferSaving(true)
    try {
      const res = await transferTrades(transferring.id, transferTarget)
      if (handleRateLimit(res)) return
      const target = accounts.find((a) => a.id === transferTarget)
      toast.success(t('tradingAccounts.toast.transferred', { count: res.moved, name: target?.name ?? '' }))
      setTransferring(null)
      router.refresh()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'tradingAccounts.toast.transferFailed'))
    } finally {
      setTransferSaving(false)
    }
  }

  const onMenu = async (a: AccountWithStats, key: string) => {
    switch (key) {
      case 'edit':
        openEdit(a)
        break
      case 'fileUpload':
        router.push(`/add-trade/${a.id}?mode=upload`)
        break
      case 'manualUpload':
        router.push(`/add-trade/${a.id}?mode=manual`)
        break
      case 'transferData':
        setTransferTarget('')
        setTransferring(a)
        break
      case 'archive': {
        if (!a.archived && isLastActive(a)) {
          const ok = await confirm({
            title: t('tradingAccounts.confirmArchiveTitle'),
            message: (
              <>
                {tRich('tradingAccounts.confirmArchiveLast', { name: a.name })} {t('tradingAccounts.lastAccountNote')}
              </>
            ),
            confirmLabel: t('tradingAccounts.rowMenu.archiveAccount'),
            danger: true,
          })
          if (!ok) break
        }
        act(
          () => setAccountArchived(a.id, !a.archived),
          a.archived ? t('accounts.toast.restored') : t('accounts.toast.archived'),
        )
        break
      }
      case 'clearTrades': {
        const ok = await confirm({
          title: t('tradingAccounts.rowMenu.clearTrades'),
          message: tRich('tradingAccounts.confirmClear', { name: a.name }),
          confirmLabel: t('common.clear'),
          danger: true,
        })
        if (ok) act(() => clearAccountTrades(a.id), t('tradingAccounts.toast.cleared'))
        break
      }
      case 'deleteAccount': {
        const ok = await confirm({
          title: t('tradingAccounts.rowMenu.deleteAccount'),
          message: (
            <>
              {tRich('accounts.confirmDelete', { name: a.name })}
              {isLastActive(a) && <> {t('tradingAccounts.lastAccountNote')}</>}
            </>
          ),
          variant: 'delete',
        })
        if (ok) act(() => deleteAccount(a.id), t('accounts.toast.deleted'))
        break
      }
    }
  }

  const rowMenu = (r: AccountWithStats): ActionMenuItem[] => [
    { key: 'edit', label: t('tradingAccounts.rowMenu.edit'), icon: Pencil },
    { key: 'fileUpload', label: t('tradingAccounts.rowMenu.fileUpload'), icon: Upload },
    { key: 'manualUpload', label: t('tradingAccounts.rowMenu.manualUpload'), icon: FilePlus2 },
    ...(r.tradeCount > 0
      ? [
          {
            key: 'transferData',
            label: t('tradingAccounts.rowMenu.transferData'),
            icon: ArrowRightLeft,
          } as ActionMenuItem,
        ]
      : []),
    {
      key: 'archive',
      label: r.archived ? t('tradingAccounts.rowMenu.restoreAccount') : t('tradingAccounts.rowMenu.archiveAccount'),
      icon: r.archived ? ArchiveRestore : Archive,
    },
    {
      key: 'clearTrades',
      label: t('tradingAccounts.rowMenu.clearTrades'),
      icon: Eraser,
      danger: true,
      separatorBefore: true,
    },
    { key: 'deleteAccount', label: t('tradingAccounts.rowMenu.deleteAccount'), icon: Trash2, danger: true },
  ]

  const headerMenu: ActionMenuItem[] = [
    {
      key: 'toggleArchived',
      label: showArchived ? t('tradingAccounts.hideArchived') : t('tradingAccounts.showArchived'),
      icon: showArchived ? EyeOff : Eye,
    },
  ]

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Card header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/trade-import"
            className="flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            {t('tradingAccounts.addAccount')}
          </Link>
          <ActionMenu
            items={headerMenu}
            width={208}
            align="right"
            onSelect={(k) => {
              if (k === 'toggleArchived') setShowArchived((s) => !s)
            }}
          />
        </div>
      </div>

      <DataTable
        bordered={false}
        data={rows}
        rowKey={(r) => r.id}
        manualSorting
        sort={{ by: sortBy, order: sortOrder }}
        onSortChange={(next) => toggleSort(next.by)}
        empty={t('tradingAccounts.empty')}
        rowClassName={(r) => (r.archived ? 'opacity-50' : undefined)}
        columns={accountColumns}
        actionsClassName="w-24"
        actions={(r) => (
          <div className="flex items-center justify-end gap-1">
            <Link
              href={`/add-trade/${r.id}`}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              aria-label={t('tradingAccounts.addTrade')}
              title={t('tradingAccounts.addTrade')}
            >
              <Plus className="h-4 w-4" />
            </Link>
            <ActionMenu items={rowMenu(r)} width={208} align="right" onSelect={(k) => onMenu(r, k)} />
          </div>
        )}
      />

      {/* Transfer dialog */}
      {transferring &&
        (() => {
          const targets = accounts.filter((a) => a.id !== transferring.id && !a.archived)
          return (
            <Dialog onClose={() => setTransferring(null)}>
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <ArrowRightLeft className="h-4 w-4" />
                  {t('tradingAccounts.transfer.title')}
                </h2>
                <button onClick={() => setTransferring(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4 px-6 py-5">
                <p className="text-sm text-muted-foreground">
                  {t('tradingAccounts.transfer.description', {
                    name: transferring.name,
                    count: transferring.tradeCount,
                  })}
                </p>
                {targets.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                    {t('tradingAccounts.transfer.noTargets')}
                  </p>
                ) : (
                  <div>
                    <label className={labelClass}>{t('tradingAccounts.transfer.targetLabel')}</label>
                    <Select
                      value={transferTarget}
                      onValueChange={setTransferTarget}
                      placeholder={t('tradingAccounts.transfer.targetPlaceholder')}
                      options={targets.map((a) => ({ value: a.id, label: a.name }))}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
                <button
                  onClick={() => setTransferring(null)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  {t('accounts.cancel')}
                </button>
                <button
                  onClick={submitTransfer}
                  disabled={transferSaving || !transferTarget || targets.length === 0}
                  className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {transferSaving ? t('tradingAccounts.transfer.submitting') : t('tradingAccounts.transfer.submit')}
                </button>
              </div>
            </Dialog>
          )
        })()}

      {/* Edit dialog */}
      {editing && form && (
        <Dialog onClose={() => setEditing(null)} className="max-w-lg">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-base">{t('accounts.editTitle')}</h2>
            <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className={labelClass}>{t('accounts.name')} *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('accounts.firm')}</label>
                <input
                  value={form.firm as string}
                  onChange={(e) => setForm({ ...form, firm: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t('accounts.phase')}</label>
                <input
                  value={form.phase as string}
                  onChange={(e) => setForm({ ...form, phase: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>{t('accounts.accountSize')}</label>
                <input
                  type="number"
                  step="any"
                  value={form.accountSize as number | string}
                  onChange={(e) =>
                    setForm({ ...form, accountSize: e.target.value === '' ? '' : Number(e.target.value) })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t('accounts.startingBalance')}</label>
                <input
                  type="number"
                  step="any"
                  value={form.startingBalance as number | string}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      startingBalance: e.target.value === '' ? '' : Number(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t('accounts.currency')}</label>
                {/* USD-only for now — locked so all amounts stay in one currency. */}
                <input value="USD" readOnly disabled aria-readonly className={cn(inputClass, 'opacity-70')} />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
            <button
              onClick={() => setEditing(null)}
              className="text-sm px-4 py-2 text-muted-foreground hover:text-foreground"
            >
              {t('accounts.cancel')}
            </button>
            <button
              onClick={submitEdit}
              disabled={saving}
              className="bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? t('accounts.saving') : t('accounts.save')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
