'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Loader2 } from 'lucide-react'
import { t, tRich } from '@/i18n'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { deleteImport } from '@/lib/actions/wizard'
import { getActionErrorMessage } from '@/lib/action-error-message'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'

interface DeleteImportButtonProps {
  id: string
  filename: string
  trades: number
}

export default function DeleteImportButton({ id, filename, trades }: DeleteImportButtonProps) {
  const router = useRouter()
  const confirm = useConfirm()
  const [deleting, setDeleting] = useState(false)

  const onDelete = async () => {
    const ok = await confirm({
      title: t('settings.importHistory.deleteConfirm.title'),
      message:
        trades > 0
          ? tRich('settings.importHistory.deleteConfirm.message', { filename, count: trades })
          : tRich('settings.importHistory.deleteConfirm.messageNoTrades', { filename }),
      confirmLabel: t('settings.importHistory.deleteConfirm.confirmLabel'),
      danger: true,
    })
    if (!ok) return

    setDeleting(true)
    try {
      const res = await deleteImport(id)
      if (handleRateLimit(res)) return
      toast.success(t('settings.importHistory.toast.deleted', { count: res.deletedTrades }))
      router.refresh()
    } catch (err) {
      toast.error(getActionErrorMessage(err, 'settings.importHistory.toast.deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <button
      onClick={onDelete}
      disabled={deleting}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
        'hover:bg-loss/10 hover:text-loss disabled:opacity-50',
      )}
      aria-label={t('settings.importHistory.delete')}
      title={t('settings.importHistory.delete')}
    >
      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  )
}
