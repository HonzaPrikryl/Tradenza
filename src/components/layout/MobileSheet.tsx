'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft } from 'lucide-react'
import { t } from '@/i18n'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  onBack?: () => void
  children: React.ReactNode
}

export default function MobileSheet({ open, title, onClose, onBack, children }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (onBack ?? onClose)()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, onBack])

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl animate-sheet-up">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {onBack && (
            <button
              onClick={onBack}
              className="-ml-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label={t('common.back')}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <h2 className="text-sm font-semibold flex-1 truncate">{title}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
