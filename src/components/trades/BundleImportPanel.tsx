'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, FileJson } from 'lucide-react'
import { toast } from 'sonner'
import { t } from '@/i18n'
import { track } from '@/lib/analytics'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { importTradesBundle, type BundleImportResult } from '@/lib/actions/import-bundle'
import type { TradeBundle } from '@/lib/trade-bundle'
import Select from '@/components/ui/Select'

/**
 * What a bundle will bring with it, counted from the parsed file.
 *
 * Shown before the import runs: a backup is opaque by nature, and "1 240
 * trades, 6 strategies" is the difference between confidently restoring the
 * right file and hoping. Attached images are counted as "images" rather than
 * "screenshots" — the field holds whatever the trader pinned to the trade.
 */
export function bundleSummary(bundle: TradeBundle) {
  return {
    trades: bundle.trades.length,
    strategies: bundle.strategies.length,
    tags: new Set(bundle.trades.flatMap((tr) => tr.tags.map((tag) => `${tag.group ?? ''}/${tag.name}`))).size,
    images: bundle.trades.reduce((s, tr) => s + tr.screenshots.length, 0),
  }
}

interface Props {
  bundle: TradeBundle
  filename: string
  /** Fixed destination (the wizard already picked one). */
  accountId?: string
  /** Offer a picker instead, when the destination is still open. */
  accounts?: { id: string; name: string }[]
  /**
   * Called once the import has run. The panel does not render the outcome
   * itself: where the result card belongs differs per caller — full-page in the
   * wizard, inside the dialog on the trades page — and only the caller knows
   * what else has to disappear to make room for it.
   */
  onResult: (result: BundleImportResult) => void
}

/**
 * The body of a backup import: what's in the file, where it's going, and what
 * happened. Shared by the trades-page dialog and the import wizard, so a
 * backup behaves identically however the user arrived at it.
 */
export default function BundleImportPanel({ bundle, filename, accountId, accounts, onResult }: Props) {
  const router = useRouter()
  const [target, setTarget] = useState(accountId ?? accounts?.[0]?.id ?? '')
  const [busy, setBusy] = useState(false)

  const summary = bundleSummary(bundle)
  const destination = accountId ?? target

  const run = async () => {
    if (!destination || busy) return
    setBusy(true)
    try {
      const res = await importTradesBundle({ accountId: destination, filename, bundle })
      if (handleRateLimit(res)) return
      onResult(res)
      track({ name: 'trades_imported', props: { source: 'bundle', count: res.imported } })
      if (res.imported > 0) {
        toast.success(t('trades.backup.imported', { count: res.imported }))
        router.refresh()
      } else if (res.duplicates > 0) {
        toast.info(t('trades.backup.allDuplicates'))
      }
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'trades.backup.importFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('trades.backup.importHelp')}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <FileJson className="h-3.5 w-3.5 text-primary" />
          {filename}
        </span>
        <span>{t('trades.backup.summary.trades', { count: summary.trades })}</span>
        <span>{t('trades.backup.summary.strategies', { count: summary.strategies })}</span>
        <span>{t('trades.backup.summary.tags', { count: summary.tags })}</span>
        <span>{t('trades.backup.summary.images', { count: summary.images })}</span>
      </div>

      {accounts && !accountId && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t('trades.backup.targetAccount')}
          </label>
          <Select
            value={target}
            onValueChange={setTarget}
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            placeholder={t('trades.bulk.selectAccount')}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('trades.backup.duplicateNote')}</p>

      <button
        type="button"
        onClick={run}
        disabled={busy || !destination}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? t('trades.backup.running') : t('trades.backup.importConfirm')}
      </button>
    </div>
  )
}
