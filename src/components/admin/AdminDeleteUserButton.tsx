'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'
import Dialog from '@/components/ui/Dialog'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { deleteUserAction } from '@/app/(app)/admin/actions'

export default function AdminDeleteUserButton({ userId, email }: { userId: string; email: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [pending, startTransition] = useTransition()

  const expected = (email ?? '').trim().toLowerCase()
  const matches = expected.length > 0 && typed.trim().toLowerCase() === expected

  function close() {
    if (pending) return
    setOpen(false)
    setTyped('')
  }

  function onDelete() {
    if (!matches || pending) return
    startTransition(async () => {
      const res = await deleteUserAction(userId, typed)
      if (res.ok) {
        toast.success(t('admin.deleteUser.done', { email: res.email ?? userId }))
        if (!res.clerkDeleted) toast.warning(t('admin.deleteUser.clerkSkipped'))
        setOpen(false)
        setTyped('')
        router.refresh()
      } else {
        toast.error(t(`admin.deleteUser.error.${res.reason}`))
        setOpen(false)
        setTyped('')
      }
    })
  }

  const swallow = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <span onClick={swallow}>
      <button
        onClick={() => setOpen(true)}
        title={t('admin.deleteUser.button')}
        aria-label={t('admin.deleteUser.button')}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground',
          'transition-colors hover:bg-loss/10 hover:text-loss',
        )}
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {open && (
        <Dialog onClose={close} z="z-[200]">
          <div className="flex items-start justify-between gap-3 px-6 pt-5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-loss/15 text-loss">
                <AlertTriangle className="h-4.5 w-4.5" />
              </span>
              <h2 className="pt-1.5 text-base font-semibold">{t('admin.deleteUser.title')}</h2>
            </div>
            <button
              onClick={close}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t('common.cancel')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-6 pl-[4.5rem] pt-2">
            <p className="text-sm text-muted-foreground">{t('admin.deleteUser.warning')}</p>

            <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor="admin-delete-confirm">
              {t('admin.deleteUser.prompt', { email: email ?? '—' })}
            </label>
            <input
              id="admin-delete-confirm"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={typed}
              disabled={pending}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={email ?? ''}
              className={cn(
                'mt-1.5 w-full rounded-md border border-border bg-input/30 px-3 py-2 text-sm',
                'focus:border-primary focus:outline-none disabled:opacity-60',
              )}
            />
          </div>

          <div className="mt-5 flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            <button
              onClick={close}
              disabled={pending}
              className="px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={onDelete}
              disabled={!matches || pending}
              className={cn(
                'rounded-md bg-loss px-5 py-2 text-sm font-medium text-white transition-colors',
                'hover:bg-loss/90 disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              {pending ? t('admin.deleteUser.deleting') : t('admin.deleteUser.confirm')}
            </button>
          </div>
        </Dialog>
      )}
    </span>
  )
}
