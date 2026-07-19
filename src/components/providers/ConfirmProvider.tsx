'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import Dialog from '@/components/ui/Dialog'

export interface ConfirmOptions {
  title?: string
  message?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /**
   * Preset for the most common case. `'delete'` styles the dialog as destructive
   * (red confirm button) and defaults the confirm label to "Delete" — so a delete
   * confirmation is just `confirm({ variant: 'delete', title, message })`. Any
   * explicit `danger`/`confirmLabel` still override the preset.
   */
  variant?: 'delete'
}

type ConfirmFn = (opts?: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((options = {}) => {
    setOpts(options)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const finish = useCallback((result: boolean) => {
    resolver.current?.(result)
    resolver.current = null
    setOpts(null)
  }, [])

  // Resolve the preset once: `variant: 'delete'` → destructive styling + "Delete"
  // label, unless the caller overrides danger/confirmLabel explicitly.
  const danger = opts ? (opts.danger ?? opts.variant === 'delete') : false
  const confirmLabel = opts?.confirmLabel ?? (opts?.variant === 'delete' ? t('common.delete') : t('common.confirm'))

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <Dialog onClose={() => finish(false)} onEnter={() => finish(true)} z="z-[200]">
          <div className="flex items-start justify-between gap-3 px-6 pt-5">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  danger ? 'bg-loss/15 text-loss' : 'bg-primary/15 text-primary',
                )}
              >
                <AlertTriangle className="h-4.5 w-4.5" />
              </span>
              <h2 className="pt-1.5 text-base font-semibold">{opts.title ?? t('common.confirmTitle')}</h2>
            </div>
            <button
              onClick={() => finish(false)}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t('common.cancel')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {opts.message && <p className="px-6 pl-[4.5rem] pt-2 text-sm text-muted-foreground">{opts.message}</p>}

          <div className="mt-5 flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            <button
              onClick={() => finish(false)}
              className="px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {opts.cancelLabel ?? t('common.cancel')}
            </button>
            <button
              autoFocus
              onClick={() => finish(true)}
              className={cn(
                'rounded-md px-5 py-2 text-sm font-medium text-white transition-colors',
                danger ? 'bg-loss hover:bg-loss/90' : 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  )
}
