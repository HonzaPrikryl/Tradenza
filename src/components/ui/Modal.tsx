'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import Dialog from './Dialog'

/**
 * Opinionated modal built on {@link Dialog}: header with close button, body and
 * a footer with cancel + confirm actions. Labels are passed in so each caller
 * keeps its own i18n keys.
 */
export default function Modal({
  title,
  onClose,
  children,
  onConfirm,
  confirmLabel,
  confirmDisabled = false,
  cancelLabel,
  className,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  onConfirm: () => void
  confirmLabel: string
  confirmDisabled?: boolean
  cancelLabel: string
  className?: string
}) {
  return (
    <Dialog onClose={onClose} className={cn('flex flex-col overflow-y-hidden', className)}>
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-6 py-4">
        <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={confirmDisabled}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
