'use client'

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { parseTradeBundle, MAX_BUNDLE_BYTES, type TradeBundle } from '@/lib/trade-bundle'
import type { BundleImportResult } from '@/lib/actions/import-bundle'
import ImportResultCard from '@/components/trade-import/ImportResultCard'
import Dialog from '@/components/ui/Dialog'
import BundleImportPanel from './BundleImportPanel'
import { X } from 'lucide-react'

interface Picked {
  filename: string
  bundle: TradeBundle
}

/**
 * Restore a Tradenza backup into a chosen account.
 *
 * The file is parsed in the browser before anything is sent, so "this isn't a
 * Tradenza export" costs a round trip to nowhere and the user sees what they
 * are about to import before committing. The account picker is deliberately
 * explicit: a backup has no opinion about where it belongs, and silently
 * defaulting would put a prop-firm journal in a live account.
 */
export default function ImportBundleButton({
  accounts,
  className,
}: {
  accounts: { id: string; name: string }[]
  className?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [result, setResult] = useState<BundleImportResult | null>(null)

  const clear = () => {
    setPicked(null)
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const close = () => {
    setOpen(false)
    clear()
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BUNDLE_BYTES) {
      toast.error(t('trades.backup.tooLarge'))
      return
    }
    try {
      const parsed = parseTradeBundle(await file.text())
      if (!parsed.ok) {
        toast.error(t(`trades.backup.error.${parsed.reason}`))
        setPicked(null)
        return
      }
      setPicked({ filename: file.name, bundle: parsed.bundle })
    } catch {
      toast.error(t('trades.backup.error.unreadable'))
      setPicked(null)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent',
          className,
        )}
      >
        <Upload className="h-3.5 w-3.5" />
        {t('trades.backup.importCta')}
      </button>

      {open && (
        <Dialog onClose={close} className="flex flex-col overflow-y-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-base font-semibold">{t('trades.backup.importTitle')}</h2>
            <button
              onClick={close}
              aria-label={t('common.close')}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {result ? (
              <ImportResultCard
                className="border-0 bg-transparent p-0"
                outcome={{
                  total: result.total,
                  imported: result.imported,
                  duplicates: result.duplicates,
                  skipped: result.failed,
                  errors: result.errors,
                }}
                warning={
                  result.imagesSkipped > 0
                    ? t('trades.importResult.imagesSkipped', { count: result.imagesSkipped })
                    : null
                }
                actions={
                  <button
                    onClick={clear}
                    className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    {t('trades.importResult.importAnother')}
                  </button>
                }
              />
            ) : (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    {t('trades.backup.file')}
                  </label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => onFile(e.target.files?.[0])}
                    className="block w-full cursor-pointer rounded-md border border-border bg-input/40 px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary-foreground"
                  />
                </div>

                {picked ? (
                  <BundleImportPanel
                    key={picked.filename}
                    bundle={picked.bundle}
                    filename={picked.filename}
                    accounts={accounts}
                    onResult={setResult}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{t('trades.backup.importHelp')}</p>
                )}
              </>
            )}
          </div>
        </Dialog>
      )}
    </>
  )
}
