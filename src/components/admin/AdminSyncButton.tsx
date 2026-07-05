'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { syncUsersAction } from '@/app/(app)/admin/actions'

// Explicit, observable trigger for the destructive Clerk reconcile. Kept off the
// page render path on purpose — the admin decides when to self-heal the mirror.
export default function AdminSyncButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const res = await syncUsersAction()
      if (res.ok) {
        toast.success(res.removed > 0 ? t('admin.sync.removed', { count: res.removed }) : t('admin.sync.upToDate'))
        if (res.removed > 0) router.refresh()
      } else {
        toast.error(res.reason === 'skipped' ? t('admin.sync.skipped') : t('admin.sync.error'))
      }
    })
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm',
        'text-muted-foreground transition-colors hover:text-foreground hover:bg-accent disabled:opacity-60',
      )}
    >
      <RefreshCw className={cn('h-4 w-4', pending && 'animate-spin')} />
      {pending ? t('admin.sync.syncing') : t('admin.sync.button')}
    </button>
  )
}
