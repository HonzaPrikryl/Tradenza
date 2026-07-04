'use client'

import { useState } from 'react'
import { useClerk } from '@clerk/nextjs'
import { toast } from 'sonner'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { t, tRich } from '@/i18n'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { deleteMyAccount } from '@/lib/actions/account'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'

export default function DangerZone() {
  const clerk = useClerk()
  const confirm = useConfirm()
  const [deleting, setDeleting] = useState(false)

  const onDelete = async () => {
    const ok = await confirm({
      title: t('settings.danger.confirm.title'),
      message: tRich('settings.danger.confirm.message'),
      confirmLabel: t('settings.danger.confirm.confirmLabel'),
      danger: true,
    })
    if (!ok) return

    setDeleting(true)
    try {
      const res = await deleteMyAccount()
      if (handleRateLimit(res)) {
        setDeleting(false)
        return
      }
      toast.success(t('settings.danger.deleted'))
      // Sign out and leave the app; the account and all data are now gone.
      await clerk.signOut({ redirectUrl: '/' })
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'settings.danger.error'))
      setDeleting(false)
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-destructive/40 bg-destructive/5">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('settings.danger.title')}</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{t('settings.danger.description')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-60"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {t('settings.danger.button')}
        </button>
      </div>
    </section>
  )
}
